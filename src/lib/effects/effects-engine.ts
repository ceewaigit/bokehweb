/**
 * Effects Engine - Orchestrates all video effects
 * Clean architecture that delegates to specific effect detectors and appliers
 */

import { easeInOutQuad, easeOutExpo, easeInQuad } from '@/lib/utils/easing'
import { CameraController } from './camera-controller'
import { ZoomEffectDetector } from './detectors/zoom-detector'
import type {
  Effect,
  EffectState,
  ProjectEvent,
  RecordingContext,
  EffectDetector,
  ZoomEffect
} from './types'

export class EffectsEngine {
  private effects: Effect[] = []
  private detectors: Map<string, EffectDetector> = new Map()
  private events: ProjectEvent[] = []
  private context: RecordingContext | null = null

  // Camera controller for smooth zoom tracking
  private cameraController: CameraController

  // Configuration
  private debugMode = false
  private useSmartCamera = true

  constructor() {
    // Initialize camera controller
    this.cameraController = new CameraController({
      deadZoneSize: 0.3,
      responsiveness: 0.15,
      smoothingFactor: 0.85,
      predictiveStrength: 0.2,
      directionalBias: 0.7,
      edgeResistance: 0.8,
      minMovementThreshold: 5
    })
    this.cameraController.setDebugMode(this.debugMode)

    // Register default effect detectors
    this.registerDetector(new ZoomEffectDetector())
    // Future: this.registerDetector(new PanEffectDetector())
    // Future: this.registerDetector(new TransitionEffectDetector())
  }

  /**
   * Register an effect detector
   */
  registerDetector(detector: EffectDetector): void {
    this.detectors.set(detector.name, detector)
  }

  /**
   * Unregister an effect detector
   */
  unregisterDetector(name: string): void {
    this.detectors.delete(name)
  }

  /**
   * Initialize from recording
   */
  initializeFromRecording(recording: any, videoScale?: number, padding?: number): void {
    if (!recording) return

    console.log('[EffectsEngine] Initializing from recording:', {
      duration: recording.duration,
      hasMetadata: !!recording.metadata,
      mouseEvents: recording.metadata?.mouseEvents?.length || 0,
      clickEvents: recording.metadata?.clickEvents?.length || 0,
      padding
    })

    // Create context
    this.context = {
      duration: recording.duration || 0,
      width: recording.width || 1920,
      height: recording.height || 1080,
      frameRate: recording.frameRate || 60,
      metadata: recording.metadata || {},
      padding: padding
    }

    // Convert metadata to events
    this.events = this.convertMetadataToEvents(recording.metadata, this.context.width, this.context.height)
    
    console.log(`[EffectsEngine] Converted to ${this.events.length} events`)

    // Detect effects using all registered detectors
    this.detectAllEffects()
  }

  /**
   * Initialize from raw metadata (for preview)
   */
  initializeFromMetadata(metadata: any[], duration: number, width: number, height: number, videoScale?: number, padding?: number): void {
    // Create context
    this.context = {
      duration,
      width,
      height,
      frameRate: 60,
      metadata,
      padding: padding
    }

    // Extract events
    this.events = this.extractEvents(metadata, width, height)

    // Detect effects
    this.detectAllEffects()
  }

  /**
   * Detect effects using all registered detectors
   */
  private detectAllEffects(): void {
    if (!this.context) return

    this.effects = []

    // Run each detector - use Array.from() to avoid iterator issues
    const detectors = Array.from(this.detectors.values())
    for (const detector of detectors) {
      const detectedEffects = detector.detectEffects(this.events, this.context)
      this.effects.push(...detectedEffects)
    }

    // Sort effects by start time
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Get effect state at timestamp
   */
  getEffectState(timestamp: number): EffectState {
    const state: EffectState = {}

    // Find active effects at this timestamp
    const activeEffects = this.effects.filter(effect =>
      timestamp >= effect.startTime && timestamp <= effect.endTime
    )

    // Apply each active effect to the state
    for (const effect of activeEffects) {
      if (effect.type === 'zoom') {
        state.zoom = this.calculateZoomState(effect as ZoomEffect, timestamp)
      }
      // Future: Handle other effect types
    }

    // Default states if no effects active
    if (!state.zoom) {
      state.zoom = { x: 0.5, y: 0.5, scale: 1.0 }
    }

    return state
  }

  /**
   * Calculate zoom state at a specific timestamp
   */
  private calculateZoomState(zoom: ZoomEffect, timestamp: number): { x: number; y: number; scale: number } {
    const elapsed = timestamp - zoom.startTime
    const effectDuration = zoom.endTime - zoom.startTime
    const mousePos = this.getInterpolatedMousePosition(timestamp)

    let x: number, y: number, scale: number

    // Intro phase - zoom in
    if (elapsed < zoom.params.introMs) {
      const progress = elapsed / zoom.params.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (zoom.params.scale - 1.0) * eased
      
      // Always start from center (full view) and zoom to target
      x = 0.5 + (zoom.params.targetX - 0.5) * eased
      y = 0.5 + (zoom.params.targetY - 0.5) * eased

      if (this.useSmartCamera) {
        this.cameraController.setPosition(x, y)
      }
    }
    // Outro phase - zoom out
    else if (elapsed > effectDuration - zoom.params.outroMs) {
      const outroElapsed = elapsed - (effectDuration - zoom.params.outroMs)
      const progress = outroElapsed / zoom.params.outroMs
      const eased = easeInQuad(progress)

      scale = zoom.params.scale - (zoom.params.scale - 1.0) * eased

      if (this.useSmartCamera) {
        const currentCameraPos = this.cameraController.getPosition()
        x = currentCameraPos.x + (0.5 - currentCameraPos.x) * eased
        y = currentCameraPos.y + (0.5 - currentCameraPos.y) * eased
        this.cameraController.setPosition(x, y)
      } else {
        x = mousePos.x + (0.5 - mousePos.x) * eased
        y = mousePos.y + (0.5 - mousePos.y) * eased
      }
    }
    // Tracking phase
    else {
      scale = zoom.params.scale

      if (this.useSmartCamera) {
        const cameraPos = this.cameraController.getCameraPosition(
          mousePos.x,
          mousePos.y,
          scale,
          timestamp
        )
        x = cameraPos.x
        y = cameraPos.y
      } else {
        x = mousePos.x
        y = mousePos.y
      }
    }

    return { x, y, scale }
  }

  /**
   * Apply zoom to canvas
   */
  applyZoomToCanvas(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    zoom: { x: number; y: number; scale: number },
    currentTime?: number
  ) {
    const { width, height } = ctx.canvas
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height

    if (!sourceWidth || !sourceHeight) return

    const zoomWidth = sourceWidth / zoom.scale
    const zoomHeight = sourceHeight / zoom.scale

    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight

    const sx = centerX - (zoomWidth / 2)
    const sy = centerY - (zoomHeight / 2)

    // Clear and draw background if needed
    if (sx < 0 || sy < 0 || sx + zoomWidth > sourceWidth || sy + zoomHeight > sourceHeight) {
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.clearRect(0, 0, width, height)
    }

    // Calculate drawable region
    const actualSx = Math.max(0, sx)
    const actualSy = Math.max(0, sy)
    const actualSWidth = Math.min(sourceWidth - actualSx, zoomWidth - (actualSx - sx))
    const actualSHeight = Math.min(sourceHeight - actualSy, zoomHeight - (actualSy - sy))

    const dx = sx < 0 ? (-sx / zoomWidth) * width : 0
    const dy = sy < 0 ? (-sy / zoomHeight) * height : 0
    const dWidth = (actualSWidth / zoomWidth) * width
    const dHeight = (actualSHeight / zoomHeight) * height

    // Draw video
    if (actualSWidth > 0 && actualSHeight > 0) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(
        source as CanvasImageSource,
        actualSx, actualSy, actualSWidth, actualSHeight,
        dx, dy, dWidth, dHeight
      )
    }

    // Debug overlay
    if (this.debugMode && zoom.scale > 1.0) {
      this.drawDebugOverlay(ctx, zoom, currentTime)
    }
  }

  /**
   * Get interpolated mouse position
   */
  private getInterpolatedMousePosition(timestamp: number): { x: number; y: number } {
    if (!this.events || this.events.length === 0 || !this.context) {
      return { x: 0.5, y: 0.5 }
    }

    let before: ProjectEvent | null = null
    let after: ProjectEvent | null = null

    for (const event of this.events) {
      if (event.timestamp <= timestamp) {
        before = event
      } else {
        after = event
        break
      }
    }

    if (before && after) {
      const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
      const smoothProgress = easeInOutQuad(Math.min(1, Math.max(0, progress)))

      const beforeX = before.x / this.context.width
      const beforeY = before.y / this.context.height
      const afterX = after.x / this.context.width
      const afterY = after.y / this.context.height

      return {
        x: beforeX + (afterX - beforeX) * smoothProgress,
        y: beforeY + (afterY - beforeY) * smoothProgress
      }
    }

    if (before) {
      return {
        x: before.x / this.context.width,
        y: before.y / this.context.height
      }
    }

    if (after) {
      return {
        x: after.x / this.context.width,
        y: after.y / this.context.height
      }
    }

    return { x: 0.5, y: 0.5 }
  }

  /**
   * Convert metadata to events
   */
  private convertMetadataToEvents(metadata: any, width: number, height: number): ProjectEvent[] {
    const events: ProjectEvent[] = []

    if (metadata?.mouseEvents) {
      events.push(...metadata.mouseEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'move' as const,
        screenWidth: e.screenWidth || width,
        screenHeight: e.screenHeight || height
      })))
    }

    if (metadata?.clickEvents) {
      events.push(...metadata.clickEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'click' as const,
        button: e.button,
        screenWidth: width,
        screenHeight: height
      })))
    }

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Extract events from preview metadata
   */
  private extractEvents(metadata: any[], width: number, height: number): ProjectEvent[] {
    return metadata
      .filter((e: any) => e.eventType === 'mouse' || e.eventType === 'click')
      .map((e: any) => ({
        timestamp: e.timestamp,
        x: e.mouseX || e.x,
        y: e.mouseY || e.y,
        type: e.eventType === 'click' ? 'click' : 'move',
        screenWidth: e.windowWidth || e.screenWidth || width,
        screenHeight: e.windowHeight || e.screenHeight || height
      }))
  }

  /**
   * Draw debug overlay
   */
  private drawDebugOverlay(ctx: CanvasRenderingContext2D, zoom: { x: number; y: number; scale: number }, currentTime?: number) {
    const { width, height } = ctx.canvas

    ctx.save()

    // Dead zone visualization
    if (this.useSmartCamera) {
      const deadZone = this.cameraController.getDeadZoneVisualization(width, height)
      if (deadZone) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])
        ctx.strokeRect(deadZone.x, deadZone.y, deadZone.width, deadZone.height)
        ctx.setLineDash([])

        ctx.fillStyle = 'rgba(255, 255, 0, 0.05)'
        ctx.fillRect(deadZone.x, deadZone.y, deadZone.width, deadZone.height)

        ctx.fillStyle = 'rgba(255, 255, 0, 0.8)'
        ctx.font = 'bold 12px monospace'
        ctx.fillText('DEAD ZONE', deadZone.x + 5, deadZone.y + 15)
      }
    }

    // Camera center crosshair
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.lineWidth = 2
    const centerX = width / 2
    const centerY = height / 2

    ctx.beginPath()
    ctx.moveTo(centerX - 30, centerY)
    ctx.lineTo(centerX + 30, centerY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(centerX, centerY - 30)
    ctx.lineTo(centerX, centerY + 30)
    ctx.stroke()

    // Info panel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillRect(5, 5, 250, 90)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`Zoom: ${zoom.scale.toFixed(1)}x`, 10, 25)
    ctx.fillText(`Camera: (${zoom.x.toFixed(3)}, ${zoom.y.toFixed(3)})`, 10, 45)

    if (currentTime !== undefined) {
      const mousePos = this.getInterpolatedMousePosition(currentTime)
      ctx.fillText(`Mouse: (${mousePos.x.toFixed(3)}, ${mousePos.y.toFixed(3)})`, 10, 65)
    }

    // Show active detectors
    ctx.fillText(`Detectors: ${Array.from(this.detectors.keys()).join(', ')}`, 10, 85)

    ctx.restore()
  }

  // Public API
  getEffects(): Effect[] {
    return this.effects
  }

  setEffects(effects: Effect[]) {
    this.effects = effects
  }

  addEffect(effect: Effect) {
    this.effects.push(effect)
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }

  removeEffect(effectId: string) {
    this.effects = this.effects.filter(e => e.id !== effectId)
  }

  clearEffects() {
    this.effects = []
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled
    this.cameraController.setDebugMode(enabled)
  }

  setSmartCamera(enabled: boolean) {
    this.useSmartCamera = enabled
  }

  setPosition(x: number, y: number) {
    this.cameraController.setPosition(x, y)
  }

  getPosition() {
    return this.cameraController.getPosition()
  }

  /**
   * Legacy method for compatibility - converts effects to keyframes
   */
  getZoomKeyframes(recording: any): any[] {
    if (!recording) return []

    // Initialize if needed
    if (!this.context) {
      this.initializeFromRecording(recording)
    }

    const keyframes: any[] = []
    const zoomEffects = this.effects.filter(e => e.type === 'zoom') as ZoomEffect[]
    
    if (zoomEffects.length === 0) {
      // No zoom effects, return default keyframes
      return [
        { time: 0, zoom: 1.0, x: 0.5, y: 0.5, easing: 'linear' },
        { time: this.context?.duration || 0, zoom: 1.0, x: 0.5, y: 0.5, easing: 'linear' }
      ]
    }

    // Sort effects by start time
    const sortedEffects = [...zoomEffects].sort((a, b) => a.startTime - b.startTime)
    
    // Add initial keyframe if first zoom doesn't start at 0
    if (sortedEffects[0].startTime > 0) {
      keyframes.push({
        time: 0,
        zoom: 1.0,
        x: 0.5,
        y: 0.5,
        easing: 'linear'
      })
    }

    // Process each zoom effect
    sortedEffects.forEach((effect, index) => {
      const nextEffect = sortedEffects[index + 1]
      
      // Zoom in keyframe - with smooth intro
      keyframes.push({
        time: effect.startTime,
        zoom: effect.params.scale,
        x: effect.params.targetX,
        y: effect.params.targetY,
        easing: 'easeOut'
      })
      
      // Check if there's a gap before the next zoom or if this is the last one
      const hasGap = nextEffect ? (nextEffect.startTime - effect.endTime) > 1000 : true
      
      if (hasGap) {
        // Only add zoom out if there's a significant gap or it's the last effect
        keyframes.push({
          time: effect.endTime,
          zoom: 1.0,
          x: 0.5,
          y: 0.5,
          easing: 'easeIn'
        })
      } else {
        // Keep zoom level and transition directly to next zoom position
        keyframes.push({
          time: effect.endTime,
          zoom: effect.params.scale,
          x: nextEffect.params.targetX,
          y: nextEffect.params.targetY,
          easing: 'linear'
        })
      }
    })
    
    // Add final keyframe if needed
    const lastEffect = sortedEffects[sortedEffects.length - 1]
    if (this.context && lastEffect.endTime < this.context.duration) {
      // Already handled by the hasGap logic above
    }

    return keyframes
  }
}
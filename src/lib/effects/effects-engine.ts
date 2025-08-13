/**
 * Streamlined Effects Engine
 * Cleaner, more maintainable zoom and camera effects system
 */

import { easeInOutQuad, easeOutExpo, easeInQuad } from '@/lib/utils/easing'
import { CameraController } from './camera-controller'
import type { MouseEvent as ProjectMouseEvent } from '@/types/project'

// Simplified effect types
export interface Effect {
  id: string
  type: 'zoom'
  startTime: number
  endTime: number
  params: any
}

export interface ZoomEffect extends Effect {
  type: 'zoom'
  params: {
    targetX: number      // Initial focus point (normalized 0-1)
    targetY: number      // Initial focus point (normalized 0-1)
    scale: number        // Zoom level (e.g., 1.8)
    introMs: number      // Intro animation duration
    outroMs: number      // Outro animation duration
  }
}

export interface EffectState {
  zoom: {
    x: number
    y: number
    scale: number
  }
}

export class EffectsEngine {
  private effects: Effect[] = []
  private mouseEvents: ProjectMouseEvent[] = []
  private videoDuration: number = 0
  private videoWidth: number = 1920
  private videoHeight: number = 1080
  private cameraController: CameraController

  // Configuration
  private readonly ACTIVITY_THRESHOLD = 30
  private readonly IDLE_TIMEOUT = 2000
  private readonly ZOOM_SCALE = 1.8
  private readonly INTRO_DURATION = 200
  private readonly OUTRO_DURATION = 300
  private readonly MIN_ZOOM_DURATION = 500
  private readonly MERGE_GAP = 1500

  private debugMode = false
  private useSmartCamera = true

  constructor() {
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
  }

  /**
   * Initialize from recording
   */
  initializeFromRecording(recording: any): void {
    if (!recording) return
    const effects = this.detectEffectsFromRecording(recording)
    this.setEffects(effects)
  }

  /**
   * Initialize from raw metadata (for preview)
   */
  initializeFromMetadata(metadata: any[], duration: number, width: number, height: number): void {
    const events = this.extractEvents(metadata, width, height)
    const effects = this.detectZoomEffects(events, duration, width, height)
    this.setEffects(effects)
  }

  /**
   * Detect effects from recording
   */
  detectEffectsFromRecording(recording: any): ZoomEffect[] {
    if (!recording.metadata || !recording.duration) return []

    const events = this.convertMetadataToEvents(recording.metadata, recording.width, recording.height)
    return this.detectZoomEffects(events, recording.duration, recording.width || 1920, recording.height || 1080)
  }

  /**
   * Get effect state at timestamp
   */
  getEffectState(timestamp: number): EffectState {
    const activeZoom = this.effects.find(effect =>
      effect.type === 'zoom' &&
      timestamp >= effect.startTime &&
      timestamp <= effect.endTime
    ) as ZoomEffect | undefined

    if (!activeZoom) {
      return { zoom: { x: 0.5, y: 0.5, scale: 1.0 } }
    }

    const mousePos = this.getInterpolatedMousePosition(timestamp)
    const elapsed = timestamp - activeZoom.startTime
    const effectDuration = activeZoom.endTime - activeZoom.startTime

    let x: number, y: number, scale: number

    // Intro phase - zoom in
    if (elapsed < activeZoom.params.introMs) {
      const progress = elapsed / activeZoom.params.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.params.scale - 1.0) * eased
      x = 0.5 + (activeZoom.params.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.params.targetY - 0.5) * eased

      if (this.useSmartCamera) {
        this.cameraController.setPosition(x, y)
      }
    }
    // Outro phase - zoom out
    else if (elapsed > effectDuration - activeZoom.params.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.params.outroMs)
      const progress = outroElapsed / activeZoom.params.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.params.scale - (activeZoom.params.scale - 1.0) * eased

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
      scale = activeZoom.params.scale

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

    return { zoom: { x, y, scale } }
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
   * Convert metadata to events
   */
  private convertMetadataToEvents(metadata: any, width: number, height: number): ProjectMouseEvent[] {
    const events: ProjectMouseEvent[] = []

    if (metadata.mouseEvents) {
      events.push(...metadata.mouseEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'move' as const,
        screenWidth: e.screenWidth || width,
        screenHeight: e.screenHeight || height
      })))
    }

    if (metadata.clickEvents) {
      events.push(...metadata.clickEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'click' as const,
        screenWidth: width,
        screenHeight: height
      })))
    }

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Extract events from preview metadata
   */
  private extractEvents(metadata: any[], width: number, height: number): ProjectMouseEvent[] {
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
   * Detect zoom effects from events
   */
  private detectZoomEffects(
    events: ProjectMouseEvent[],
    videoDuration: number,
    videoWidth: number,
    videoHeight: number
  ): ZoomEffect[] {
    this.mouseEvents = events
    this.videoDuration = videoDuration
    this.videoWidth = videoWidth
    this.videoHeight = videoHeight

    const zoomEffects: ZoomEffect[] = []
    let currentZoomStart: number | null = null
    let lastActivityTime = 0
    let lastX = 0, lastY = 0
    let initialZoomX = 0, initialZoomY = 0

    for (let i = 0; i < events.length; i++) {
      const event = events[i]

      if (i === 0) {
        lastX = event.x
        lastY = event.y
        continue
      }

      const distance = Math.sqrt(
        Math.pow(event.x - lastX, 2) +
        Math.pow(event.y - lastY, 2)
      )

      const isActivity = distance > this.ACTIVITY_THRESHOLD
      const timeSinceLastActivity = event.timestamp - lastActivityTime

      if (isActivity) {
        if (currentZoomStart === null) {
          currentZoomStart = event.timestamp
          initialZoomX = event.x
          initialZoomY = event.y
        }
        lastActivityTime = event.timestamp
      } else if (currentZoomStart !== null && timeSinceLastActivity > this.IDLE_TIMEOUT) {
        const zoomEnd = lastActivityTime + 300

        if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
          zoomEffects.push({
            id: `zoom-${currentZoomStart}`,
            type: 'zoom',
            startTime: currentZoomStart,
            endTime: zoomEnd,
            params: {
              targetX: initialZoomX / videoWidth,
              targetY: initialZoomY / videoHeight,
              scale: this.ZOOM_SCALE,
              introMs: this.INTRO_DURATION,
              outroMs: this.OUTRO_DURATION
            }
          })
        }
        currentZoomStart = null
      }

      lastX = event.x
      lastY = event.y
    }

    // Handle remaining zoom
    if (currentZoomStart !== null) {
      const zoomEnd = Math.min(lastActivityTime + 300, videoDuration)

      if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
        zoomEffects.push({
          id: `zoom-final-${currentZoomStart}`,
          type: 'zoom',
          startTime: currentZoomStart,
          endTime: zoomEnd,
          params: {
            targetX: initialZoomX / videoWidth,
            targetY: initialZoomY / videoHeight,
            scale: this.ZOOM_SCALE,
            introMs: this.INTRO_DURATION,
            outroMs: this.OUTRO_DURATION
          }
        })
      }
    }

    // Merge nearby effects
    return this.mergeNearbyEffects(zoomEffects)
  }

  /**
   * Merge effects that are close together
   */
  private mergeNearbyEffects(effects: ZoomEffect[]): ZoomEffect[] {
    const merged: ZoomEffect[] = []
    let lastEffect: ZoomEffect | null = null

    for (const effect of effects) {
      if (lastEffect && effect.startTime - lastEffect.endTime < this.MERGE_GAP) {
        lastEffect.endTime = effect.endTime
      } else {
        if (lastEffect) merged.push(lastEffect)
        lastEffect = { ...effect }
      }
    }

    if (lastEffect) merged.push(lastEffect)
    return merged
  }

  /**
   * Get interpolated mouse position
   */
  private getInterpolatedMousePosition(timestamp: number): { x: number; y: number } {
    if (!this.mouseEvents || this.mouseEvents.length === 0) {
      return { x: 0.5, y: 0.5 }
    }

    let before: ProjectMouseEvent | null = null
    let after: ProjectMouseEvent | null = null

    for (const event of this.mouseEvents) {
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

      const beforeX = before.x / this.videoWidth
      const beforeY = before.y / this.videoHeight
      const afterX = after.x / this.videoWidth
      const afterY = after.y / this.videoHeight

      return {
        x: beforeX + (afterX - beforeX) * smoothProgress,
        y: beforeY + (afterY - beforeY) * smoothProgress
      }
    }

    if (before) {
      return {
        x: before.x / this.videoWidth,
        y: before.y / this.videoHeight
      }
    }

    if (after) {
      return {
        x: after.x / this.videoWidth,
        y: after.y / this.videoHeight
      }
    }

    return { x: 0.5, y: 0.5 }
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
    ctx.fillRect(5, 5, 250, 70)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`Zoom: ${zoom.scale.toFixed(1)}x`, 10, 25)
    ctx.fillText(`Camera: (${zoom.x.toFixed(3)}, ${zoom.y.toFixed(3)})`, 10, 45)

    if (currentTime !== undefined) {
      const mousePos = this.getInterpolatedMousePosition(currentTime)
      ctx.fillText(`Mouse: (${mousePos.x.toFixed(3)}, ${mousePos.y.toFixed(3)})`, 10, 65)
    }

    ctx.restore()
  }

  /**
   * Legacy method for compatibility
   */
  getZoomKeyframes(recording: any): any[] {
    const zoomEffects = this.detectEffectsFromRecording(recording)
    const keyframes: any[] = []

    zoomEffects.forEach(effect => {
      keyframes.push({
        time: effect.startTime,
        zoom: effect.params.scale,
        x: effect.params.targetX,
        y: effect.params.targetY,
        easing: 'easeOut'
      })
      keyframes.push({
        time: effect.endTime,
        zoom: 1.0,
        x: 0.5,
        y: 0.5,
        easing: 'easeIn'
      })
    })

    return keyframes
  }

  // Getters/Setters
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

  setPosition(x: number, y: number) {
    this.cameraController.setPosition(x, y)
  }

  getPosition() {
    return this.cameraController.getPosition()
  }
}
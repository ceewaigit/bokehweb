/**
 * Effects Engine - Simple orchestration of video effects
 */

import { easeInOutQuad, easeOutExpo, easeInQuad } from '@/lib/utils/easing'

interface ZoomEffect {
  id: string
  type: 'zoom'
  startTime: number
  endTime: number
  targetX: number
  targetY: number
  scale: number
  introMs: number
  outroMs: number
}

interface MouseEvent {
  timestamp: number
  x: number
  y: number
  type: 'move' | 'click'
}

export class EffectsEngine {
  private effects: ZoomEffect[] = []
  private events: MouseEvent[] = []
  private duration = 0
  private width = 1920
  private height = 1080
  
  // Simple camera position for smooth tracking
  private cameraPosition = { x: 0.5, y: 0.5 }
  private readonly CAMERA_SMOOTHING = 0.15

  /**
   * Initialize from recording
   */
  initializeFromRecording(recording: any): void {
    if (!recording) return

    this.duration = recording.duration || 0
    this.width = recording.width || 1920
    this.height = recording.height || 1080

    // Convert metadata to events
    this.events = []
    
    if (recording.metadata?.mouseEvents) {
      this.events.push(...recording.metadata.mouseEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'move' as const
      })))
    }

    if (recording.metadata?.clickEvents) {
      this.events.push(...recording.metadata.clickEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'click' as const
      })))
    }

    this.events.sort((a, b) => a.timestamp - b.timestamp)

    // Detect zoom effects
    this.detectZoomEffects()
  }

  /**
   * Simple zoom detection - creates discrete zoom blocks
   */
  private detectZoomEffects(): void {
    this.effects = []
    
    // Find click events that should trigger zoom
    const clickEvents = this.events.filter(e => e.type === 'click')
    if (clickEvents.length === 0) return
    
    let lastZoomEnd = 0
    const MIN_GAP_BETWEEN_ZOOMS = 2000 // 2 seconds minimum between zoom effects
    const DEFAULT_ZOOM_DURATION = 3000 // 3 seconds default zoom
    
    clickEvents.forEach((click, index) => {
      // Skip if too close to last zoom
      if (click.timestamp < lastZoomEnd + MIN_GAP_BETWEEN_ZOOMS) {
        return
      }
      
      // Look for next click to determine zoom duration
      const nextClick = clickEvents[index + 1]
      let zoomDuration = DEFAULT_ZOOM_DURATION
      
      if (nextClick) {
        // If next click is soon, zoom until then (but max 5 seconds)
        const gapToNext = nextClick.timestamp - click.timestamp
        if (gapToNext < 5000) {
          zoomDuration = Math.max(1500, gapToNext - 500) // Leave gap before next click
        }
      }
      
      // Make sure zoom doesn't exceed video duration
      zoomDuration = Math.min(zoomDuration, this.duration - click.timestamp - 500)
      
      // Only create zoom if we have enough duration
      if (zoomDuration > 1000) {
        this.effects.push({
          id: `zoom-${click.timestamp}`,
          type: 'zoom',
          startTime: click.timestamp,
          endTime: click.timestamp + zoomDuration,
          targetX: click.x / this.width,
          targetY: click.y / this.height,
          scale: 2.0,
          introMs: 400,
          outroMs: 400
        })
        
        lastZoomEnd = click.timestamp + zoomDuration
      }
    })
  }

  /**
   * Get zoom state at timestamp
   */
  getZoomState(timestamp: number): { x: number; y: number; scale: number } {
    // Find active zoom effect
    const activeZoom = this.effects.find(effect =>
      timestamp >= effect.startTime && timestamp <= effect.endTime
    )

    if (!activeZoom) {
      return { x: 0.5, y: 0.5, scale: 1.0 }
    }

    const elapsed = timestamp - activeZoom.startTime
    const effectDuration = activeZoom.endTime - activeZoom.startTime
    const mousePos = this.getMousePosition(timestamp)

    let x: number, y: number, scale: number

    // Intro phase - zoom in
    if (elapsed < activeZoom.introMs) {
      const progress = elapsed / activeZoom.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.scale - 1.0) * eased
      x = 0.5 + (activeZoom.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.targetY - 0.5) * eased
      
      this.cameraPosition = { x, y }
    }
    // Outro phase - zoom out
    else if (elapsed > effectDuration - activeZoom.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.outroMs)
      const progress = outroElapsed / activeZoom.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.scale - (activeZoom.scale - 1.0) * eased
      x = this.cameraPosition.x + (0.5 - this.cameraPosition.x) * eased
      y = this.cameraPosition.y + (0.5 - this.cameraPosition.y) * eased
      
      this.cameraPosition = { x, y }
    }
    // Tracking phase - follow mouse smoothly
    else {
      scale = activeZoom.scale
      
      // Smooth camera tracking
      this.cameraPosition.x += (mousePos.x - this.cameraPosition.x) * this.CAMERA_SMOOTHING
      this.cameraPosition.y += (mousePos.y - this.cameraPosition.y) * this.CAMERA_SMOOTHING
      
      x = this.cameraPosition.x
      y = this.cameraPosition.y
    }

    return { x, y, scale }
  }

  /**
   * Get interpolated mouse position
   */
  private getMousePosition(timestamp: number): { x: number; y: number } {
    if (this.events.length === 0) {
      return { x: 0.5, y: 0.5 }
    }

    let before: MouseEvent | null = null
    let after: MouseEvent | null = null

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

      return {
        x: (before.x + (after.x - before.x) * smoothProgress) / this.width,
        y: (before.y + (after.y - before.y) * smoothProgress) / this.height
      }
    }

    if (before) {
      return { x: before.x / this.width, y: before.y / this.height }
    }

    return { x: 0.5, y: 0.5 }
  }

  /**
   * Apply zoom to canvas
   */
  applyZoomToCanvas(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    zoom: { x: number; y: number; scale: number }
  ) {
    const { width, height } = ctx.canvas
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height

    if (!sourceWidth || !sourceHeight) return

    const zoomWidth = sourceWidth / zoom.scale
    const zoomHeight = sourceHeight / zoom.scale

    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight

    const sx = Math.max(0, centerX - (zoomWidth / 2))
    const sy = Math.max(0, centerY - (zoomHeight / 2))
    const sw = Math.min(zoomWidth, sourceWidth - sx)
    const sh = Math.min(zoomHeight, sourceHeight - sy)

    ctx.clearRect(0, 0, width, height)
    
    if (sw > 0 && sh > 0) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        source as CanvasImageSource,
        sx, sy, sw, sh,
        0, 0, width, height
      )
    }
  }

  /**
   * Get effects for timeline
   */
  getEffects(): ZoomEffect[] {
    return this.effects
  }

  /**
   * Add manual zoom effect
   */
  addZoomEffect(startTime: number, endTime: number, x: number, y: number, scale: number) {
    this.effects.push({
      id: `zoom-${Date.now()}`,
      type: 'zoom',
      startTime,
      endTime,
      targetX: x,
      targetY: y,
      scale,
      introMs: 300,
      outroMs: 300
    })
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Remove effect by ID
   */
  removeEffect(effectId: string) {
    this.effects = this.effects.filter(e => e.id !== effectId)
  }

  /**
   * Clear all effects
   */
  clearEffects() {
    this.effects = []
  }

  /**
   * Get zoom keyframes for timeline (legacy compatibility)
   */
  getZoomKeyframes(recording: any): any[] {
    if (!recording) return []
    
    // Initialize if needed
    this.initializeFromRecording(recording)
    
    const keyframes: any[] = []
    
    // If no effects, return empty array (timeline will handle default)
    if (this.effects.length === 0) {
      return []
    }
    
    // Create discrete zoom blocks - each effect is completely separate
    this.effects.forEach((effect) => {
      // Each zoom effect is a complete block with 4 keyframes:
      // 1. Just before zoom (at 1.0)
      // 2. Zoom in to target
      // 3. Hold at target  
      // 4. Zoom back out to 1.0
      
      // Point 1: Just before zoom starts (baseline)
      if (effect.startTime > 50) {
        keyframes.push({
          time: effect.startTime - 50,
          zoom: 1.0,
          x: 0.5,
          y: 0.5,
          easing: 'linear'
        })
      }
      
      // Point 2: Zoom in
      keyframes.push({
        time: effect.startTime,
        zoom: effect.scale,
        x: effect.targetX,
        y: effect.targetY,
        easing: 'easeOut'
      })
      
      // Point 3: Hold zoom (near end of effect)
      keyframes.push({
        time: effect.endTime - 100,
        zoom: effect.scale,
        x: effect.targetX,
        y: effect.targetY,
        easing: 'linear'
      })
      
      // Point 4: Back to baseline
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
}
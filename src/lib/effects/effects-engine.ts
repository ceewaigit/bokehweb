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
   * Force detect zoom effects with test data for debugging
   */
  forceDetectZoomEffects(options?: {
    intervalMs?: number
    zoomDuration?: number
    zoomScale?: number
    useMouseEvents?: boolean
  }): void {
    this.effects = []
    
    const {
      intervalMs = 4000,
      zoomDuration = 3000,
      zoomScale = 2.0,
      useMouseEvents = false
    } = options || {}

    if (useMouseEvents && this.events.length > 0) {
      // Create zoom effects based on mouse movement patterns
      let lastZoomEnd = 0
      const significantMoves = this.events.filter((e, i) => {
        if (i === 0) return false
        const prev = this.events[i - 1]
        const distance = Math.sqrt(
          Math.pow((e.x - prev.x) / this.width, 2) + 
          Math.pow((e.y - prev.y) / this.height, 2)
        )
        return distance > 0.1 && e.timestamp > lastZoomEnd + 2000
      })

      significantMoves.slice(0, 5).forEach(move => {
        if (move.timestamp < lastZoomEnd + 2000) return
        
        const effectDuration = Math.min(zoomDuration, this.duration - move.timestamp - 500)
        if (effectDuration > 1000) {
          this.effects.push({
            id: `zoom-test-${move.timestamp}`,
            type: 'zoom',
            startTime: move.timestamp,
            endTime: move.timestamp + effectDuration,
            targetX: move.x / this.width,
            targetY: move.y / this.height,
            scale: zoomScale,
            introMs: 400,
            outroMs: 400
          })
          lastZoomEnd = move.timestamp + effectDuration
        }
      })
    } else {
      // Create evenly spaced test zoom effects
      const numEffects = Math.floor(this.duration / intervalMs)
      for (let i = 0; i < Math.min(numEffects, 5); i++) {
        const startTime = i * intervalMs + 1000
        const endTime = Math.min(startTime + zoomDuration, this.duration - 500)
        
        if (endTime - startTime > 1000) {
          // Create zoom at different positions for variety
          const positions = [
            { x: 0.3, y: 0.3 },
            { x: 0.7, y: 0.3 },
            { x: 0.5, y: 0.5 },
            { x: 0.3, y: 0.7 },
            { x: 0.7, y: 0.7 }
          ]
          const pos = positions[i % positions.length]
          
          this.effects.push({
            id: `zoom-test-${startTime}`,
            type: 'zoom',
            startTime,
            endTime,
            targetX: pos.x,
            targetY: pos.y,
            scale: zoomScale,
            introMs: 400,
            outroMs: 400
          })
        }
      }
    }

    console.log(`Created ${this.effects.length} test zoom effects`)
  }

  /**
   * Regenerate effects with different parameters
   */
  regenerateEffects(options?: {
    minGapMs?: number
    zoomDuration?: number
    zoomScale?: number
    clicksOnly?: boolean
  }): void {
    const {
      minGapMs = 2000,
      zoomDuration = 3000,
      zoomScale = 2.0,
      clicksOnly = true
    } = options || {}

    this.effects = []
    
    const events = clicksOnly 
      ? this.events.filter(e => e.type === 'click')
      : this.events

    if (events.length === 0) {
      console.log('No events found for regeneration')
      return
    }

    let lastZoomEnd = 0
    
    events.forEach((event, index) => {
      if (event.timestamp < lastZoomEnd + minGapMs) return
      
      const nextEvent = events[index + 1]
      let effectDuration = zoomDuration
      
      if (nextEvent) {
        const gapToNext = nextEvent.timestamp - event.timestamp
        if (gapToNext < 5000) {
          effectDuration = Math.max(1500, gapToNext - 500)
        }
      }
      
      effectDuration = Math.min(effectDuration, this.duration - event.timestamp - 500)
      
      if (effectDuration > 1000) {
        this.effects.push({
          id: `zoom-${event.timestamp}`,
          type: 'zoom',
          startTime: event.timestamp,
          endTime: event.timestamp + effectDuration,
          targetX: event.x / this.width,
          targetY: event.y / this.height,
          scale: zoomScale,
          introMs: 400,
          outroMs: 400
        })
        
        lastZoomEnd = event.timestamp + effectDuration
      }
    })

    console.log(`Regenerated ${this.effects.length} zoom effects`)
  }

  /**
   * Get zoom blocks for timeline (Screen Studio style)
   */
  getZoomBlocks(recording: any): any[] {
    if (!recording) return []

    // Initialize if needed
    this.initializeFromRecording(recording)

    // Return zoom effects as blocks directly
    return this.effects.map(effect => ({
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      introMs: effect.introMs || 500,
      outroMs: effect.outroMs || 500,
      scale: effect.scale,
      targetX: effect.targetX,
      targetY: effect.targetY,
      mode: 'auto' as const
    }))
  }
}
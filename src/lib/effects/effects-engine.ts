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

  // Activity detection parameters (mutable for regeneration)
  private idleThresholdMs = 1500 // Time before considering mouse idle
  private activityThreshold = 0.05 // Normalized distance to trigger activity
  private velocityThreshold = 30 // Pixels/second to maintain zoom
  private readonly MIN_ZOOM_DURATION = 1000 // Minimum zoom time
  private readonly MAX_ZOOM_DURATION = 8000 // Maximum zoom time
  private readonly MIN_GAP_BETWEEN_ZOOMS = 2000 // Minimum gap between zoom effects

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

    // Use activity-based zoom detection by default
    this.detectActivityBasedZooms()
  }

  /**
   * Activity-based zoom detection - creates zoom effects based on mouse activity patterns
   * This mimics Screen Studio behavior where zooms persist during activity and end when idle
   */
  private detectActivityBasedZooms(): void {
    this.effects = []

    // Detect activity periods
    const activityPeriods = this.detectActivityPeriods()

    if (activityPeriods.length === 0) return

    // Convert activity periods to zoom effects
    activityPeriods.forEach(period => {
      const duration = period.end - period.start

      // Skip very short periods
      if (duration < this.MIN_ZOOM_DURATION) return

      // Cap duration at maximum
      const zoomDuration = Math.min(duration + 500, this.MAX_ZOOM_DURATION) // Add buffer for outro

      // Find the focal point - prioritize clicks, then use center of activity
      let targetX = 0.5
      let targetY = 0.5

      const clickEvent = period.events.find(e => e.type === 'click')
      if (clickEvent) {
        targetX = clickEvent.x / this.width
        targetY = clickEvent.y / this.height
      } else {
        // Use average position of significant movements
        const avgX = period.events.reduce((sum, e) => sum + e.x, 0) / period.events.length
        const avgY = period.events.reduce((sum, e) => sum + e.y, 0) / period.events.length
        targetX = avgX / this.width
        targetY = avgY / this.height
      }

      // Ensure zoom doesn't exceed video duration
      const effectiveDuration = Math.min(zoomDuration, this.duration - period.start - 500)

      if (effectiveDuration > this.MIN_ZOOM_DURATION) {
        this.effects.push({
          id: `zoom-activity-${period.start}`,
          type: 'zoom',
          startTime: period.start,
          endTime: period.start + effectiveDuration,
          targetX,
          targetY,
          scale: 2.0,
          introMs: 300,
          outroMs: 400
        })
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

    let x: number, y: number, scale: number

    // Intro phase - zoom in
    if (elapsed < activeZoom.introMs) {
      const progress = elapsed / activeZoom.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.scale - 1.0) * eased
      x = 0.5 + (activeZoom.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.targetY - 0.5) * eased
    }
    // Outro phase - zoom out
    else if (elapsed > effectDuration - activeZoom.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.outroMs)
      const progress = outroElapsed / activeZoom.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.scale - (activeZoom.scale - 1.0) * eased
      x = activeZoom.targetX + (0.5 - activeZoom.targetX) * eased
      y = activeZoom.targetY + (0.5 - activeZoom.targetY) * eased
    }
    // Hold phase - stay fixed on target area
    else {
      scale = activeZoom.scale
      x = activeZoom.targetX
      y = activeZoom.targetY
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
   * Calculate velocity between two mouse events
   */
  private calculateVelocity(event1: MouseEvent, event2: MouseEvent): number {
    const dx = event2.x - event1.x
    const dy = event2.y - event1.y
    const dt = (event2.timestamp - event1.timestamp) / 1000 // Convert to seconds

    if (dt === 0) return 0

    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance / dt // Pixels per second
  }

  /**
   * Calculate normalized distance between two points
   */
  private calculateNormalizedDistance(event1: MouseEvent, event2: MouseEvent): number {
    const dx = (event2.x - event1.x) / this.width
    const dy = (event2.y - event1.y) / this.height
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Detect activity periods in mouse events
   */
  private detectActivityPeriods(): Array<{ start: number; end: number; events: MouseEvent[] }> {
    if (this.events.length < 2) return []

    const periods: Array<{ start: number; end: number; events: MouseEvent[] }> = []
    let currentPeriod: { start: number; end: number; events: MouseEvent[] } | null = null
    let lastActivityTime = 0

    for (let i = 1; i < this.events.length; i++) {
      const prevEvent = this.events[i - 1]
      const currEvent = this.events[i]

      const velocity = this.calculateVelocity(prevEvent, currEvent)
      const distance = this.calculateNormalizedDistance(prevEvent, currEvent)
      const timeSinceLastActivity = currEvent.timestamp - lastActivityTime

      // Check if this is significant activity
      const isActivity = (
        currEvent.type === 'click' ||
        velocity > this.velocityThreshold ||
        distance > this.activityThreshold
      )

      if (isActivity) {
        lastActivityTime = currEvent.timestamp

        // Start new period if none exists or if too much time has passed
        if (!currentPeriod || timeSinceLastActivity > this.MIN_GAP_BETWEEN_ZOOMS) {
          // Close previous period if it exists
          if (currentPeriod) {
            periods.push(currentPeriod)
          }

          currentPeriod = {
            start: currEvent.timestamp,
            end: currEvent.timestamp,
            events: [currEvent]
          }
        } else {
          // Extend current period
          currentPeriod.end = currEvent.timestamp
          currentPeriod.events.push(currEvent)
        }
      } else if (currentPeriod) {
        // Check if idle threshold has been reached
        const idleTime = currEvent.timestamp - currentPeriod.end

        if (idleTime > this.idleThresholdMs) {
          // Close current period
          periods.push(currentPeriod)
          currentPeriod = null
          lastActivityTime = 0
        }
      }
    }

    // Close any remaining period
    if (currentPeriod) {
      periods.push(currentPeriod)
    }

    return periods
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
   * Set zoom effects from timeline zoom blocks
   * Replaces all existing zoom effects with the provided blocks
   */
  setZoomEffects(zoomBlocks: any[]) {
    // Remove all existing zoom effects
    this.effects = this.effects.filter(e => e.type !== 'zoom')

    // Add new zoom effects from blocks
    if (zoomBlocks && zoomBlocks.length > 0) {
      for (const block of zoomBlocks) {
        // Convert zoom block to effect format
        // Note: zoom blocks times are already in milliseconds relative to clip
        const effect: ZoomEffect = {
          id: block.id,
          type: 'zoom',
          startTime: block.startTime,
          endTime: block.endTime,
          targetX: block.targetX || 0.5,  // Default to center if not specified
          targetY: block.targetY || 0.5,
          scale: block.scale || 2.0,
          introMs: block.introMs || 300,
          outroMs: block.outroMs || 300
        }
        this.effects.push(effect)
      }

      // Keep effects sorted by start time
      this.effects.sort((a, b) => a.startTime - b.startTime)
    }
  }

  /**
   * Detect zoom effects using activity-based algorithm
   */
  detectZoomEffects(): void {
    this.detectActivityBasedZooms()
  }


  /**
   * Regenerate effects with different parameters
   */
  regenerateEffects(options?: {
    idleThresholdMs?: number
    activityThreshold?: number
    velocityThreshold?: number
    zoomScale?: number
  }): void {
    const {
      idleThresholdMs,
      activityThreshold,
      velocityThreshold,
      zoomScale = 2.0
    } = options || {}

    // Temporarily override thresholds if provided
    const originalIdleThreshold = this.idleThresholdMs
    const originalActivityThreshold = this.activityThreshold
    const originalVelocityThreshold = this.velocityThreshold

    if (idleThresholdMs !== undefined) {
      this.idleThresholdMs = idleThresholdMs
    }
    if (activityThreshold !== undefined) {
      this.activityThreshold = activityThreshold
    }
    if (velocityThreshold !== undefined) {
      this.velocityThreshold = velocityThreshold
    }

    // Regenerate effects
    this.detectZoomEffects()

    // Update scale for all effects if specified
    if (zoomScale !== 2.0) {
      this.effects.forEach(effect => {
        effect.scale = zoomScale
      })
    }

    // Restore original thresholds
    this.idleThresholdMs = originalIdleThreshold
    this.activityThreshold = originalActivityThreshold
    this.velocityThreshold = originalVelocityThreshold
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

/**
 * Effects Engine - Simple orchestration of video effects
 */

import { easeOutExpo, easeInQuad } from '@/lib/utils/easing'

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
  private interpolatedMouseCache = new Map<number, { x: number; y: number }>()
  private panVelocity = { x: 0, y: 0 } // Track pan velocity for smooth momentum
  private lastPanUpdate = 0

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

    // Clear interpolation cache when reinitializing
    this.interpolatedMouseCache.clear()

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
   * Get zoom state at timestamp with mouse position for smart panning
   */
  getZoomState(
    timestamp: number, 
    mousePosition: { x: number; y: number } | null
  ): { x: number; y: number; scale: number } {
    // Find active zoom effect
    const activeZoom = this.effects.find(effect =>
      timestamp >= effect.startTime && timestamp <= effect.endTime
    )

    if (!activeZoom) {
      // Reset pan velocity when no zoom is active
      this.panVelocity = { x: 0, y: 0 }
      this.lastPanUpdate = 0
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
      
      // Reset pan velocity during intro
      this.panVelocity = { x: 0, y: 0 }
      this.lastPanUpdate = 0
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
    // Hold phase - apply smart panning if mouse position provided
    else {
      scale = activeZoom.scale
      x = activeZoom.targetX
      y = activeZoom.targetY

      // Apply smart panning during hold phase
      if (mousePosition && scale > 1.0) {
        const panResult = this.calculateSmartPan(
          { x, y },
          mousePosition,
          scale,
          elapsed - activeZoom.introMs // Time since entering hold phase
        )
        x = panResult.x
        y = panResult.y
      }
    }

    return { x, y, scale }
  }

  /**
   * Get interpolated mouse position at timestamp
   */
  getMousePositionAtTime(timestamp: number): { x: number; y: number } | null {
    // Check cache first
    const cached = this.interpolatedMouseCache.get(Math.floor(timestamp))
    if (cached) return cached

    if (this.events.length === 0) return null

    // Find surrounding events
    let prevEvent: MouseEvent | null = null
    let nextEvent: MouseEvent | null = null

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      if (event.timestamp <= timestamp) {
        prevEvent = event
      } else {
        nextEvent = event
        break
      }
    }

    // If we only have one event or timestamp is outside range
    if (!prevEvent) {
      return this.events[0] ? { 
        x: this.events[0].x / this.width, 
        y: this.events[0].y / this.height 
      } : null
    }
    
    if (!nextEvent) {
      return { 
        x: prevEvent.x / this.width, 
        y: prevEvent.y / this.height 
      }
    }

    // Interpolate between events
    const timeDiff = nextEvent.timestamp - prevEvent.timestamp
    if (timeDiff === 0) {
      return { 
        x: prevEvent.x / this.width, 
        y: prevEvent.y / this.height 
      }
    }

    const progress = (timestamp - prevEvent.timestamp) / timeDiff
    
    // Use cubic interpolation for smoother motion
    const smoothProgress = progress * progress * (3 - 2 * progress)
    
    const interpolatedX = prevEvent.x + (nextEvent.x - prevEvent.x) * smoothProgress
    const interpolatedY = prevEvent.y + (nextEvent.y - prevEvent.y) * smoothProgress

    const result = {
      x: interpolatedX / this.width,
      y: interpolatedY / this.height
    }

    // Cache the result for performance
    this.interpolatedMouseCache.set(Math.floor(timestamp), result)
    
    // Limit cache size
    if (this.interpolatedMouseCache.size > 1000) {
      const firstKey = this.interpolatedMouseCache.keys().next().value
      if (firstKey !== undefined) {
        this.interpolatedMouseCache.delete(firstKey)
      }
    }

    return result
  }

  /**
   * Calculate smart pan to keep mouse in frame
   */
  private calculateSmartPan(
    currentCenter: { x: number; y: number },
    mousePos: { x: number; y: number },
    scale: number,
    holdTime: number
  ): { x: number; y: number } {
    // Configuration for smart panning
    const frameWidth = 1.0 / scale
    const frameHeight = 1.0 / scale
    
    // Calculate current time for momentum tracking
    const now = Date.now()
    const deltaTime = this.lastPanUpdate > 0 ? (now - this.lastPanUpdate) / 1000 : 0.016
    this.lastPanUpdate = now
    
    // Ideal framing: mouse should be within this comfortable zone
    const comfortZone = 0.35 // Keep mouse within 35% from center
    const criticalZone = 0.45 // Start aggressive panning at 45% from center
    
    // Calculate mouse position relative to current frame center
    const relativeX = mousePos.x - currentCenter.x
    const relativeY = mousePos.y - currentCenter.y
    
    // Calculate how far the mouse is from center as a percentage of frame
    const distX = Math.abs(relativeX) / (frameWidth / 2)
    const distY = Math.abs(relativeY) / (frameHeight / 2)
    
    // Target position: where we want the camera to be to keep mouse comfortable
    let targetX = currentCenter.x
    let targetY = currentCenter.y
    
    // If mouse is outside the visible frame, we need to catch up
    const mouseOutsideFrame = (
      mousePos.x < currentCenter.x - frameWidth / 2 ||
      mousePos.x > currentCenter.x + frameWidth / 2 ||
      mousePos.y < currentCenter.y - frameHeight / 2 ||
      mousePos.y > currentCenter.y + frameHeight / 2
    )
    
    if (mouseOutsideFrame) {
      // Mouse is completely outside - pan more aggressively to catch up
      // But don't jump directly to mouse - ease towards it
      const catchUpSpeed = 0.15 // Faster catch-up when mouse is outside
      targetX = currentCenter.x + relativeX * catchUpSpeed
      targetY = currentCenter.y + relativeY * catchUpSpeed
    } else {
      // Mouse is in frame - use zone-based panning
      
      // Horizontal panning
      if (distX > comfortZone) {
        // Calculate pan strength based on how far past comfort zone
        const excess = distX - comfortZone
        const maxExcess = 1.0 - comfortZone
        let panStrength = excess / maxExcess
        
        // Use exponential curve for smoother acceleration
        panStrength = Math.pow(panStrength, 1.5)
        
        // Apply direction and scale
        const panAmount = panStrength * 0.1 * Math.sign(relativeX)
        targetX = currentCenter.x + panAmount
      }
      
      // Vertical panning
      if (distY > comfortZone) {
        const excess = distY - comfortZone
        const maxExcess = 1.0 - comfortZone
        let panStrength = excess / maxExcess
        panStrength = Math.pow(panStrength, 1.5)
        
        const panAmount = panStrength * 0.1 * Math.sign(relativeY)
        targetY = currentCenter.y + panAmount
      }
    }
    
    // Apply momentum-based smoothing
    const smoothingFactor = mouseOutsideFrame ? 0.2 : 0.05 // Faster response when catching up
    
    // Update velocity with smoothing
    const targetVelX = (targetX - currentCenter.x) / deltaTime
    const targetVelY = (targetY - currentCenter.y) / deltaTime
    
    this.panVelocity.x = this.panVelocity.x * (1 - smoothingFactor) + targetVelX * smoothingFactor
    this.panVelocity.y = this.panVelocity.y * (1 - smoothingFactor) + targetVelY * smoothingFactor
    
    // Apply velocity to get new position
    let newX = currentCenter.x + this.panVelocity.x * deltaTime
    let newY = currentCenter.y + this.panVelocity.y * deltaTime
    
    // Get the active zoom effect to find original target
    const activeZoom = this.effects.find(e => 
      e.type === 'zoom' && e.targetX !== undefined
    )
    
    if (activeZoom) {
      // Soft limit: gradually reduce pan speed as we get far from original target
      const distFromOriginalX = Math.abs(newX - activeZoom.targetX)
      const distFromOriginalY = Math.abs(newY - activeZoom.targetY)
      
      // Start slowing down after 20% distance, fully stop at 40%
      const softLimit = 0.2
      const hardLimit = 0.4
      
      if (distFromOriginalX > softLimit) {
        const limitFactor = 1.0 - Math.min(1.0, (distFromOriginalX - softLimit) / (hardLimit - softLimit))
        const pullBack = (activeZoom.targetX - newX) * 0.02 // Gentle pull back to origin
        newX = newX + pullBack * (1 - limitFactor)
      }
      
      if (distFromOriginalY > softLimit) {
        const limitFactor = 1.0 - Math.min(1.0, (distFromOriginalY - softLimit) / (hardLimit - softLimit))
        const pullBack = (activeZoom.targetY - newY) * 0.02
        newY = newY + pullBack * (1 - limitFactor)
      }
    }
    
    // Ensure we don't pan outside the video bounds
    const halfFrameWidth = frameWidth / 2
    const halfFrameHeight = frameHeight / 2
    newX = Math.max(halfFrameWidth, Math.min(1.0 - halfFrameWidth, newX))
    newY = Math.max(halfFrameHeight, Math.min(1.0 - halfFrameHeight, newY))
    
    return { x: newX, y: newY }
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
    this.interpolatedMouseCache.clear()
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

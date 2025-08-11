import { easeInOutQuad, easeOutExpo, easeInQuad } from '@/lib/utils/easing'
import type { MouseEvent as ProjectMouseEvent } from '@/types/project'

// Base effect interface - all effects on the timeline
export interface Effect {
  id: string
  type: 'zoom' // Can add more effect types later
  startTime: number
  endTime: number
  params: any
}

// Zoom effect with intro/outro animations
export interface ZoomEffect extends Effect {
  type: 'zoom'
  params: {
    targetX: number      // Initial focus point (normalized 0-1)
    targetY: number      // Initial focus point (normalized 0-1)
    scale: number        // Zoom level (e.g., 1.8)
    introMs: number      // Intro animation duration (default 800ms)
    outroMs: number      // Outro animation duration (default 800ms)
  }
}

// Result of applying effects at a specific timestamp
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

  // Detection thresholds - zoom on ACTIVITY (movement/clicks), zoom out on IDLE
  private readonly ACTIVITY_THRESHOLD = 30 // pixels - movement that triggers zoom
  private readonly IDLE_TIMEOUT = 800 // ms - time without activity before zoom out (reduced)
  private readonly ZOOM_SCALE = 1.8 // Default zoom level (slightly less aggressive)
  private readonly INTRO_DURATION = 300 // ms (faster zoom in)
  private readonly OUTRO_DURATION = 400 // ms (faster zoom out)  
  private readonly MIN_ZOOM_DURATION = 1000 // ms - minimum duration (reduced to catch more zooms)

  // Debug mode
  private debugMode = false // Disable for production

  constructor() { }

  /**
   * Initialize effects from recording metadata
   * This sets up the engine with all detected effects
   */
  initializeFromRecording(recording: any): void {
    if (!recording) return

    const effects = this.detectEffectsFromRecording(recording)
    this.setEffects(effects)
  }

  /**
   * Initialize effects from raw metadata (for preview)
   */
  initializeFromMetadata(metadata: any[], duration: number, width: number, height: number): void {
    // Convert the preview metadata format to our format
    const events: ProjectMouseEvent[] = metadata
      .filter((e: any) => e.eventType === 'mouse' || e.eventType === 'click')
      .map((e: any) => ({
        timestamp: e.timestamp,
        x: e.mouseX || e.x,
        y: e.mouseY || e.y,
        type: e.eventType === 'click' ? 'click' : 'move',
        screenWidth: e.windowWidth || width,
        screenHeight: e.windowHeight || height
      }))

    const effects = this.detectZoomEffectsInternal(events, duration, width, height)
    this.setEffects(effects)
  }

  /**
   * Detect zoom effects from recording metadata
   * This is the main entry point for automatic effect detection
   */
  detectEffectsFromRecording(recording: any): ZoomEffect[] {
    if (!recording.metadata || !recording.duration) {
      return []
    }

    // Convert metadata to internal format
    const events = this.convertMetadataToEvents(recording.metadata, recording.width, recording.height)

    // Detect zoom effects
    return this.detectZoomEffectsInternal(
      events,
      recording.duration,
      recording.width || 1920,
      recording.height || 1080
    )
  }

  /**
   * Convert recording metadata to internal event format
   */
  private convertMetadataToEvents(metadata: any, width: number, height: number): ProjectMouseEvent[] {
    const events: ProjectMouseEvent[] = []

    // Add mouse events
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

    // Add click events
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
   * Get zoom keyframes in the legacy format for timeline compatibility
   */
  getZoomKeyframes(recording: any): any[] {
    const zoomEffects = this.detectEffectsFromRecording(recording)
    const keyframes: any[] = []

    zoomEffects.forEach(effect => {
      // Add keyframe for zoom start
      keyframes.push({
        time: effect.startTime,
        zoom: effect.params.scale,
        x: effect.params.targetX,
        y: effect.params.targetY,
        easing: 'easeOut'
      })
      // Add keyframe for zoom end
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

  /**
   * Analyze mouse events and detect where to add zoom effects
   * NEW LOGIC: Zoom IN on activity (movement/clicks), zoom OUT on idle
   */
  private detectZoomEffectsInternal(
    events: ProjectMouseEvent[],
    videoDuration: number,
    videoWidth: number = 1920,
    videoHeight: number = 1080
  ): ZoomEffect[] {
    this.mouseEvents = events
    this.videoDuration = videoDuration
    this.videoWidth = videoWidth
    this.videoHeight = videoHeight

    if (this.debugMode) {
      console.log(`🔍 ZOOM DETECTION START (Activity-based):`, {
        totalEvents: events.length,
        videoDuration: `${(videoDuration / 1000).toFixed(1)}s`,
        dimensions: `${videoWidth}x${videoHeight}`,
        logic: 'Zoom IN on movement/clicks, zoom OUT on idle',
        thresholds: {
          activityPixels: this.ACTIVITY_THRESHOLD,
          idleTimeoutMs: this.IDLE_TIMEOUT,
          minDurationMs: this.MIN_ZOOM_DURATION
        }
      })
    }

    const zoomEffects: ZoomEffect[] = []
    let currentZoomStart: number | null = null
    let lastActivityTime = 0
    let lastX = 0
    let lastY = 0
    let activityCenterX = 0
    let activityCenterY = 0
    let activityPoints: { x: number, y: number, t: number }[] = []

    for (let i = 0; i < events.length; i++) {
      const event = events[i]

      if (i === 0) {
        lastX = event.x
        lastY = event.y
        lastActivityTime = event.timestamp
        continue
      }

      const distance = Math.sqrt(
        Math.pow(event.x - lastX, 2) +
        Math.pow(event.y - lastY, 2)
      )

      const isClick = 'type' in event && event.type === 'click'
      const timeSinceActivity = event.timestamp - lastActivityTime

      // Check for ACTIVITY (significant movement or click)
      if (distance > this.ACTIVITY_THRESHOLD || isClick) {

        if (currentZoomStart === null) {
          // Start new zoom effect
          currentZoomStart = event.timestamp
          activityPoints = [{ x: event.x, y: event.y, t: event.timestamp }]
          activityCenterX = event.x
          activityCenterY = event.y

          if (this.debugMode) {
            console.log(`🎯 ACTIVITY START - Zoom IN at ${(event.timestamp / 1000).toFixed(1)}s:`, {
              trigger: isClick ? 'CLICK' : `MOVEMENT (${distance.toFixed(0)}px)`,
              position: `(${event.x}, ${event.y})`,
              normalized: `(${(event.x / videoWidth).toFixed(3)}, ${(event.y / videoHeight).toFixed(3)})`
            })
          }
        } else {
          // Continue activity - update center as weighted average of recent points
          activityPoints.push({ x: event.x, y: event.y, t: event.timestamp })

          // Keep only recent points (last 1 second)
          const recentPoints = activityPoints.filter(p => event.timestamp - p.t < 1000)
          activityPoints = recentPoints

          // Calculate weighted center (more recent = more weight)
          let totalWeight = 0
          let weightedX = 0
          let weightedY = 0

          recentPoints.forEach(p => {
            const age = event.timestamp - p.t
            const weight = Math.max(0, 1 - age / 1000) // Linear decay over 1 second
            weightedX += p.x * weight
            weightedY += p.y * weight
            totalWeight += weight
          })

          if (totalWeight > 0) {
            activityCenterX = weightedX / totalWeight
            activityCenterY = weightedY / totalWeight
          }
        }

        lastActivityTime = event.timestamp

      } else if (timeSinceActivity > this.IDLE_TIMEOUT && currentZoomStart !== null) {
        // IDLE detected - create zoom effect and zoom out
        const zoomEnd = lastActivityTime + 500 // Small buffer after last activity

        if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
          const zoomEffect: ZoomEffect = {
            id: `zoom-${currentZoomStart}`,
            type: 'zoom',
            startTime: currentZoomStart,
            endTime: zoomEnd,
            params: {
              targetX: activityCenterX / videoWidth,
              targetY: activityCenterY / videoHeight,
              scale: this.ZOOM_SCALE,
              introMs: this.INTRO_DURATION,
              outroMs: this.OUTRO_DURATION
            }
          }

          if (this.debugMode) {
            console.log(`✅ ZOOM EFFECT CREATED (idle detected):`, {
              timeRange: `${(zoomEffect.startTime / 1000).toFixed(1)}s - ${(zoomEffect.endTime / 1000).toFixed(1)}s`,
              duration: `${((zoomEffect.endTime - zoomEffect.startTime) / 1000).toFixed(1)}s`,
              center: `(${zoomEffect.params.targetX.toFixed(3)}, ${zoomEffect.params.targetY.toFixed(3)})`,
              activityPoints: activityPoints.length
            })
          }

          zoomEffects.push(zoomEffect)
          currentZoomStart = null
          activityPoints = []
        } else if (this.debugMode) {
          console.log(`⚠️ Zoom too short, discarding (${((zoomEnd - currentZoomStart) / 1000).toFixed(1)}s)`)
          currentZoomStart = null
          activityPoints = []
        }
      }

      lastX = event.x
      lastY = event.y
    }

    // Handle any remaining zoom at the end
    if (currentZoomStart !== null) {
      const zoomEnd = Math.min(lastActivityTime + 500, videoDuration)
      if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
        const zoomEffect: ZoomEffect = {
          id: `zoom-final-${currentZoomStart}`,
          type: 'zoom',
          startTime: currentZoomStart,
          endTime: zoomEnd,
          params: {
            targetX: activityCenterX / videoWidth,
            targetY: activityCenterY / videoHeight,
            scale: this.ZOOM_SCALE,
            introMs: this.INTRO_DURATION,
            outroMs: this.OUTRO_DURATION
          }
        }

        if (this.debugMode) {
          console.log(`✅ FINAL ZOOM EFFECT:`, {
            timeRange: `${(zoomEffect.startTime / 1000).toFixed(1)}s - ${(zoomEffect.endTime / 1000).toFixed(1)}s`,
            center: `(${zoomEffect.params.targetX.toFixed(3)}, ${zoomEffect.params.targetY.toFixed(3)})`
          })
        }

        zoomEffects.push(zoomEffect)
      }
    }

    this.effects = zoomEffects

    if (this.debugMode) {
      console.log(`🔍 ZOOM DETECTION COMPLETE:`, {
        totalEffectsDetected: zoomEffects.length,
        effects: zoomEffects.map(e => ({
          time: `${(e.startTime / 1000).toFixed(1)}-${(e.endTime / 1000).toFixed(1)}s`,
          center: `(${e.params.targetX.toFixed(2)}, ${e.params.targetY.toFixed(2)})`
        }))
      })
    }

    return zoomEffects
  }

  /**
   * Get the effect state at a specific timestamp
   */
  getEffectState(timestamp: number): EffectState {
    // Find active zoom effect
    const activeZoom = this.effects.find(effect =>
      effect.type === 'zoom' &&
      timestamp >= effect.startTime &&
      timestamp <= effect.endTime
    ) as ZoomEffect | undefined

    if (!activeZoom) {
      return {
        zoom: { x: 0.5, y: 0.5, scale: 1.0 }
      }
    }

    if (this.debugMode && timestamp % 5000 < 50) { // Log every 5 seconds
      console.log(`🎬 ACTIVE ZOOM at ${(timestamp / 1000).toFixed(1)}s:`, {
        effectId: activeZoom.id,
        phase: timestamp < activeZoom.startTime + activeZoom.params.introMs ? 'intro' :
          timestamp > activeZoom.endTime - activeZoom.params.outroMs ? 'outro' : 'tracking',
        target: `(${activeZoom.params.targetX.toFixed(3)}, ${activeZoom.params.targetY.toFixed(3)})`
      })
    }

    // Calculate zoom animation phase
    const effectDuration = activeZoom.endTime - activeZoom.startTime
    const elapsed = timestamp - activeZoom.startTime

    let scale: number
    let x: number
    let y: number

    // Intro phase - zoom in to target
    if (elapsed < activeZoom.params.introMs) {
      const progress = elapsed / activeZoom.params.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.params.scale - 1.0) * eased

      // Pan from center to target
      x = 0.5 + (activeZoom.params.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.params.targetY - 0.5) * eased
    }
    // Outro phase - zoom out to center
    else if (elapsed > effectDuration - activeZoom.params.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.params.outroMs)
      const progress = outroElapsed / activeZoom.params.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.params.scale - (activeZoom.params.scale - 1.0) * eased

      // Get current mouse position for smooth transition
      const currentMouse = this.getInterpolatedMousePosition(timestamp)

      // Pan from current mouse position back to center
      x = currentMouse.x + (0.5 - currentMouse.x) * eased
      y = currentMouse.y + (0.5 - currentMouse.y) * eased
    }
    // Middle phase - follow mouse smoothly
    else {
      scale = activeZoom.params.scale

      // Follow actual mouse position with smoothing
      const mousePos = this.getInterpolatedMousePosition(timestamp)

      // Blend between target and current mouse position for smoother tracking
      const blendFactor = 0.7 // How much to follow the mouse (0 = static, 1 = full follow)
      x = activeZoom.params.targetX + (mousePos.x - activeZoom.params.targetX) * blendFactor
      y = activeZoom.params.targetY + (mousePos.y - activeZoom.params.targetY) * blendFactor
    }

    // Ensure we stay within bounds when zoomed
    // The visible area is 1/scale of the full image
    const margin = (1 - 1 / scale) / 2
    x = Math.max(margin, Math.min(1 - margin, x))
    y = Math.max(margin, Math.min(1 - margin, y))

    return {
      zoom: { x, y, scale }
    }
  }

  /**
   * Get interpolated mouse position at timestamp
   */
  private getInterpolatedMousePosition(timestamp: number): { x: number; y: number } {
    if (!this.mouseEvents || this.mouseEvents.length === 0) {
      return { x: 0.5, y: 0.5 }
    }

    // Find surrounding events
    let before: ProjectMouseEvent | null = null
    let after: ProjectMouseEvent | null = null

    for (let i = 0; i < this.mouseEvents.length; i++) {
      const event = this.mouseEvents[i]
      if (event.timestamp <= timestamp) {
        before = event
      } else {
        after = event
        break
      }
    }

    // Interpolate between events
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

    // Use nearest event
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
   * Apply zoom to canvas - FIXED centering logic
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

    // Calculate the zoomed region dimensions
    const zoomWidth = sourceWidth / zoom.scale
    const zoomHeight = sourceHeight / zoom.scale

    // Calculate the center point in source coordinates
    // zoom.x and zoom.y are normalized (0-1), convert to pixel coordinates
    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight

    // Calculate the top-left corner of the region to extract
    // We want the point (centerX, centerY) to be at the center of our extracted region
    let sx = centerX - (zoomWidth / 2)
    let sy = centerY - (zoomHeight / 2)

    // Clamp to ensure we stay within source bounds
    sx = Math.max(0, Math.min(sourceWidth - zoomWidth, sx))
    sy = Math.max(0, Math.min(sourceHeight - zoomHeight, sy))

    // Verify centering accuracy
    const actualCenterX = sx + (zoomWidth / 2)
    const actualCenterY = sy + (zoomHeight / 2)
    const centerErrorX = Math.abs(actualCenterX - centerX)
    const centerErrorY = Math.abs(actualCenterY - centerY)

    if (this.debugMode && Math.random() < 0.001) { // Log very rarely
      console.log(`📐 ZOOM RENDER:`, {
        zoomParams: `(${zoom.x.toFixed(3)}, ${zoom.y.toFixed(3)}) @ ${zoom.scale.toFixed(2)}x`,
        sourceSize: `${sourceWidth}x${sourceHeight}`,
        zoomRegion: `${zoomWidth.toFixed(0)}x${zoomHeight.toFixed(0)}`,
        targetCenter: `(${centerX.toFixed(0)}, ${centerY.toFixed(0)})`,
        actualCenter: `(${actualCenterX.toFixed(0)}, ${actualCenterY.toFixed(0)})`,
        extractRegion: `(${sx.toFixed(0)}, ${sy.toFixed(0)}) size: ${zoomWidth.toFixed(0)}x${zoomHeight.toFixed(0)}`,
        centerError: (centerErrorX > 5 || centerErrorY > 5) ?
          `⚠️ X:${centerErrorX.toFixed(0)}px Y:${centerErrorY.toFixed(0)}px` : '✅ centered'
      })
    }

    // Draw with high quality
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, width, height)

    ctx.drawImage(
      source as CanvasImageSource,
      sx, sy, zoomWidth, zoomHeight,
      0, 0, width, height
    )

    // Draw debug overlay if zoom is active
    if (this.debugMode && zoom.scale > 1.0) {
      // Save context state
      ctx.save()

      // Draw crosshair at center of canvas (shows where zoom is centered)
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.lineWidth = 2

      const canvasCenterX = width / 2
      const canvasCenterY = height / 2

      // Horizontal line
      ctx.beginPath()
      ctx.moveTo(canvasCenterX - 30, canvasCenterY)
      ctx.lineTo(canvasCenterX + 30, canvasCenterY)
      ctx.stroke()

      // Vertical line
      ctx.beginPath()
      ctx.moveTo(canvasCenterX, canvasCenterY - 30)
      ctx.lineTo(canvasCenterX, canvasCenterY + 30)
      ctx.stroke()

      // Draw circle around crosshair
      ctx.beginPath()
      ctx.arc(canvasCenterX, canvasCenterY, 40, 0, Math.PI * 2)
      ctx.stroke()

      // Draw zoom info
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'
      ctx.font = 'bold 16px monospace'
      ctx.fillText(`Zoom: ${zoom.scale.toFixed(1)}x`, 10, 30)
      ctx.fillText(`Center: (${zoom.x.toFixed(2)}, ${zoom.y.toFixed(2)})`, 10, 50)

      // Restore context state
      ctx.restore()
    }
  }

  /**
   * Get all effects
   */
  getEffects(): Effect[] {
    return this.effects
  }

  /**
   * Set effects manually (for loading from project)
   */
  setEffects(effects: Effect[]) {
    this.effects = effects
  }

  /**
   * Add an effect
   */
  addEffect(effect: Effect) {
    this.effects.push(effect)
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Remove an effect
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
}
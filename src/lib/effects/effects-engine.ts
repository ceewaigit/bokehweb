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
  private readonly IDLE_TIMEOUT = 2000 // ms - longer idle time to create continuous zooms
  private readonly ZOOM_SCALE = 1.8 // Default zoom level (slightly less aggressive)
  private readonly INTRO_DURATION = 200 // ms (very fast zoom in)
  private readonly OUTRO_DURATION = 300 // ms (faster zoom out)  
  private readonly MIN_ZOOM_DURATION = 500 // ms - shorter minimum to catch quick interactions
  private readonly MERGE_GAP = 1500 // ms - merge zooms if gap is less than this

  // Debug mode
  private debugMode = true // Disable for production

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
        screenWidth: e.windowWidth || e.screenWidth || width,
        screenHeight: e.windowHeight || e.screenHeight || height
      }))
    
    // Debug first few events to check screen dimensions
    if (this.debugMode && events.length > 0) {
      console.log(`🎯 Metadata initialization:`, {
        videoSize: `${width}x${height}`,
        firstEvent: events[0],
        eventCount: events.length,
        sampleEvents: events.slice(0, 3).map(e => ({
          pos: `(${e.x}, ${e.y})`,
          screen: `${e.screenWidth}x${e.screenHeight}`
        }))
      })
    }

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
   * NEW LOGIC: Create CONTINUOUS zoom during activity, zoom out on extended idle
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
      console.log(`🔍 ZOOM DETECTION START (Continuous):`, {
        totalEvents: events.length,
        videoDuration: `${(videoDuration / 1000).toFixed(1)}s`,
        dimensions: `${videoWidth}x${videoHeight}`,
        logic: 'CONTINUOUS zoom during activity, zoom OUT on extended idle',
        thresholds: {
          activityPixels: this.ACTIVITY_THRESHOLD,
          idleTimeoutMs: this.IDLE_TIMEOUT,
          minDurationMs: this.MIN_ZOOM_DURATION,
          mergeGapMs: this.MERGE_GAP
        }
      })
    }

    const zoomEffects: ZoomEffect[] = []
    let currentZoomStart: number | null = null
    let lastActivityTime = 0
    let lastX = 0
    let lastY = 0
    let initialZoomX = 0
    let initialZoomY = 0

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

      const isClick = 'type' in event && event.type === 'click'
      const timeSinceLastActivity = event.timestamp - lastActivityTime

      // Check for ACTIVITY (significant movement or click)
      if (distance > this.ACTIVITY_THRESHOLD || isClick) {
        
        // If we're resuming activity after a short break, continue the zoom
        if (currentZoomStart !== null && timeSinceLastActivity < this.MERGE_GAP) {
          // Continue existing zoom
          if (this.debugMode && timeSinceLastActivity > 500) {
            console.log(`📍 ACTIVITY RESUME at ${(event.timestamp / 1000).toFixed(1)}s:`, {
              gapMs: timeSinceLastActivity,
              trigger: isClick ? 'CLICK' : `MOVEMENT (${distance.toFixed(0)}px)`,
              position: `(${event.x}, ${event.y})`
            })
          }
        } else if (currentZoomStart === null) {
          // Start new zoom effect
          currentZoomStart = event.timestamp
          initialZoomX = event.x
          initialZoomY = event.y

          if (this.debugMode) {
            console.log(`🎯 ZOOM START at ${(event.timestamp / 1000).toFixed(1)}s:`, {
              trigger: isClick ? 'CLICK' : `MOVEMENT (${distance.toFixed(0)}px)`,
              position: `(${event.x}, ${event.y})`,
              normalized: `(${(event.x / videoWidth).toFixed(3)}, ${(event.y / videoHeight).toFixed(3)})`
            })
          }
        }

        lastActivityTime = event.timestamp

      } else if (currentZoomStart !== null && timeSinceLastActivity > this.IDLE_TIMEOUT) {
        // Extended idle detected - end the zoom
        const zoomEnd = lastActivityTime + 300 // Quick fade after last activity

        if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
          // Find the event that started this zoom to get its screen dimensions
          const startEvent = events.find(e => e.timestamp === currentZoomStart) || events[i]
          const screenW = startEvent.screenWidth || videoWidth
          const screenH = startEvent.screenHeight || videoHeight
          
          const zoomEffect: ZoomEffect = {
            id: `zoom-${currentZoomStart}`,
            type: 'zoom',
            startTime: currentZoomStart,
            endTime: zoomEnd,
            params: {
              targetX: initialZoomX / screenW,
              targetY: initialZoomY / screenH,
              scale: this.ZOOM_SCALE,
              introMs: this.INTRO_DURATION,
              outroMs: this.OUTRO_DURATION
            }
          }

          if (this.debugMode) {
            console.log(`✅ ZOOM EFFECT CREATED:`, {
              timeRange: `${(zoomEffect.startTime / 1000).toFixed(1)}s - ${(zoomEffect.endTime / 1000).toFixed(1)}s`,
              duration: `${((zoomEffect.endTime - zoomEffect.startTime) / 1000).toFixed(1)}s`,
              initialCenter: `(${zoomEffect.params.targetX.toFixed(3)}, ${zoomEffect.params.targetY.toFixed(3)})`,
              reason: 'Extended idle detected'
            })
          }

          zoomEffects.push(zoomEffect)
        } else if (this.debugMode) {
          console.log(`⚠️ Zoom too short, discarding (${((zoomEnd - currentZoomStart) / 1000).toFixed(1)}s)`)
        }
        
        currentZoomStart = null
      }

      lastX = event.x
      lastY = event.y
    }

    // Handle any remaining zoom at the end
    if (currentZoomStart !== null) {
      const zoomEnd = Math.min(lastActivityTime + 300, videoDuration)
      
      if (zoomEnd - currentZoomStart >= this.MIN_ZOOM_DURATION) {
        // Find the event that started this zoom to get its screen dimensions
        const startEvent = events.find(e => e.timestamp === currentZoomStart) || events[events.length - 1]
        const screenW = startEvent.screenWidth || videoWidth
        const screenH = startEvent.screenHeight || videoHeight
        
        const zoomEffect: ZoomEffect = {
          id: `zoom-final-${currentZoomStart}`,
          type: 'zoom',
          startTime: currentZoomStart,
          endTime: zoomEnd,
          params: {
            targetX: initialZoomX / screenW,
            targetY: initialZoomY / screenH,
            scale: this.ZOOM_SCALE,
            introMs: this.INTRO_DURATION,
            outroMs: this.OUTRO_DURATION
          }
        }

        if (this.debugMode) {
          console.log(`✅ FINAL ZOOM EFFECT:`, {
            timeRange: `${(zoomEffect.startTime / 1000).toFixed(1)}s - ${(zoomEffect.endTime / 1000).toFixed(1)}s`,
            initialCenter: `(${zoomEffect.params.targetX.toFixed(3)}, ${zoomEffect.params.targetY.toFixed(3)})`,
            reason: 'Video end'
          })
        }

        zoomEffects.push(zoomEffect)
      }
    }

    // Merge nearby zoom effects to create continuous zooms
    const mergedEffects: ZoomEffect[] = []
    let lastEffect: ZoomEffect | null = null

    for (const effect of zoomEffects) {
      if (lastEffect && effect.startTime - lastEffect.endTime < this.MERGE_GAP) {
        // Merge with previous effect
        lastEffect.endTime = effect.endTime
        if (this.debugMode) {
          console.log(`🔗 MERGED ZOOM:`, {
            newRange: `${(lastEffect.startTime / 1000).toFixed(1)}s - ${(lastEffect.endTime / 1000).toFixed(1)}s`,
            gapWas: `${((effect.startTime - lastEffect.endTime) / 1000).toFixed(1)}s`
          })
        }
      } else {
        // New separate effect
        if (lastEffect) mergedEffects.push(lastEffect)
        lastEffect = { ...effect }
      }
    }
    if (lastEffect) mergedEffects.push(lastEffect)

    this.effects = mergedEffects

    if (this.debugMode) {
      console.log(`🔍 ZOOM DETECTION COMPLETE:`, {
        originalEffects: zoomEffects.length,
        mergedEffects: mergedEffects.length,
        effects: mergedEffects.map(e => ({
          time: `${(e.startTime / 1000).toFixed(1)}-${(e.endTime / 1000).toFixed(1)}s`,
          duration: `${((e.endTime - e.startTime) / 1000).toFixed(1)}s`,
          center: `(${e.params.targetX.toFixed(2)}, ${e.params.targetY.toFixed(2)})`
        }))
      })
    }

    return mergedEffects
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
      // Log when we can't find an effect (but only occasionally)
      if (this.debugMode && timestamp % 1000 < 50) {
        console.log(`  🔍 No effect at ${(timestamp/1000).toFixed(1)}s (have ${this.effects.length} effects)`)
      }
      return {
        zoom: { x: 0.5, y: 0.5, scale: 1.0 }
      }
    }

    // Get current mouse position
    const mousePos = this.getInterpolatedMousePosition(timestamp)

    // Log coordinates occasionally for debugging (reduced frequency)
    if (this.debugMode && timestamp % 500 < 10) {  // Much less frequent
      console.log(`🎬 ZOOM STATE at ${(timestamp / 1000).toFixed(2)}s:`, {
        effectId: activeZoom.id,
        mousePos: `(${mousePos.x.toFixed(3)}, ${mousePos.y.toFixed(3)})`,
        targetPos: `(${activeZoom.params.targetX.toFixed(3)}, ${activeZoom.params.targetY.toFixed(3)})`,
        phase: timestamp < activeZoom.startTime + activeZoom.params.introMs ? 'INTRO' :
          timestamp > activeZoom.endTime - activeZoom.params.outroMs ? 'OUTRO' : 'TRACKING'
      })
    }

    // Calculate zoom animation phase
    const effectDuration = activeZoom.endTime - activeZoom.startTime
    const elapsed = timestamp - activeZoom.startTime

    let scale: number
    let x: number
    let y: number

    // Intro phase - zoom in FAST to mouse position
    if (elapsed < activeZoom.params.introMs) {
      const progress = elapsed / activeZoom.params.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.params.scale - 1.0) * eased

      // Immediately pan to mouse position
      x = 0.5 + (mousePos.x - 0.5) * eased
      y = 0.5 + (mousePos.y - 0.5) * eased

      if (this.debugMode && elapsed % 50 < 10) {
        console.log(`  📍 INTRO: progress=${progress.toFixed(2)}, eased=${eased.toFixed(2)}, scale=${scale.toFixed(2)}`)
      }
    }
    // Outro phase - zoom out to center
    else if (elapsed > effectDuration - activeZoom.params.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.params.outroMs)
      const progress = outroElapsed / activeZoom.params.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.params.scale - (activeZoom.params.scale - 1.0) * eased

      // Pan from current mouse position back to center
      x = mousePos.x + (0.5 - mousePos.x) * eased
      y = mousePos.y + (0.5 - mousePos.y) * eased

      if (this.debugMode && outroElapsed % 50 < 10) {
        console.log(`  📍 OUTRO: progress=${progress.toFixed(2)}, eased=${eased.toFixed(2)}, scale=${scale.toFixed(2)}`)
      }
    }
    // Middle phase - TRACK MOUSE PRECISELY
    else {
      scale = activeZoom.params.scale
      
      // IMPORTANT: During tracking, the camera should follow the mouse exactly
      // This centers the zoomed view on the mouse position
      x = mousePos.x
      y = mousePos.y

      if (this.debugMode && timestamp % 500 < 10) {  // Reduce log frequency
        console.log(`  📍 TRACKING: centering view on mouse=(${mousePos.x.toFixed(3)}, ${mousePos.y.toFixed(3)}) -> camera at (${x.toFixed(3)}, ${y.toFixed(3)})`)
        console.log(`     Scale: ${scale.toFixed(2)}x, View will be centered on (${x.toFixed(3)}, ${y.toFixed(3)})`)
        console.log(`     ✅ Camera EXACTLY matches mouse position during tracking`)
      }
    }

    // NO CLAMPING! Allow camera to go outside video bounds
    // This lets us always center on the mouse, showing background when needed
    
    if (this.debugMode && timestamp % 100 < 50) {
      const viewportSize = 1 / scale
      console.log(`  📷 CAMERA: pos=(${x.toFixed(3)}, ${y.toFixed(3)}), scale=${scale.toFixed(2)}`)
      
      // Check if we're showing area outside the video
      const halfViewport = viewportSize / 2
      const showingLeftEdge = x - halfViewport < 0
      const showingRightEdge = x + halfViewport > 1
      const showingTopEdge = y - halfViewport < 0
      const showingBottomEdge = y + halfViewport > 1
      
      if (showingLeftEdge || showingRightEdge || showingTopEdge || showingBottomEdge) {
        console.log(`     🖼️ Showing background: ${
          [showingLeftEdge && 'LEFT', showingRightEdge && 'RIGHT', 
           showingTopEdge && 'TOP', showingBottomEdge && 'BOTTOM'].filter(Boolean).join(', ')
        }`)
      }
    }

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

      // Normalize using the actual screen dimensions from the recording
      // Mouse coordinates are in screen space, normalize to 0-1 range
      const beforeX = before.x / (before.screenWidth || this.videoWidth)
      const beforeY = before.y / (before.screenHeight || this.videoHeight)
      const afterX = after.x / (after.screenWidth || this.videoWidth)
      const afterY = after.y / (after.screenHeight || this.videoHeight)
      
      // Debug log to check coordinate normalization
      if (this.debugMode && Math.random() < 0.01) {
        console.log(`🐭 Mouse interpolation:`, {
          before: `(${before.x}, ${before.y}) in ${before.screenWidth}x${before.screenHeight}`,
          after: `(${after.x}, ${after.y}) in ${after.screenWidth}x${after.screenHeight}`,
          normalized: `(${beforeX.toFixed(3)}, ${beforeY.toFixed(3)}) -> (${afterX.toFixed(3)}, ${afterY.toFixed(3)})`,
          videoSize: `${this.videoWidth}x${this.videoHeight}`
        })
      }

      return {
        x: beforeX + (afterX - beforeX) * smoothProgress,
        y: beforeY + (afterY - beforeY) * smoothProgress
      }
    }

    // Use nearest event
    if (before) {
      return {
        x: before.x / (before.screenWidth || this.videoWidth),
        y: before.y / (before.screenHeight || this.videoHeight)
      }
    }

    if (after) {
      return {
        x: after.x / (after.screenWidth || this.videoWidth),
        y: after.y / (after.screenHeight || this.videoHeight)
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
    zoom: { x: number; y: number; scale: number },
    currentTime?: number
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

    // DON'T clamp! Allow showing outside bounds (will be handled in drawing)

    // Verify centering accuracy
    const actualCenterX = sx + (zoomWidth / 2)
    const actualCenterY = sy + (zoomHeight / 2)
    const centerErrorX = Math.abs(actualCenterX - centerX)
    const centerErrorY = Math.abs(actualCenterY - centerY)

    // Only log during tracking phase for clearer debugging
    if (this.debugMode && currentTime !== undefined && zoom.scale > 1.0) {
      // Get the actual mouse position for comparison
      const mousePos = this.getInterpolatedMousePosition(currentTime)
      const mousePixelX = mousePos.x * sourceWidth
      const mousePixelY = mousePos.y * sourceHeight
      
      // Only log occasionally to reduce spam
      if (currentTime % 500 < 50) {
        console.log(`📐 CANVAS RENDER at ${(currentTime/1000).toFixed(2)}s:`, {
          zoomCenter: `(${zoom.x.toFixed(3)}, ${zoom.y.toFixed(3)}) @ ${zoom.scale.toFixed(2)}x`,
          mousePos: `(${mousePos.x.toFixed(3)}, ${mousePos.y.toFixed(3)})`,
          mousePx: `(${mousePixelX.toFixed(0)}, ${mousePixelY.toFixed(0)})`,
          centerPx: `(${centerX.toFixed(0)}, ${centerY.toFixed(0)})`,
          extractRegion: `(${sx.toFixed(0)}, ${sy.toFixed(0)}) size: ${zoomWidth.toFixed(0)}x${zoomHeight.toFixed(0)}`,
          canvasVsSource: `canvas=${width}x${height}, source=${sourceWidth}x${sourceHeight}`,
          shouldMatch: Math.abs(zoom.x - mousePos.x) < 0.01 && Math.abs(zoom.y - mousePos.y) < 0.01 ? 
            '✅ Camera centered on mouse' : 
            `⚠️ Camera offset from mouse by (${(zoom.x - mousePos.x).toFixed(3)}, ${(zoom.y - mousePos.y).toFixed(3)})`
        })
      }
    }

    // Only fill background if we're showing area outside the video
    if (sx < 0 || sy < 0 || sx + zoomWidth > sourceWidth || sy + zoomHeight > sourceHeight) {
      // Fill with a dark background where video doesn't exist
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, width, height)
    } else {
      // Just clear for better performance when fully in bounds
      ctx.clearRect(0, 0, width, height)
    }
    
    // Calculate the actual region to draw (clipped to source bounds)
    let actualSx = Math.max(0, sx)
    let actualSy = Math.max(0, sy)
    let actualSWidth = Math.min(sourceWidth - actualSx, zoomWidth - (actualSx - sx))
    let actualSHeight = Math.min(sourceHeight - actualSy, zoomHeight - (actualSy - sy))
    
    // Calculate where to draw on the destination canvas
    let dx = sx < 0 ? (-sx / zoomWidth) * width : 0
    let dy = sy < 0 ? (-sy / zoomHeight) * height : 0
    let dWidth = (actualSWidth / zoomWidth) * width
    let dHeight = (actualSHeight / zoomHeight) * height
    
    // Use medium quality for better performance during playback
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'
    
    // Only draw if there's something to draw
    if (actualSWidth > 0 && actualSHeight > 0) {
      ctx.drawImage(
        source as CanvasImageSource,
        actualSx, actualSy, actualSWidth, actualSHeight,
        dx, dy, dWidth, dHeight
      )
    }

    // Draw debug overlay if zoom is active
    if (this.debugMode && zoom.scale > 1.0) {
      // Save context state
      ctx.save()

      // Get mouse position if we have timestamp
      let mouseScreenX = width / 2
      let mouseScreenY = height / 2
      
      if (currentTime !== undefined) {
        const mousePos = this.getInterpolatedMousePosition(currentTime)
        
        // Convert mouse position from normalized to source pixel coordinates
        const mouseSourceX = mousePos.x * sourceWidth
        const mouseSourceY = mousePos.y * sourceHeight
        
        // Calculate where this point appears in our zoomed/panned view
        // sx, sy is the top-left corner of the extracted region
        // The mouse position relative to this extraction region:
        const mouseInExtractX = mouseSourceX - sx
        const mouseInExtractY = mouseSourceY - sy
        
        // Scale to canvas coordinates
        mouseScreenX = (mouseInExtractX / zoomWidth) * width
        mouseScreenY = (mouseInExtractY / zoomHeight) * height
        
        // During perfect tracking, mouse should be at center
        // Log if there's a discrepancy
        const expectedCenterX = width / 2
        const expectedCenterY = height / 2
        const errorX = Math.abs(mouseScreenX - expectedCenterX)
        const errorY = Math.abs(mouseScreenY - expectedCenterY)
        
        if (this.debugMode && errorX > 10 || errorY > 10) {
          console.log(`🔴 Mouse position error: mouse at (${mouseScreenX.toFixed(0)}, ${mouseScreenY.toFixed(0)}) should be at center (${expectedCenterX}, ${expectedCenterY})`)
        }
      }

      // Draw crosshair at center of canvas (shows where camera is centered)
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

      // Draw mouse position indicator (green)
      if (mouseScreenX >= 0 && mouseScreenX <= width && mouseScreenY >= 0 && mouseScreenY <= height) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'
        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)'
        ctx.lineWidth = 3
        
        // Draw mouse indicator
        ctx.beginPath()
        ctx.arc(mouseScreenX, mouseScreenY, 15, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        
        // Draw line from center to mouse
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(canvasCenterX, canvasCenterY)
        ctx.lineTo(mouseScreenX, mouseScreenY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw zoom info
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
interface MouseEvent {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
}

interface ZoomKeyframe {
  timestamp: number
  x: number
  y: number
  scale: number
  reason: string
}

interface ZoomOptions {
  enabled?: boolean
  sensitivity?: number
  maxZoom?: number
  zoomSpeed?: number
  smoothing?: boolean
  clickZoom?: boolean
  panSpeed?: number
}

interface ZoomState {
  x: number
  y: number
  scale: number
  vx: number // velocity x
  vy: number // velocity y
  vs: number // velocity scale
}

export class ZoomEngine {
  private keyframes: ZoomKeyframe[] = []
  private currentState: ZoomState = {
    x: 0.5,
    y: 0.5,
    scale: 1,
    vx: 0,
    vy: 0,
    vs: 0
  }

  // Spring physics constants for ultra-smooth movement
  private readonly SPRING_STIFFNESS = 0.08 // Lower = smoother
  private readonly SPRING_DAMPING = 0.92 // Higher = less bouncy
  private readonly FOLLOW_SPEED = 0.15 // How quickly camera follows mouse

  // Intelligent zoom thresholds
  private readonly MOVEMENT_THRESHOLD = 30 // pixels - minimum movement to trigger zoom
  private readonly IDLE_THRESHOLD = 800 // ms - time before zooming out
  private readonly ZOOM_IN_DELAY = 150 // ms - delay before zooming in
  private readonly ZOOM_OUT_DELAY = 1000 // ms - delay before zooming out
  private readonly CLICK_ZOOM_DURATION = 600 // ms - how long click zoom lasts
  
  // Zoom levels
  private readonly ZOOM_LEVELS = {
    normal: 1.0,
    focused: 1.8, // Normal zoom when following mouse
    click: 2.2, // Stronger zoom on click
    max: 2.5
  }

  constructor(private options: ZoomOptions = {}) {
    this.options = {
      enabled: true,
      sensitivity: 1.0,
      maxZoom: this.ZOOM_LEVELS.max,
      zoomSpeed: 0.1,
      smoothing: true,
      clickZoom: true,
      panSpeed: 0.05,
      ...options
    }
  }

  generateKeyframes(events: MouseEvent[], videoDuration: number, videoWidth: number, videoHeight: number): ZoomKeyframe[] {
    console.log(`🎯 ZoomEngine.generateKeyframes: enabled=${this.options.enabled}, events=${events.length}, duration=${videoDuration}ms`)
    
    if (!this.options.enabled || events.length === 0 || videoDuration <= 0) {
      console.log('⚠️ Returning default keyframe due to:', { enabled: this.options.enabled, eventsLength: events.length, duration: videoDuration })
      return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' }]
    }

    this.keyframes = []
    
    // State tracking
    let isZoomed = false
    let zoomStartTime = 0
    let lastSignificantMove = 0
    let lastPosition = { x: videoWidth / 2, y: videoHeight / 2 }
    let mouseVelocity = { x: 0, y: 0 }
    let activityLevel = 0 // 0-1, how active the user is
    
    // Add initial keyframe
    this.keyframes.push({ 
      timestamp: 0, 
      x: 0.5, 
      y: 0.5, 
      scale: 1, 
      reason: 'start' 
    })

    // Analyze events to create intelligent zoom behavior
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const normalizedX = event.mouseX / videoWidth
      const normalizedY = event.mouseY / videoHeight
      const currentTime = event.timestamp
      
      if (event.eventType === 'click') {
        // Clicks always trigger zoom for focus
        activityLevel = 1
        lastSignificantMove = currentTime
        
        if (!isZoomed) {
          // Smooth transition to zoomed state
          this.keyframes.push({
            timestamp: currentTime,
            x: this.keyframes[this.keyframes.length - 1].x,
            y: this.keyframes[this.keyframes.length - 1].y,
            scale: this.keyframes[this.keyframes.length - 1].scale,
            reason: 'pre-click'
          })
          
          this.keyframes.push({
            timestamp: currentTime + 200,
            x: normalizedX,
            y: normalizedY,
            scale: this.ZOOM_LEVELS.click,
            reason: 'click-zoom'
          })
          
          isZoomed = true
          zoomStartTime = currentTime
        } else {
          // Re-center on new click location
          this.keyframes.push({
            timestamp: currentTime + 100,
            x: normalizedX,
            y: normalizedY,
            scale: this.ZOOM_LEVELS.click,
            reason: 'click-recenter'
          })
        }
        
        // Hold the zoom for a bit after click
        this.keyframes.push({
          timestamp: currentTime + this.CLICK_ZOOM_DURATION,
          x: normalizedX,
          y: normalizedY,
          scale: this.ZOOM_LEVELS.focused,
          reason: 'click-hold'
        })
        
      } else if (event.eventType === 'mouse') {
        // Calculate movement metrics
        const deltaX = event.mouseX - lastPosition.x
        const deltaY = event.mouseY - lastPosition.y
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const timeDelta = Math.max(1, currentTime - (events[i-1]?.timestamp || currentTime))
        
        // Update velocity (smooth it over time)
        mouseVelocity.x = mouseVelocity.x * 0.7 + (deltaX / timeDelta) * 0.3
        mouseVelocity.y = mouseVelocity.y * 0.7 + (deltaY / timeDelta) * 0.3
        const speed = Math.sqrt(mouseVelocity.x ** 2 + mouseVelocity.y ** 2)
        
        // Update activity level based on movement
        if (distance > this.MOVEMENT_THRESHOLD) {
          activityLevel = Math.min(1, activityLevel + 0.2)
          lastSignificantMove = currentTime
          
          if (!isZoomed && currentTime - lastSignificantMove < this.ZOOM_IN_DELAY) {
            // Start zooming in due to activity
            const targetX = normalizedX + (mouseVelocity.x * 0.05) // Predict ahead slightly
            const targetY = normalizedY + (mouseVelocity.y * 0.05)
            
            this.keyframes.push({
              timestamp: currentTime,
              x: this.keyframes[this.keyframes.length - 1].x,
              y: this.keyframes[this.keyframes.length - 1].y,
              scale: 1.0,
              reason: 'movement-start'
            })
            
            this.keyframes.push({
              timestamp: currentTime + 250,
              x: Math.max(0.2, Math.min(0.8, targetX)), // Keep within safe bounds
              y: Math.max(0.2, Math.min(0.8, targetY)),
              scale: this.ZOOM_LEVELS.focused,
              reason: 'movement-zoom'
            })
            
            isZoomed = true
            zoomStartTime = currentTime
          } else if (isZoomed) {
            // Intelligently follow the mouse while zoomed
            const lastKF = this.keyframes[this.keyframes.length - 1]
            
            // Only add keyframe if we've moved enough or changed direction significantly
            const needsKeyframe = 
              Math.abs(normalizedX - lastKF.x) > 0.05 ||
              Math.abs(normalizedY - lastKF.y) > 0.05 ||
              (currentTime - lastKF.timestamp) > 500
            
            if (needsKeyframe) {
              // Smooth following with lead room
              const leadFactor = Math.min(0.1, speed * 0.001)
              const targetX = normalizedX + (mouseVelocity.x * leadFactor)
              const targetY = normalizedY + (mouseVelocity.y * leadFactor)
              
              // Blend between current and target for smooth following
              const followX = lastKF.x * (1 - this.FOLLOW_SPEED) + targetX * this.FOLLOW_SPEED
              const followY = lastKF.y * (1 - this.FOLLOW_SPEED) + targetY * this.FOLLOW_SPEED
              
              this.keyframes.push({
                timestamp: currentTime,
                x: Math.max(0.2, Math.min(0.8, followX)),
                y: Math.max(0.2, Math.min(0.8, followY)),
                scale: this.ZOOM_LEVELS.focused,
                reason: 'smooth-follow'
              })
            }
          }
        } else {
          // Decay activity when idle
          activityLevel = Math.max(0, activityLevel - 0.01)
          
          // Check if we should zoom out due to inactivity
          if (isZoomed && currentTime - lastSignificantMove > this.IDLE_THRESHOLD) {
            // Smooth zoom out
            this.keyframes.push({
              timestamp: currentTime,
              x: this.keyframes[this.keyframes.length - 1].x,
              y: this.keyframes[this.keyframes.length - 1].y,
              scale: this.ZOOM_LEVELS.focused,
              reason: 'idle-start'
            })
            
            this.keyframes.push({
              timestamp: currentTime + 400,
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              reason: 'idle-zoom-out'
            })
            
            isZoomed = false
            activityLevel = 0
          }
        }
        
        lastPosition = { x: event.mouseX, y: event.mouseY }
      }
    }

    // Ensure we end at normal zoom if still zoomed
    const lastKeyframe = this.keyframes[this.keyframes.length - 1]
    if (lastKeyframe.scale > 1.0) {
      this.keyframes.push({
        timestamp: Math.min(videoDuration - 500, lastKeyframe.timestamp + 1000),
        x: 0.5,
        y: 0.5,
        scale: 1.0,
        reason: 'end-normalize'
      })
    }

    // Add final keyframe at video duration
    if (this.keyframes[this.keyframes.length - 1].timestamp < videoDuration) {
      const last = this.keyframes[this.keyframes.length - 1]
      this.keyframes.push({
        timestamp: videoDuration,
        x: last.x,
        y: last.y,
        scale: last.scale,
        reason: 'duration-end'
      })
    }

    console.log(`🔍 Generated ${this.keyframes.length} intelligent zoom keyframes`)
    return this.keyframes
  }

  getZoomAtTime(timestamp: number): { x: number; y: number; scale: number } {
    if (this.keyframes.length === 0) {
      return { x: 0.5, y: 0.5, scale: 1 }
    }

    // Find surrounding keyframes
    let before = this.keyframes[0]
    let after = this.keyframes[this.keyframes.length - 1]

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.keyframes[i].timestamp <= timestamp && this.keyframes[i + 1].timestamp > timestamp) {
        before = this.keyframes[i]
        after = this.keyframes[i + 1]
        break
      }
    }

    if (timestamp <= before.timestamp) return { x: before.x, y: before.y, scale: before.scale }
    if (timestamp >= after.timestamp) return { x: after.x, y: after.y, scale: after.scale }

    // Calculate interpolation progress
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    
    // Choose easing based on the type of transition
    let easedProgress: number
    
    if (after.reason.includes('click')) {
      // Fast, responsive for clicks
      easedProgress = this.easeOutExpo(progress)
    } else if (after.reason.includes('follow')) {
      // Ultra smooth for following
      easedProgress = this.easeInOutSine(progress)
    } else if (after.reason.includes('idle') || after.reason.includes('out')) {
      // Gentle ease out when returning to normal
      easedProgress = this.easeInOutQuad(progress)
    } else if (after.reason.includes('zoom')) {
      // Smooth zoom transitions
      easedProgress = this.smoothStep(progress)
    } else {
      // Default smooth
      easedProgress = this.easeInOutCubic(progress)
    }

    // Apply spring physics for even smoother movement
    const springProgress = this.applySpringPhysics(easedProgress, before, after)

    return {
      x: before.x + (after.x - before.x) * springProgress,
      y: before.y + (after.y - before.y) * springProgress,
      scale: before.scale + (after.scale - before.scale) * easedProgress // Scale doesn't use spring
    }
  }

  private applySpringPhysics(progress: number, before: ZoomKeyframe, after: ZoomKeyframe): number {
    // Add subtle spring overshoot for position changes
    const overshoot = 0.05
    const tension = 0.4
    
    if (progress < 0.5) {
      // Accelerate
      return progress * progress * (1 + overshoot)
    } else {
      // Decelerate with slight overshoot
      const p = (progress - 0.5) * 2
      return 0.5 + 0.5 * (1 - Math.pow(1 - p, 3)) * (1 + overshoot * Math.cos(p * Math.PI * tension))
    }
  }

  // Smooth step function for very smooth transitions
  private smoothStep(t: number): number {
    const t2 = t * t
    const t3 = t2 * t
    return 3 * t2 - 2 * t3
  }

  // Exponential out for quick zoom with smooth ending
  private easeOutExpo(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
  }

  // Sine in/out for ultra smooth panning
  private easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2
  }

  // Quadratic in/out for gentle transitions
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  // Cubic in/out for smooth acceleration/deceleration
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  applyZoomToCanvas(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    zoom: { x: number; y: number; scale: number }
  ) {
    const { width, height } = ctx.canvas

    // Determine source dimensions
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height

    if (!sourceWidth || !sourceHeight) {
      return
    }
    
    // Only log significant zooms occasionally
    if (zoom.scale > 1.1 && Math.random() < 0.01) {
      console.log(`🎬 Applying zoom: scale=${zoom.scale.toFixed(2)}, center=(${zoom.x.toFixed(2)}, ${zoom.y.toFixed(2)})`)
    }

    // Calculate the zoomed region with smooth boundaries
    const zoomWidth = sourceWidth / Math.max(zoom.scale, 1)
    const zoomHeight = sourceHeight / Math.max(zoom.scale, 1)

    // Calculate source coordinates with clamping to prevent edge artifacts
    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight
    
    const sx = Math.max(0, Math.min(sourceWidth - zoomWidth, centerX - zoomWidth / 2))
    const sy = Math.max(0, Math.min(sourceHeight - zoomHeight, centerY - zoomHeight / 2))

    // Clear and draw with antialiasing
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, width, height)
    
    ctx.drawImage(
      source as CanvasImageSource,
      sx, sy, zoomWidth, zoomHeight,  // Source rectangle
      0, 0, width, height              // Destination rectangle
    )
  }

  getKeyframes(): ZoomKeyframe[] {
    return this.keyframes
  }
}
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

export class ZoomEngine {
  private keyframes: ZoomKeyframe[] = []
  private currentZoom = { x: 0.5, y: 0.5, scale: 1 }
  private targetZoom = { x: 0.5, y: 0.5, scale: 1 }
  private springVelocity = { x: 0, y: 0, scale: 0 }

  // Spring physics constants
  private readonly SPRING_STIFFNESS = 0.06
  private readonly SPRING_DAMPING = 0.85

  constructor(private options: ZoomOptions = {}) {
    this.options = {
      enabled: true,
      sensitivity: 1.0,
      maxZoom: 2.5,
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
    let lastMousePos = { x: 0.5, y: 0.5, time: 0 }
    let isZoomed = false
    let lastMovementTime = 0
    let mouseIdleTime = 0
    
    // Screen Studio-like thresholds
    const mouseIdleThreshold = 500 // ms - mouse disappears after this
    const zoomInDelay = 200 // ms - delay before zooming in on movement
    const zoomOutDelay = 800 // ms - delay before zooming out when idle
    const movementThreshold = 0.015 // minimum movement to trigger zoom
    const smoothFollowSpeed = 0.25 // how quickly camera follows mouse

    // Add initial keyframe
    this.keyframes.push({ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' })

    // Process events with Screen Studio-like behavior
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const normalizedX = event.mouseX / videoWidth
      const normalizedY = event.mouseY / videoHeight
      
      if (event.eventType === 'mouse') {
        // Calculate movement distance
        const distance = Math.sqrt(
          Math.pow(normalizedX - lastMousePos.x, 2) + 
          Math.pow(normalizedY - lastMousePos.y, 2)
        )
        
        // Check if mouse moved significantly
        if (distance > movementThreshold) {
          const timeSinceLastMove = event.timestamp - lastMovementTime
          
          // If mouse was idle and starts moving, zoom in with delay
          if (!isZoomed && timeSinceLastMove > zoomInDelay) {
            // Add smooth zoom in with follow effect
            this.keyframes.push({
              timestamp: event.timestamp,
              x: lastMousePos.x * (1 - smoothFollowSpeed) + normalizedX * smoothFollowSpeed,
              y: lastMousePos.y * (1 - smoothFollowSpeed) + normalizedY * smoothFollowSpeed,
              scale: 1.0,
              reason: 'pre-zoom'
            })
            
            this.keyframes.push({
              timestamp: event.timestamp + 150,
              x: normalizedX,
              y: normalizedY,
              scale: 1.8, // Screen Studio uses around 1.8x zoom
              reason: 'mouse-follow'
            })
            
            isZoomed = true
          } else if (isZoomed) {
            // Smooth camera follow with delay
            const lastKF = this.keyframes[this.keyframes.length - 1]
            const followX = lastKF.x * (1 - smoothFollowSpeed) + normalizedX * smoothFollowSpeed
            const followY = lastKF.y * (1 - smoothFollowSpeed) + normalizedY * smoothFollowSpeed
            
            // Only add keyframe if position changed enough
            if (Math.abs(followX - lastKF.x) > 0.01 || Math.abs(followY - lastKF.y) > 0.01) {
              this.keyframes.push({
                timestamp: event.timestamp,
                x: followX,
                y: followY,
                scale: 1.8,
                reason: 'follow'
              })
            }
          }
          
          lastMovementTime = event.timestamp
          lastMousePos = { x: normalizedX, y: normalizedY, time: event.timestamp }
        } else {
          // Mouse is idle
          mouseIdleTime = event.timestamp - lastMovementTime
          
          // Zoom out if idle for too long
          if (isZoomed && mouseIdleTime > zoomOutDelay) {
            this.keyframes.push({
              timestamp: event.timestamp,
              x: this.keyframes[this.keyframes.length - 1].x,
              y: this.keyframes[this.keyframes.length - 1].y,
              scale: 1.8,
              reason: 'hold'
            })
            
            this.keyframes.push({
              timestamp: event.timestamp + 300,
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              reason: 'idle-out'
            })
            
            isZoomed = false
          }
        }
      } else if (event.eventType === 'click') {
        // On click, immediate zoom to click location
        const timestamp = event.timestamp
        
        if (!isZoomed) {
          this.keyframes.push({
            timestamp: timestamp,
            x: normalizedX,
            y: normalizedY,
            scale: 2.0, // Stronger zoom on click
            reason: 'click'
          })
          isZoomed = true
        } else {
          // Re-center on click
          this.keyframes.push({
            timestamp: timestamp,
            x: normalizedX,
            y: normalizedY,
            scale: 2.0,
            reason: 'click-recenter'
          })
        }
        
        lastMovementTime = timestamp
        lastMousePos = { x: normalizedX, y: normalizedY, time: timestamp }
      }
    }

    // Add final keyframe to return to normal if still zoomed
    if (isZoomed && this.keyframes.length > 0) {
      const lastTime = this.keyframes[this.keyframes.length - 1].timestamp
      this.keyframes.push({
        timestamp: lastTime + 1000,
        x: 0.5,
        y: 0.5,
        scale: 1,
        reason: 'end'
      })
    }

    // Ensure we end at the video duration
    if (this.keyframes[this.keyframes.length - 1].timestamp < videoDuration) {
      this.keyframes.push({
        timestamp: videoDuration,
        x: this.keyframes[this.keyframes.length - 1].x,
        y: this.keyframes[this.keyframes.length - 1].y,
        scale: this.keyframes[this.keyframes.length - 1].scale,
        reason: 'duration-end'
      })
    }

    console.log(`🔍 Generated ${this.keyframes.length} zoom keyframes`)
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

    // Use different interpolation based on the reason for zoom
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    let eased: number

    // Use different easing based on the type of animation
    if (before.reason === 'click' || after.reason === 'click') {
      // Fast zoom in, smooth zoom out for clicks
      eased = this.easeOutExpo(progress)
    } else if (before.reason === 'follow' || after.reason === 'follow' || before.reason === 'mouse-follow') {
      // Very smooth following
      eased = this.easeInOutSine(progress)
    } else if (after.reason === 'idle-out' || after.reason === 'end') {
      // Smooth return to normal
      eased = this.easeInOutQuad(progress)
    } else {
      // Default smooth easing
      eased = this.smoothStep(progress)
    }

    return {
      x: before.x + (after.x - before.x) * eased,
      y: before.y + (after.y - before.y) * eased,
      scale: before.scale + (after.scale - before.scale) * eased
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
      // Nothing to draw yet
      return
    }
    
    // Debug zoom application (only log significant zooms)
    if (zoom.scale > 1.1 && Math.random() < 0.01) { // Log occasionally to avoid spam
      console.log(`🎬 Applying zoom: scale=${zoom.scale.toFixed(2)}, center=(${zoom.x.toFixed(2)}, ${zoom.y.toFixed(2)})`)
    }

    // Calculate the zoomed region
    const zoomWidth = sourceWidth / Math.max(zoom.scale, 1)
    const zoomHeight = sourceHeight / Math.max(zoom.scale, 1)

    // Calculate source coordinates (ensuring we stay within bounds)
    const sx = Math.max(0, Math.min(sourceWidth - zoomWidth, zoom.x * sourceWidth - zoomWidth / 2))
    const sy = Math.max(0, Math.min(sourceHeight - zoomHeight, zoom.y * sourceHeight - zoomHeight / 2))

    // Clear and draw the zoomed portion
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
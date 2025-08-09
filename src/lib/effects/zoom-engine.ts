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
    if (!this.options.enabled || events.length === 0 || videoDuration <= 0) {
      return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' }]
    }

    this.keyframes = []
    let lastActivity = 0
    let isZoomed = false
    let zoomCenter = { x: 0.5, y: 0.5 }
    let lastClickTime = 0
    let clickCount = 0

    // More permissive thresholds for non-click sessions
    const movePanThreshold = 0.008 * (this.options.sensitivity || 1) // was 0.02
    const hoverStableTime = 300 // ms, was 500
    const inactivityZoomOut = 900 // ms, was 1500
    const minKeyframeGap = 90 // ms between generated KFs

    // Add initial keyframe
    this.keyframes.push({ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' })

    let lastKFTime = 0

    // Analyze events for zoom opportunities
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const normalizedX = event.mouseX / videoWidth
      const normalizedY = event.mouseY / videoHeight

      // Check for click events (zoom in on clicks)
      if (event.eventType === 'click' && this.options.clickZoom) {
        // Track double clicks
        if (event.timestamp - lastClickTime < 500) {
          clickCount++
        } else {
          clickCount = 1
        }
        lastClickTime = event.timestamp

        if (!isZoomed || (clickCount > 1)) {
          // Smooth transition before zoom
          if (this.keyframes[this.keyframes.length - 1].timestamp < event.timestamp - 100) {
            this.keyframes.push({
              timestamp: event.timestamp - 100,
              x: this.keyframes[this.keyframes.length - 1].x,
              y: this.keyframes[this.keyframes.length - 1].y,
              scale: this.keyframes[this.keyframes.length - 1].scale,
              reason: 'pre-zoom'
            })
          }

          // Zoom in on click with dynamic zoom level
          const zoomLevel = clickCount > 1 ? this.options.maxZoom! * 0.85 : this.options.maxZoom! * 0.65
          this.keyframes.push({
            timestamp: event.timestamp + 150, // Slight delay for natural feel
            x: normalizedX,
            y: normalizedY,
            scale: zoomLevel,
            reason: 'click'
          })
          isZoomed = true
          zoomCenter = { x: normalizedX, y: normalizedY }
          lastActivity = event.timestamp
          lastKFTime = event.timestamp + 150
        }
      }

      // Mouse movement handling
      if (event.eventType === 'mouse' && i > 0) {
        const prevEvent = events[i - 1]
        const distance = Math.sqrt(
          Math.pow((event.mouseX - prevEvent.mouseX) / videoWidth, 2) +
          Math.pow((event.mouseY - prevEvent.mouseY) / videoHeight, 2)
        )

        // Auto-zoom on activity if not zoomed yet
        if (!isZoomed && distance > movePanThreshold && (event.timestamp - lastKFTime) > minKeyframeGap) {
          const zoomLevel = this.options.maxZoom! * 0.5
          this.keyframes.push({
            timestamp: event.timestamp,
            x: normalizedX,
            y: normalizedY,
            scale: zoomLevel,
            reason: 'activity-zoom'
          })
          isZoomed = true
          zoomCenter = { x: normalizedX, y: normalizedY }
          lastActivity = event.timestamp
          lastKFTime = event.timestamp
          continue
        }

        // If mouse moved significantly while zoomed, smoothly pan to follow
        if (isZoomed && distance > movePanThreshold) {
          // Exponential smoothing for pan
          const smoothFactor = 0.18
          const panX = zoomCenter.x * (1 - smoothFactor) + normalizedX * smoothFactor
          const panY = zoomCenter.y * (1 - smoothFactor) + normalizedY * smoothFactor

          const lastKeyframe = this.keyframes[this.keyframes.length - 1]
          const panDistance = Math.sqrt(
            Math.pow(panX - lastKeyframe.x, 2) +
            Math.pow(panY - lastKeyframe.y, 2)
          )

          if (panDistance > 0.006 && event.timestamp - lastKFTime > minKeyframeGap) {
            this.keyframes.push({
              timestamp: event.timestamp,
              x: panX,
              y: panY,
              scale: lastKeyframe.scale,
              reason: 'pan'
            })
            zoomCenter = { x: panX, y: panY }
            lastActivity = event.timestamp
            lastKFTime = event.timestamp
          }
        }

        // Intelligent hover detection (more permissive)
        if (!isZoomed && distance < 0.003 * (this.options.sensitivity || 1) && i > 12) {
          // Check if mouse has been stable for at least hoverStableTime
          const recentEvents = events.filter(e =>
            e.timestamp >= event.timestamp - hoverStableTime &&
            e.timestamp <= event.timestamp
          )

          if (recentEvents.length > 5) {
            const avgX = recentEvents.reduce((sum, e) => sum + e.mouseX, 0) / recentEvents.length
            const avgY = recentEvents.reduce((sum, e) => sum + e.mouseY, 0) / recentEvents.length

            const isStable = recentEvents.every(e => {
              const d = Math.sqrt(
                Math.pow((e.mouseX - avgX) / videoWidth, 2) +
                Math.pow((e.mouseY - avgY) / videoHeight, 2)
              )
              return d < 0.012
            })

            if (isStable && event.timestamp - lastActivity > 400 && (event.timestamp - lastKFTime) > minKeyframeGap) {
              // Smooth transition before hover zoom
              this.keyframes.push({
                timestamp: event.timestamp - 120,
                x: 0.5,
                y: 0.5,
                scale: 1,
                reason: 'pre-hover'
              })

              this.keyframes.push({
                timestamp: event.timestamp + 240,
                x: normalizedX,
                y: normalizedY,
                scale: this.options.maxZoom! * 0.45,
                reason: 'hover'
              })
              isZoomed = true
              zoomCenter = { x: normalizedX, y: normalizedY }
              lastActivity = event.timestamp
              lastKFTime = event.timestamp + 240
            }
          }
        }
      }

      // Smart zoom out after inactivity
      if (isZoomed && event.timestamp - lastActivity > inactivityZoomOut && event.timestamp - lastKFTime > minKeyframeGap) {
        const lastKeyframe = this.keyframes[this.keyframes.length - 1]
        this.keyframes.push({
          timestamp: event.timestamp,
          x: lastKeyframe.x,
          y: lastKeyframe.y,
          scale: lastKeyframe.scale,
          reason: 'hold'
        })

        this.keyframes.push({
          timestamp: event.timestamp + 600,
          x: 0.5,
          y: 0.5,
          scale: 1,
          reason: 'timeout'
        })
        isZoomed = false
        lastActivity = event.timestamp
        lastKFTime = event.timestamp + 600
      }
    }

    // Add final keyframe to return to normal
    if (isZoomed) {
      const endTime = Math.max(videoDuration, events[events.length - 1]?.timestamp || videoDuration)
      this.keyframes.push({
        timestamp: endTime,
        x: 0.5,
        y: 0.5,
        scale: 1,
        reason: 'end'
      })
    }

    // Ensure we have a useful set of keyframes
    if (this.keyframes.length < 3) {
      const mid = Math.min(videoDuration * 0.4, (events[events.length - 1]?.timestamp || videoDuration) * 0.6)
      this.keyframes.push({ timestamp: mid, x: 0.5, y: 0.5, scale: this.options.maxZoom! * 0.45, reason: 'fallback-zoom' })
      this.keyframes.push({ timestamp: Math.min(videoDuration, mid + 600), x: 0.5, y: 0.5, scale: 1, reason: 'fallback-out' })
    }

    if (this.keyframes[this.keyframes.length - 1].timestamp < videoDuration) {
      this.keyframes.push({
        timestamp: videoDuration,
        x: this.keyframes[this.keyframes.length - 1].x,
        y: this.keyframes[this.keyframes.length - 1].y,
        scale: this.keyframes[this.keyframes.length - 1].scale,
        reason: 'end'
      })
    }

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
    } else if (before.reason === 'pan' || after.reason === 'pan') {
      // Very smooth panning
      eased = this.easeInOutSine(progress)
    } else if (after.reason === 'timeout' || after.reason === 'end') {
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
    video: HTMLVideoElement,
    zoom: { x: number; y: number; scale: number }
  ) {
    const { width, height } = ctx.canvas

    // Calculate the zoomed region
    const zoomWidth = width / Math.max(zoom.scale, 1)
    const zoomHeight = height / Math.max(zoom.scale, 1)

    // Calculate source coordinates (ensuring we stay within video bounds)
    const sx = Math.max(0, Math.min(video.videoWidth - zoomWidth, zoom.x * video.videoWidth - zoomWidth / 2))
    const sy = Math.max(0, Math.min(video.videoHeight - zoomHeight, zoom.y * video.videoHeight - zoomHeight / 2))

    // Clear and draw the zoomed portion
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(
      video,
      sx, sy, zoomWidth, zoomHeight,  // Source rectangle
      0, 0, width, height              // Destination rectangle
    )
  }

  getKeyframes(): ZoomKeyframe[] {
    return this.keyframes
  }
}
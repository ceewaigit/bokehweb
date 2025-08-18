import type { MouseEvent } from '@/types/project'
import { CursorType, electronToCustomCursor, getCursorImagePath, CURSOR_HOTSPOTS } from './cursor-types'

interface CursorEvent extends Omit<MouseEvent, 'x' | 'y'> {
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  screenWidth: number
  screenHeight: number
  cursorType?: string  // Track cursor type for each event
}

interface CursorOptions {
  size?: number
  clickColor?: string
  smoothing?: boolean
  motionBlur?: boolean
}

interface CursorPoint {
  x: number
  y: number
  timestamp: number
  velocity?: { x: number; y: number }
}

export class CursorRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private cursorImages: Map<CursorType, HTMLImageElement> = new Map()
  private currentCursorType: CursorType = CursorType.ARROW
  private currentCursorImage: HTMLImageElement | null = null
  private events: CursorEvent[] = []
  private sortedPoints: CursorPoint[] = []
  private clickAnimations: Map<string, {
    x: number
    y: number
    radius: number
    opacity: number
    startTime: number
  }> = new Map()

  // Base cursor sizes for normalization (standard cursor is ~24x24)
  private cursorScaleFactors: Map<CursorType, number> = new Map()

  private currentPosition = { x: 0, y: 0 }
  private velocity = { x: 0, y: 0 }
  private lastFrameTime = 0
  private animationFrame: number | null = null
  private video: HTMLVideoElement | null = null
  private isActive = false
  private videoOffset = { x: 0, y: 0, width: 0, height: 0 } // Track video position in canvas
  private effectsEngine: any = null // For getting zoom state
  private recordingWidth = 1920 // Default, will be updated
  private recordingHeight = 1080 // Default, will be updated


  // Motion blur trail
  private trailPoints: Array<{ x: number; y: number; opacity: number }> = []
  private readonly MAX_TRAIL_LENGTH = 5

  constructor(private options: CursorOptions = {}) {
    this.options = {
      size: 1.0,
      clickColor: '#007AFF',
      smoothing: true,
      motionBlur: true,
      ...options
    }

    // Initialize cursor scale factors based on actual image sizes
    this.initializeCursorScaleFactors()

    // Preload all cursor images
    this.preloadCursorImages()
  }

  private initializeCursorScaleFactors() {
    // Define scale factors to normalize cursor sizes
    // These values normalize each cursor to approximately 48x48 base size (2x larger than before)
    this.cursorScaleFactors.set(CursorType.ARROW, 0.28) // 170x230 -> ~48x64
    this.cursorScaleFactors.set(CursorType.IBEAM, 0.54) // 90x180 -> ~48x96
    this.cursorScaleFactors.set(CursorType.POINTING_HAND, 0.75) // 64x64 -> 48x48
    this.cursorScaleFactors.set(CursorType.CLOSED_HAND, 0.75) // 64x64 -> 48x48
    this.cursorScaleFactors.set(CursorType.OPEN_HAND, 0.75) // 64x64 -> 48x48
    this.cursorScaleFactors.set(CursorType.CROSSHAIR, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_LEFT, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_RIGHT, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_UP, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_DOWN, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_LEFT_RIGHT, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.RESIZE_UP_DOWN, 1.0) // 48x48 -> 48x48
    this.cursorScaleFactors.set(CursorType.CONTEXTUAL_MENU, 0.86) // 56x80 -> ~48x68
    this.cursorScaleFactors.set(CursorType.DISAPPEARING_ITEM, 0.86) // 56x80 -> ~48x68
    this.cursorScaleFactors.set(CursorType.DRAG_COPY, 0.86) // 56x80 -> ~48x68
    this.cursorScaleFactors.set(CursorType.DRAG_LINK, 1.5) // 32x42 -> ~48x64
    this.cursorScaleFactors.set(CursorType.OPERATION_NOT_ALLOWED, 0.86) // 56x80 -> ~48x68
    this.cursorScaleFactors.set(CursorType.IBEAM_VERTICAL, 1.34) // 36x32 -> ~48x42
  }

  private preloadCursorImages() {
    // Preload all cursor types for smooth transitions
    const cursorTypes = Object.values(CursorType)

    cursorTypes.forEach(cursorType => {
      const img = new Image()
      img.src = getCursorImagePath(cursorType)

      img.onload = () => {
        this.cursorImages.set(cursorType, img)

        // Set default cursor once arrow is loaded
        if (cursorType === CursorType.ARROW && !this.currentCursorImage) {
          this.currentCursorImage = img
        }
      }
    })
  }

  // Getter for canvas element
  get canvasElement(): HTMLCanvasElement | null {
    return this.canvas
  }

  // Update events after initialization
  updateEvents(events: CursorEvent[]) {
    this.events = events
    this.preprocessEvents()
  }

  attachToVideo(video: HTMLVideoElement, events: CursorEvent[]): HTMLCanvasElement {
    this.video = video
    this.events = events

    // Pre-process events into sorted points for efficient lookup
    this.preprocessEvents()

    // Create canvas overlay
    this.canvas = document.createElement('canvas')
    this.canvas.style.position = 'absolute'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.pointerEvents = 'none'

    // Initialize context (canvas dimensions will be set externally)
    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true // Better performance
    })

    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = 'high'
    }

    // Start the animation loop
    this.startAnimationLoop()

    return this.canvas
  }

  // Update video positioning info for proper cursor alignment
  updateVideoPosition(x: number, y: number, width: number, height: number) {
    this.videoOffset = { x, y, width, height }
  }

  // Set video dimensions for proper normalization
  setVideoDimensions(width: number, height: number) {
    this.recordingWidth = width
    this.recordingHeight = height
  }

  // Set effects engine for zoom state
  setEffectsEngine(engine: any) {
    this.effectsEngine = engine
  }

  private preprocessEvents() {
    this.sortedPoints = this.events
      .map((event, index) => {
        // Use recording dimensions directly for normalization
        // The mouse coordinates should already be in the correct coordinate space
        const x = this.recordingWidth > 0 ? event.mouseX / this.recordingWidth : 0
        const y = this.recordingHeight > 0 ? event.mouseY / this.recordingHeight : 0

        const point: CursorPoint = {
          x,
          y,
          timestamp: event.timestamp
        }

        // Calculate velocity from previous point (in normalized space)
        if (index > 0) {
          const prevEvent = this.events[index - 1]
          const prevX = this.recordingWidth > 0 ? prevEvent.mouseX / this.recordingWidth : 0
          const prevY = this.recordingHeight > 0 ? prevEvent.mouseY / this.recordingHeight : 0
          const dt = (event.timestamp - prevEvent.timestamp) / 1000
          if (dt > 0) {
            point.velocity = {
              x: (x - prevX) / dt,
              y: (y - prevY) / dt
            }
          }
        }

        return point
      })
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  private startAnimationLoop() {
    this.isActive = true

    const animate = (currentTime: number) => {
      // Stop if not active or video ended
      if (!this.isActive || !this.video) {
        this.animationFrame = null
        return
      }

      // Get video time and render
      this.render(this.video.currentTime * 1000, currentTime)

      this.lastFrameTime = currentTime

      // Only continue if still active
      if (this.isActive) {
        this.animationFrame = requestAnimationFrame(animate)
      }
    }

    this.animationFrame = requestAnimationFrame(animate)
  }

  private render(videoTime: number, renderTime: number) {
    if (!this.ctx || !this.canvas || !this.video) return

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Get interpolated position using Catmull-Rom spline (normalized 0-1)
    const targetPos = this.getInterpolatedPosition(videoTime)
    if (!targetPos) return

    // Update cursor type based on current event
    this.updateCursorType(videoTime)

    // Convert normalized coordinates (0-1) to video space coordinates
    // This is resolution-independent, similar to how zoom works
    let videoX = targetPos.x * this.video.videoWidth
    let videoY = targetPos.y * this.video.videoHeight

    // Apply zoom transformations if effects engine is available
    let zoomScale = 1.0
    if (this.effectsEngine) {
      const zoomState = this.effectsEngine.getZoomState(videoTime)
      if (zoomState && zoomState.scale > 1.0) {
        // When zoomed, we need to transform the cursor position
        // to match how the video is transformed

        // Calculate the zoom target point in video space
        const targetX = this.video.videoWidth * zoomState.x
        const targetY = this.video.videoHeight * zoomState.y

        // Calculate the zoomed region dimensions
        const zoomWidth = this.video.videoWidth / zoomState.scale
        const zoomHeight = this.video.videoHeight / zoomState.scale

        // Calculate the top-left corner of the zoomed region
        const sx = Math.max(0, Math.min(this.video.videoWidth - zoomWidth, targetX - zoomWidth / 2))
        const sy = Math.max(0, Math.min(this.video.videoHeight - zoomHeight, targetY - zoomHeight / 2))

        // Transform cursor position from zoomed space to display space
        // The cursor position needs to be adjusted based on the zoom
        videoX = ((videoX - sx) / zoomWidth) * this.video.videoWidth
        videoY = ((videoY - sy) / zoomHeight) * this.video.videoHeight

        // Store zoom scale to apply to cursor size
        zoomScale = zoomState.scale
      }
    }


    // Calculate scaling to map from video space to canvas space
    const scaleX = this.videoOffset.width > 0 ? this.videoOffset.width / this.video.videoWidth : 1
    const scaleY = this.videoOffset.height > 0 ? this.videoOffset.height / this.video.videoHeight : 1

    // Calculate frame delta time for smooth animation
    const deltaTime = this.lastFrameTime ? (renderTime - this.lastFrameTime) / 1000 : 0.016

    // Update velocity for motion blur
    const oldX = this.currentPosition.x
    const oldY = this.currentPosition.y

    // Map video-space coordinates to canvas-space coordinates
    // Use a much lower smoothing factor for that "gliding on ice" effect
    // Lower values = more smoothing/lag, creating a buttery smooth motion
    // Screen Studio uses around 0.03-0.05 for that signature smooth glide
    const baseSmoothing = 0.035 // Much lower for ice-gliding effect

    // Calculate distance to target for dynamic smoothing
    const scaledTargetX = this.videoOffset.x + (videoX * scaleX)
    const scaledTargetY = this.videoOffset.y + (videoY * scaleY)
    const dx = scaledTargetX - this.currentPosition.x
    const dy = scaledTargetY - this.currentPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Dynamic smoothing: faster catch-up for large movements, slower for precision
    // This prevents the cursor from lagging too far behind on quick movements
    let smoothingFactor = baseSmoothing
    if (distance > 200) {
      // For large jumps, increase responsiveness slightly
      smoothingFactor = Math.min(0.08, baseSmoothing + (distance - 200) * 0.0001)
    }

    // Apply smoothing only when enabled
    const appliedSmoothing = this.options.smoothing ? smoothingFactor : 1

    // Use exponential smoothing for that buttery smooth Screen Studio feel
    this.currentPosition.x += dx * appliedSmoothing
    this.currentPosition.y += dy * appliedSmoothing

    // Calculate actual velocity
    if (deltaTime > 0) {
      this.velocity.x = (this.currentPosition.x - oldX) / deltaTime
      this.velocity.y = (this.currentPosition.y - oldY) / deltaTime
    }

    // Update motion blur trail
    if (this.options.motionBlur) {
      this.updateTrail()
    }

    this.checkForClicks(videoTime)

    // Update and render click animations
    this.updateClickAnimations(videoTime)
    this.renderClickAnimations()

    // Render motion blur trail
    if (this.options.motionBlur && this.trailPoints.length > 0) {
      this.renderMotionBlur()
    }

    // Render cursor with zoom scale
    this.renderCursor(zoomScale)
  }

  private getInterpolatedPosition(currentTime: number): CursorPoint | null {
    if (this.sortedPoints.length === 0) {
      // Return a default center position when no events
      return { x: 0.5, y: 0.5, timestamp: currentTime }
    }

    // Binary search for the right time range
    let left = 0
    let right = this.sortedPoints.length - 1

    // Find the two points to interpolate between
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2)
      if (this.sortedPoints[mid].timestamp <= currentTime) {
        left = mid
      } else {
        right = mid
      }
    }

    const p1 = this.sortedPoints[left]
    const p2 = this.sortedPoints[right]

    // If we're at or past the last point, return it
    if (currentTime >= p2.timestamp || left === right) {
      return p2
    }

    // If we're before the first point, return it
    if (currentTime <= p1.timestamp) {
      return p1
    }

    // Use Catmull-Rom spline for smooth interpolation
    if (this.options.smoothing) {
      const p0 = left > 0 ? this.sortedPoints[left - 1] : p1
      const p3 = right < this.sortedPoints.length - 1 ? this.sortedPoints[right + 1] : p2

      const t = (currentTime - p1.timestamp) / (p2.timestamp - p1.timestamp)
      return this.catmullRomInterpolate(p0, p1, p2, p3, t)
    } else {
      // Simple linear interpolation
      const t = (currentTime - p1.timestamp) / (p2.timestamp - p1.timestamp)
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        timestamp: currentTime
      }
    }
  }

  private catmullRomInterpolate(
    p0: CursorPoint,
    p1: CursorPoint,
    p2: CursorPoint,
    p3: CursorPoint,
    t: number
  ): CursorPoint {
    // Catmull-Rom spline interpolation for smooth curves
    // Lower tension for smoother, more flowing curves (like Screen Studio)
    const tension = 0.3 // Reduced for smoother curves

    // Use smooth step function for more natural easing
    // This creates a smoother acceleration/deceleration curve
    const smoothStep = (x: number): number => {
      // Clamp to [0, 1]
      x = Math.max(0, Math.min(1, x))
      // Smooth polynomial: 3x² - 2x³
      return x * x * (3 - 2 * x)
    }

    // Apply double smooth step for extra smoothness (Screen Studio style)
    const easedT = smoothStep(smoothStep(t))
    const t2 = easedT * easedT
    const t3 = t2 * easedT

    // Catmull-Rom spline formula with eased t
    const v0 = (p2.x - p0.x) * tension
    const v1 = (p3.x - p1.x) * tension
    const x = p1.x + v0 * easedT + (3 * (p2.x - p1.x) - 2 * v0 - v1) * t2 + (2 * (p1.x - p2.x) + v0 + v1) * t3

    const v0y = (p2.y - p0.y) * tension
    const v1y = (p3.y - p1.y) * tension
    const y = p1.y + v0y * easedT + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3

    return {
      x: x,
      y: y,
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * t
    }
  }

  private updateTrail() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2)

    // Only add trail points if moving fast enough
    if (speed > 50) {
      this.trailPoints.unshift({
        x: this.currentPosition.x,
        y: this.currentPosition.y,
        opacity: Math.min(1, speed / 500)
      })

      // Limit trail length
      if (this.trailPoints.length > this.MAX_TRAIL_LENGTH) {
        this.trailPoints.pop()
      }
    }

    // Fade out trail points
    this.trailPoints = this.trailPoints
      .map(point => ({ ...point, opacity: point.opacity * 0.85 }))
      .filter(point => point.opacity > 0.01)
  }

  private renderMotionBlur() {
    if (!this.ctx) return

    this.ctx.save()

    // Draw trail with decreasing opacity
    this.trailPoints.forEach((point) => {
      this.ctx!.globalAlpha = point.opacity * 0.3

      if (this.currentCursorImage) {
        const hotspot = CURSOR_HOTSPOTS[this.currentCursorType]
        const baseScale = this.cursorScaleFactors.get(this.currentCursorType) || 0.5
        // Don't apply zoom to motion blur trail
        const finalScale = baseScale * (this.options.size || 1.0)
        const hotspotX = hotspot.x * finalScale
        const hotspotY = hotspot.y * finalScale
        const cursorWidth = this.currentCursorImage.width * finalScale
        const cursorHeight = this.currentCursorImage.height * finalScale

        this.ctx!.drawImage(
          this.currentCursorImage,
          Math.round(point.x - hotspotX),
          Math.round(point.y - hotspotY),
          cursorWidth,
          cursorHeight
        )
      }
    })

    this.ctx.restore()
  }

  private updateCursorType(videoTime: number) {
    // Find the event closest to current video time
    const currentEvent = this.events.find(e =>
      Math.abs(e.timestamp - videoTime) < 50
    )

    if (currentEvent?.cursorType) {
      const newCursorType = electronToCustomCursor(currentEvent.cursorType)

      if (newCursorType !== this.currentCursorType) {
        this.currentCursorType = newCursorType
        this.currentCursorImage = this.cursorImages.get(newCursorType) || this.currentCursorImage
      }
    }
  }

  private renderCursor(zoomScale: number = 1.0) {
    if (!this.ctx || !this.currentCursorImage || !this.currentCursorImage.complete) return

    this.ctx.save()

    // Get proper hotspot for current cursor type
    const hotspot = CURSOR_HOTSPOTS[this.currentCursorType]

    // Get base scale factor for this cursor type to normalize its size
    const baseScale = this.cursorScaleFactors.get(this.currentCursorType) || 0.5

    // Apply user size option AND zoom scale on top of base normalization
    // The cursor should scale with zoom just like in Screen Studio
    const finalScale = baseScale * (this.options.size || 1.0) * zoomScale

    // Scale hotspot based on final cursor size
    const hotspotX = hotspot.x * finalScale
    const hotspotY = hotspot.y * finalScale

    // Constrain cursor position to video bounds if video offset is set
    let renderX = this.currentPosition.x
    let renderY = this.currentPosition.y

    if (this.videoOffset.width > 0 && this.videoOffset.height > 0) {
      // Clamp cursor position to stay within video bounds
      renderX = Math.max(this.videoOffset.x, Math.min(this.videoOffset.x + this.videoOffset.width, renderX))
      renderY = Math.max(this.videoOffset.y, Math.min(this.videoOffset.y + this.videoOffset.height, renderY))
    }

    const x = renderX - hotspotX
    const y = renderY - hotspotY

    // Use subpixel rendering
    this.ctx.imageSmoothingEnabled = true

    // Draw cursor image with proper scaling
    const cursorWidth = this.currentCursorImage.width * finalScale
    const cursorHeight = this.currentCursorImage.height * finalScale
    this.ctx.drawImage(this.currentCursorImage, x, y, cursorWidth, cursorHeight)

    this.ctx.restore()
  }

  private checkForClicks(currentTime: number) {
    if (!this.video || !this.canvas) return

    // Check if any click event occurs at the current time
    const clickEvent = this.events.find(e =>
      e.eventType === 'click' &&
      Math.abs(e.timestamp - currentTime) < 50
    )

    if (clickEvent && !this.clickAnimations.has(`click-${clickEvent.timestamp}`)) {
      // Normalize coordinates, then convert to video space, then to canvas space
      const normalizedX = clickEvent.mouseX / clickEvent.screenWidth
      const normalizedY = clickEvent.mouseY / clickEvent.screenHeight
      const videoX = normalizedX * this.video.videoWidth
      const videoY = normalizedY * this.video.videoHeight
      const scaleX = this.videoOffset.width > 0 ? this.videoOffset.width / this.video.videoWidth : 1
      const scaleY = this.videoOffset.height > 0 ? this.videoOffset.height / this.video.videoHeight : 1
      this.addClickAnimation(
        this.videoOffset.x + (videoX * scaleX),
        this.videoOffset.y + (videoY * scaleY),
        clickEvent.timestamp
      )
    }
  }

  private addClickAnimation(x: number, y: number, timestamp: number) {
    const id = `click-${timestamp}`
    this.clickAnimations.set(id, {
      x,
      y,
      radius: 0,
      opacity: 1,
      startTime: timestamp
    })
  }

  private updateClickAnimations(currentTime: number) {
    this.clickAnimations.forEach((anim, id) => {
      const age = currentTime - anim.startTime
      const maxAge = 400

      if (age > maxAge) {
        this.clickAnimations.delete(id)
        return
      }

      // Ease-out animation for more natural feel
      const progress = 1 - Math.pow(1 - (age / maxAge), 3)
      anim.radius = progress * 30
      anim.opacity = Math.pow(1 - progress, 2)
    })
  }

  private renderClickAnimations() {
    if (!this.ctx) return

    const clickColor = this.options.clickColor || '#007AFF'

    this.clickAnimations.forEach(anim => {
      // Constrain click animation position to video bounds
      let renderX = anim.x
      let renderY = anim.y

      if (this.videoOffset.width > 0 && this.videoOffset.height > 0) {
        renderX = Math.max(this.videoOffset.x, Math.min(this.videoOffset.x + this.videoOffset.width, renderX))
        renderY = Math.max(this.videoOffset.y, Math.min(this.videoOffset.y + this.videoOffset.height, renderY))
      }

      this.ctx!.save()
      this.ctx!.globalAlpha = anim.opacity * 0.6
      this.ctx!.strokeStyle = clickColor
      this.ctx!.lineWidth = 2.5
      this.ctx!.beginPath()
      this.ctx!.arc(renderX, renderY, anim.radius, 0, Math.PI * 2)
      this.ctx!.stroke()

      // Inner circle for better visibility
      this.ctx!.globalAlpha = anim.opacity * 0.3
      this.ctx!.fillStyle = clickColor
      this.ctx!.beginPath()
      this.ctx!.arc(renderX, renderY, anim.radius * 0.3, 0, Math.PI * 2)
      this.ctx!.fill()

      this.ctx!.restore()
    })
  }

  dispose() {
    // Stop the animation loop
    this.isActive = false

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    // Clean up canvas if it exists
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.remove()
    }

    this.canvas = null
    this.ctx = null
    this.video = null
    this.events = []
    this.sortedPoints = []
    this.clickAnimations.clear()
    this.trailPoints = []
    this.cursorImages.clear()
    this.currentCursorImage = null
  }
}
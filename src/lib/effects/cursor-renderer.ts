import type { MouseEvent } from '@/types/project'

interface CursorEvent extends Omit<MouseEvent, 'x' | 'y' | 'screenWidth' | 'screenHeight'> {
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
}

interface CursorOptions {
  size?: number
  color?: string
  clickColor?: string
  smoothing?: boolean
  cursorStyle?: 'macos' | 'windows' | 'custom'
  showDebug?: boolean
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
  private cursorImage: HTMLImageElement
  private events: CursorEvent[] = []
  private sortedPoints: CursorPoint[] = []
  private clickAnimations: Map<string, {
    x: number
    y: number
    radius: number
    opacity: number
    startTime: number
  }> = new Map()

  private currentPosition = { x: 0, y: 0 }
  private velocity = { x: 0, y: 0 }
  private lastFrameTime = 0
  private animationFrame: number | null = null
  private video: HTMLVideoElement | null = null
  private isActive = false
  
  // Performance monitoring
  private frameCount = 0
  private lastFpsTime = 0
  private currentFps = 0
  
  // Motion blur trail
  private trailPoints: Array<{ x: number; y: number; opacity: number }> = []
  private readonly MAX_TRAIL_LENGTH = 5

  constructor(private options: CursorOptions = {}) {
    this.options = {
      size: 2.5, // Increased from 1.5 for better visibility on high-DPI displays
      color: '#000000',
      clickColor: '#007AFF',
      smoothing: true,
      cursorStyle: 'macos',
      showDebug: false,
      motionBlur: true,
      ...options
    }

    // Create cursor image
    this.cursorImage = new Image()
    this.cursorImage.src = this.createCursorDataURL()
  }

  private createCursorDataURL(): string {
    const size = (this.options.size || 2.5) * 24 // Increased base size from 20 to 24
    const color = this.options.color || '#000000'

    // High-quality macOS-style cursor with better anti-aliasing
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
            <feOffset dx="0" dy="1" result="offsetblur"/>
            <feFlood flood-color="#000000" flood-opacity="0.3"/>
            <feComposite in2="offsetblur" operator="in"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <path d="M4,4 L4,19 L7.5,16 L11,22 L14,21 L10.5,15 L16,15 Z" 
              fill="white" 
              filter="url(#shadow)"
              stroke="${color}" 
              stroke-width="0.5"
              stroke-linejoin="round"
              stroke-linecap="round"/>
        
        <path d="M5.5,6 L5.5,15.5 L8,13.5 L10.5,19 L11.5,18.5 L9,13 L13,13 Z" 
              fill="${color}"
              opacity="0.95"/>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
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
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'

    // Match video dimensions
    const updateCanvasSize = () => {
      if (this.canvas && video.videoWidth && video.videoHeight) {
        this.canvas.width = video.videoWidth
        this.canvas.height = video.videoHeight
        this.ctx = this.canvas.getContext('2d', { 
          alpha: true,
          desynchronized: true // Better performance
        })

        if (this.ctx) {
          this.ctx.imageSmoothingEnabled = true
          this.ctx.imageSmoothingQuality = 'high'
        }
      }
    }

    video.addEventListener('loadedmetadata', updateCanvasSize)
    
    // Start the independent animation loop
    this.startAnimationLoop()

    updateCanvasSize()
    return this.canvas
  }

  private preprocessEvents() {
    // Convert events to sorted points with velocity calculation
    this.sortedPoints = this.events
      .map((event, index) => {
        const point: CursorPoint = {
          x: event.mouseX,
          y: event.mouseY,
          timestamp: event.timestamp
        }
        
        // Calculate velocity from previous point
        if (index > 0) {
          const prevEvent = this.events[index - 1]
          const dt = (event.timestamp - prevEvent.timestamp) / 1000
          if (dt > 0) {
            point.velocity = {
              x: (event.mouseX - prevEvent.mouseX) / dt,
              y: (event.mouseY - prevEvent.mouseY) / dt
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
      
      // Calculate FPS
      this.updateFps(currentTime)
      
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

  private updateFps(currentTime: number) {
    this.frameCount++
    if (currentTime >= this.lastFpsTime + 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsTime))
      this.frameCount = 0
      this.lastFpsTime = currentTime
    }
  }

  private render(videoTime: number, renderTime: number) {
    if (!this.ctx || !this.canvas) return

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Get interpolated position using Catmull-Rom spline
    const targetPos = this.getInterpolatedPosition(videoTime)
    if (!targetPos) return

    // Calculate frame delta time for smooth animation
    const deltaTime = this.lastFrameTime ? (renderTime - this.lastFrameTime) / 1000 : 0.016

    // Update velocity for motion blur
    const oldX = this.currentPosition.x
    const oldY = this.currentPosition.y
    
    // Smooth position update with easing
    const smoothingFactor = this.options.smoothing ? 0.25 : 1
    this.currentPosition.x += (targetPos.x - this.currentPosition.x) * smoothingFactor
    this.currentPosition.y += (targetPos.y - this.currentPosition.y) * smoothingFactor
    
    // Calculate actual velocity
    if (deltaTime > 0) {
      this.velocity.x = (this.currentPosition.x - oldX) / deltaTime
      this.velocity.y = (this.currentPosition.y - oldY) / deltaTime
    }

    // Update motion blur trail
    if (this.options.motionBlur) {
      this.updateTrail()
    }

    // Check for click events at current time
    this.checkForClicks(videoTime)

    // Update and render click animations
    this.updateClickAnimations(videoTime)
    this.renderClickAnimations()

    // Render motion blur trail
    if (this.options.motionBlur && this.trailPoints.length > 0) {
      this.renderMotionBlur()
    }

    // Render cursor
    this.renderCursor()

    // Debug info
    if (this.options.showDebug) {
      this.renderDebugInfo()
    }
  }

  private getInterpolatedPosition(currentTime: number): CursorPoint | null {
    if (this.sortedPoints.length === 0) return null
    
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
    const t2 = t * t
    const t3 = t2 * t
    
    const v0 = (p2.x - p0.x) * 0.5
    const v1 = (p3.x - p1.x) * 0.5
    const x = p1.x + v0 * t + (3 * (p2.x - p1.x) - 2 * v0 - v1) * t2 + (2 * (p1.x - p2.x) + v0 + v1) * t3
    
    const v0y = (p2.y - p0.y) * 0.5
    const v1y = (p3.y - p1.y) * 0.5
    const y = p1.y + v0y * t + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3
    
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
    this.trailPoints.forEach((point, index) => {
      this.ctx!.globalAlpha = point.opacity * 0.3
      const cursorSize = (this.options.size || 2.5) * 24
      const hotspotX = (4 / 24) * cursorSize
      const hotspotY = (4 / 24) * cursorSize
      this.ctx!.drawImage(
        this.cursorImage,
        Math.round(point.x - hotspotX),
        Math.round(point.y - hotspotY)
      )
    })
    
    this.ctx.restore()
  }

  private renderCursor() {
    if (!this.ctx || !this.cursorImage.complete) return

    this.ctx.save()
    
    // Proper hotspot positioning - cursor tip should align with actual mouse position
    // For macOS cursor, the hotspot is at approximately (4, 4) in the 24x24 viewBox
    const cursorSize = (this.options.size || 2.5) * 24
    const hotspotX = (4 / 24) * cursorSize // Scale hotspot based on actual cursor size
    const hotspotY = (4 / 24) * cursorSize
    const x = this.currentPosition.x - hotspotX
    const y = this.currentPosition.y - hotspotY
    
    // Use subpixel rendering
    this.ctx.imageSmoothingEnabled = true
    this.ctx.drawImage(this.cursorImage, x, y)
    
    this.ctx.restore()
  }

  private checkForClicks(currentTime: number) {
    // Check if any click event occurs at the current time
    const clickEvent = this.events.find(e => 
      e.eventType === 'click' && 
      Math.abs(e.timestamp - currentTime) < 50
    )
    
    if (clickEvent && !this.clickAnimations.has(`click-${clickEvent.timestamp}`)) {
      this.addClickAnimation(clickEvent.mouseX, clickEvent.mouseY, clickEvent.timestamp)
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
      this.ctx!.save()
      this.ctx!.globalAlpha = anim.opacity * 0.6
      this.ctx!.strokeStyle = clickColor
      this.ctx!.lineWidth = 2.5
      this.ctx!.beginPath()
      this.ctx!.arc(anim.x, anim.y, anim.radius, 0, Math.PI * 2)
      this.ctx!.stroke()
      
      // Inner circle for better visibility
      this.ctx!.globalAlpha = anim.opacity * 0.3
      this.ctx!.fillStyle = clickColor
      this.ctx!.beginPath()
      this.ctx!.arc(anim.x, anim.y, anim.radius * 0.3, 0, Math.PI * 2)
      this.ctx!.fill()
      
      this.ctx!.restore()
    })
  }

  private renderDebugInfo() {
    if (!this.ctx) return
    
    this.ctx.save()
    this.ctx.fillStyle = '#00FF00'
    this.ctx.font = '12px monospace'
    this.ctx.fillText(`FPS: ${this.currentFps}`, 10, 20)
    this.ctx.fillText(`Pos: ${Math.round(this.currentPosition.x)}, ${Math.round(this.currentPosition.y)}`, 10, 35)
    this.ctx.fillText(`Vel: ${Math.round(this.velocity.x)}, ${Math.round(this.velocity.y)}`, 10, 50)
    this.ctx.fillText(`Events: ${this.sortedPoints.length}`, 10, 65)
    this.ctx.restore()
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
  }
}
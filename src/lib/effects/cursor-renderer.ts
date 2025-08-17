import type { MouseEvent } from '@/types/project'

interface CursorEvent extends Omit<MouseEvent, 'x' | 'y'> {
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  screenWidth: number
  screenHeight: number
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
  private videoOffset = { x: 0, y: 0, width: 0, height: 0 } // Track video position in canvas
  private effectsEngine: any = null // For getting zoom state
  
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
    console.log('📍 updateVideoPosition called:', { x, y, width, height })
    this.videoOffset = { x, y, width, height }
  }

  // Set effects engine for zoom state
  setEffectsEngine(engine: any) {
    this.effectsEngine = engine
  }

  private preprocessEvents() {
    // Convert events to sorted points with velocity calculation
    // Store as normalized coordinates (0-1) for resolution independence
    
    // Log first few events to understand the data
    if (this.events.length > 0) {
      console.log('🔍 Raw cursor events (first 3):', this.events.slice(0, 3).map(e => ({
        mouseX: e.mouseX,
        mouseY: e.mouseY,
        screenW: e.screenWidth,
        screenH: e.screenHeight,
        timestamp: e.timestamp
      })))
    }
    
    this.sortedPoints = this.events
      .map((event, index) => {
        // Normalize coordinates to 0-1 range (resolution independent)
        const x = event.mouseX / event.screenWidth
        const y = event.mouseY / event.screenHeight
        
        const point: CursorPoint = {
          x,
          y,
          timestamp: event.timestamp
        }
        
        // Calculate velocity from previous point (in normalized space)
        if (index > 0) {
          const prevEvent = this.events[index - 1]
          const prevX = prevEvent.mouseX / prevEvent.screenWidth
          const prevY = prevEvent.mouseY / prevEvent.screenHeight
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
    if (!this.ctx || !this.canvas || !this.video) return

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Get interpolated position using Catmull-Rom spline (normalized 0-1)
    const targetPos = this.getInterpolatedPosition(videoTime)
    if (!targetPos) return

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
        const centerX = this.video.videoWidth / 2
        const centerY = this.video.videoHeight / 2
        
        // Calculate zoom target in video space
        const targetX = this.video.videoWidth * zoomState.x
        const targetY = this.video.videoHeight * zoomState.y
        
        // Apply the same transformations as the video
        // 1. Translate to center
        videoX -= centerX
        videoY -= centerY
        
        // 2. Scale
        videoX *= zoomState.scale
        videoY *= zoomState.scale
        
        // 3. Pan to keep zoom target centered
        const panX = (targetX - centerX) * (1 - 1 / zoomState.scale)
        const panY = (targetY - centerY) * (1 - 1 / zoomState.scale)
        videoX -= panX
        videoY -= panY
        
        // 4. Translate back
        videoX += centerX
        videoY += centerY
        
        zoomScale = zoomState.scale
      }
    }

    // Log coordinate transformation for debugging (only every 30 frames to reduce spam)
    if (this.frameCount % 30 === 0) {
      console.log('🎯 Cursor Transform:', {
        videoTime: videoTime.toFixed(0),
        normalized: { x: targetPos.x.toFixed(3), y: targetPos.y.toFixed(3) },
        videoSpace: { x: videoX.toFixed(1), y: videoY.toFixed(1) },
        zoomScale: zoomScale.toFixed(2),
        video: { w: this.video.videoWidth, h: this.video.videoHeight },
        canvas: { w: this.canvas.width, h: this.canvas.height },
        videoOffset: { 
          x: this.videoOffset.x.toFixed(1), 
          y: this.videoOffset.y.toFixed(1), 
          w: this.videoOffset.width.toFixed(1), 
          h: this.videoOffset.height.toFixed(1) 
        }
      })
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
    const smoothingFactor = this.options.smoothing ? 0.25 : 1
    const scaledTargetX = this.videoOffset.x + (videoX * scaleX)
    const scaledTargetY = this.videoOffset.y + (videoY * scaleY)
    
    if (this.frameCount % 30 === 0) {
      console.log('🎯 Scaled Target:', {
        scaleX: scaleX.toFixed(2),
        scaleY: scaleY.toFixed(2),
        scaledTarget: { x: scaledTargetX.toFixed(1), y: scaledTargetY.toFixed(1) }
      })
    }
    this.currentPosition.x += (scaledTargetX - this.currentPosition.x) * smoothingFactor
    this.currentPosition.y += (scaledTargetY - this.currentPosition.y) * smoothingFactor
    
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
    this.trailPoints.forEach((point) => {
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
    this.ctx.drawImage(this.cursorImage, x, y)
    
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

  private renderDebugInfo() {
    if (!this.ctx || !this.canvas || !this.video) return
    
    this.ctx.save()
    this.ctx.fillStyle = '#00FF00'
    this.ctx.strokeStyle = '#00FF00'
    this.ctx.lineWidth = 2
    this.ctx.font = '12px monospace'
    
    // Debug text
    let y = 20
    this.ctx.fillText(`FPS: ${this.currentFps}`, 10, y)
    y += 15
    this.ctx.fillText(`Cursor Canvas Pos: (${Math.round(this.currentPosition.x)}, ${Math.round(this.currentPosition.y)})`, 10, y)
    y += 15
    
    // Get current interpolated point for more info
    const currentTime = this.video.currentTime * 1000
    const currentPoint = this.getInterpolatedPosition(currentTime)
    if (currentPoint) {
      this.ctx.fillText(`Video Space Pos: (${Math.round(currentPoint.x)}, ${Math.round(currentPoint.y)})`, 10, y)
      y += 15
    }
    
    // Find raw event data
    const currentEvent = this.events.find(e => Math.abs(e.timestamp - currentTime) < 100)
    if (currentEvent) {
      this.ctx.fillText(`Raw Screen Pos: (${Math.round(currentEvent.mouseX)}, ${Math.round(currentEvent.mouseY)})`, 10, y)
      y += 15
      this.ctx.fillText(`Screen Size: ${currentEvent.screenWidth}x${currentEvent.screenHeight}`, 10, y)
      y += 15
    }
    
    this.ctx.fillText(`Video Size: ${this.video.videoWidth}x${this.video.videoHeight}`, 10, y)
    y += 15
    this.ctx.fillText(`Canvas Size: ${this.canvas.width}x${this.canvas.height}`, 10, y)
    y += 15
    this.ctx.fillText(`Video in Canvas: (${Math.round(this.videoOffset.x)}, ${Math.round(this.videoOffset.y)}) ${Math.round(this.videoOffset.width)}x${Math.round(this.videoOffset.height)}`, 10, y)
    y += 15
    
    const scaleX = this.videoOffset.width > 0 ? this.videoOffset.width / this.video.videoWidth : 1
    const scaleY = this.videoOffset.height > 0 ? this.videoOffset.height / this.video.videoHeight : 1
    this.ctx.fillText(`Scale: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`, 10, y)
    
    // Draw crosshair at cursor position
    this.ctx.beginPath()
    this.ctx.moveTo(this.currentPosition.x - 15, this.currentPosition.y)
    this.ctx.lineTo(this.currentPosition.x + 15, this.currentPosition.y)
    this.ctx.moveTo(this.currentPosition.x, this.currentPosition.y - 15)
    this.ctx.lineTo(this.currentPosition.x, this.currentPosition.y + 15)
    this.ctx.stroke()
    
    // Draw circle around cursor
    this.ctx.beginPath()
    this.ctx.arc(this.currentPosition.x, this.currentPosition.y, 20, 0, Math.PI * 2)
    this.ctx.stroke()
    
    // Draw video bounds rectangle
    this.ctx.strokeStyle = '#FF00FF'
    this.ctx.strokeRect(this.videoOffset.x, this.videoOffset.y, this.videoOffset.width, this.videoOffset.height)
    
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
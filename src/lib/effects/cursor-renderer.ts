"use client"

interface CursorEvent {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
}

interface CursorOptions {
  size?: number
  color?: string
  clickColor?: string
  clickSize?: number
  smoothing?: boolean
  motionBlur?: boolean
  cursorStyle?: 'macos' | 'windows' | 'custom'
}

export class CursorRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private cursorImage: HTMLImageElement
  private events: CursorEvent[] = []
  private currentIndex = 0
  private clickAnimations: Map<string, { x: number; y: number; radius: number; opacity: number; scale: number }> = new Map()
  private previousPosition: { x: number; y: number; timestamp: number } | null = null
  private cursorTrail: Array<{ x: number; y: number; opacity: number }> = []

  constructor(private options: CursorOptions = {}) {
    this.options = {
      size: 1,
      color: '#000000',
      clickColor: '#007AFF',
      smoothing: true,
      motionBlur: true,
      cursorStyle: 'macos',
      ...options
    }
    
    // Create cursor image
    this.cursorImage = new Image()
    this.cursorImage.src = this.createCursorDataURL()
  }

  private createCursorDataURL(): string {
    const size = (this.options.size || 1) * 24
    const color = this.options.color || '#000000'

    if (this.options.cursorStyle === 'macos') {
      // macOS-style cursor with better proportions and shadow
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="cursor-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
              <feOffset dx="0" dy="1" result="offsetblur"/>
              <feFlood flood-color="#000000" flood-opacity="0.25"/>
              <feComposite in2="offsetblur" operator="in"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="cursor-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${color};stop-opacity:0.9" />
            </linearGradient>
          </defs>
          
          <!-- Outer white border for visibility -->
          <path d="M2,2 L2,17 L5.5,14 L8.5,20.5 L11,19.5 L8,13 L14,13 Z" 
                fill="white" 
                filter="url(#cursor-shadow)"/>
          
          <!-- Main cursor shape -->
          <path d="M3,3 L3,15 L5.5,13 L8,18.5 L9.5,18 L7.5,12.5 L12,12.5 Z" 
                fill="url(#cursor-gradient)" 
                stroke="rgba(255,255,255,0.8)" 
                stroke-width="0.5"/>
        </svg>
      `
      return `data:image/svg+xml;base64,${btoa(svg)}`
    }
    
    // Fallback to simple cursor
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,0 L0,16 L4,12 L7,18 L10,17 L7,11 L12,11 Z" 
              fill="${color}" 
              stroke="#ffffff" 
              stroke-width="1"/>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  attachToVideo(video: HTMLVideoElement, events: CursorEvent[]): HTMLCanvasElement {
    this.events = events
    this.currentIndex = 0

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
        this.ctx = this.canvas.getContext('2d')
      }
    }

    video.addEventListener('loadedmetadata', updateCanvasSize)
    video.addEventListener('timeupdate', () => this.render(video.currentTime * 1000))

    // Initial size update
    updateCanvasSize()

    return this.canvas
  }

  private render(currentTime: number) {
    if (!this.ctx || !this.canvas) return

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Find the current cursor position
    const event = this.getCurrentEvent(currentTime)
    if (!event) return

    // Update and render click animations
    this.updateClickAnimations()
    this.renderClickAnimations()

    // Check for new clicks
    if (event.eventType === 'click') {
      this.addClickAnimation(event.mouseX, event.mouseY)
    }

    const x = event.mouseX
    const y = event.mouseY

    // Add motion blur if enabled
    if (this.options.motionBlur && this.previousPosition) {
      const distance = Math.sqrt(
        Math.pow(x - this.previousPosition.x, 2) + 
        Math.pow(y - this.previousPosition.y, 2)
      )
      
      if (distance > 5) {
        // Add to trail for motion blur
        this.cursorTrail.push({ x, y, opacity: 0.3 })
        if (this.cursorTrail.length > 3) {
          this.cursorTrail.shift()
        }
      } else {
        // Clear trail if not moving much
        this.cursorTrail = []
      }
      
      // Render motion blur trail
      this.cursorTrail.forEach((point, index) => {
        const opacity = point.opacity * (index / this.cursorTrail.length)
        this.ctx!.save()
        this.ctx!.globalAlpha = opacity
        if (this.cursorImage.complete) {
          this.ctx!.drawImage(this.cursorImage, point.x - 2, point.y - 2)
        }
        this.ctx!.restore()
      })
    }

    // Render main cursor
    if (this.cursorImage.complete) {
      this.ctx.save()
      
      // Add slight scale animation on click
      const activeClick = Array.from(this.clickAnimations.values())
        .find(anim => anim.opacity > 0.8)
      
      if (activeClick) {
        const scale = 1 + (activeClick.scale - 1) * activeClick.opacity
        this.ctx.translate(x, y)
        this.ctx.scale(scale, scale)
        this.ctx.translate(-x, -y)
      }
      
      this.ctx.drawImage(this.cursorImage, x - 2, y - 2)
      this.ctx.restore()
    }
    
    // Update previous position
    this.previousPosition = { x, y, timestamp: currentTime }
  }

  private getCurrentEvent(currentTime: number): CursorEvent | null {
    // Find the event closest to current time
    let closestEvent = null
    let minDiff = Infinity

    for (const event of this.events) {
      const diff = Math.abs(event.timestamp - currentTime)
      if (diff < minDiff) {
        minDiff = diff
        closestEvent = event
      }

      // If we've passed this timestamp, we can stop searching
      if (event.timestamp > currentTime) break
    }

    // Interpolate between events for smooth movement
    if (this.options.smoothing !== false && closestEvent) {
      const nextEvent = this.events.find(e => e.timestamp > currentTime)
      if (nextEvent && closestEvent !== nextEvent) {
        const progress = (currentTime - closestEvent.timestamp) /
          (nextEvent.timestamp - closestEvent.timestamp)

        return {
          ...closestEvent,
          mouseX: closestEvent.mouseX + (nextEvent.mouseX - closestEvent.mouseX) * progress,
          mouseY: closestEvent.mouseY + (nextEvent.mouseY - closestEvent.mouseY) * progress
        }
      }
    }

    return closestEvent
  }

  private addClickAnimation(x: number, y: number) {
    const id = `${x}-${y}-${Date.now()}`
    this.clickAnimations.set(id, {
      x,
      y,
      radius: 0,
      opacity: 1,
      scale: 1.2
    })
  }

  private updateClickAnimations() {
    this.clickAnimations.forEach((anim, id) => {
      // Smoother animation with easing
      anim.radius += 3 * anim.opacity // Slow down as it fades
      anim.opacity -= 0.04
      anim.scale = 1 + (anim.scale - 1) * 0.9 // Decay scale

      if (anim.opacity <= 0) {
        this.clickAnimations.delete(id)
      }
    })
  }

  private renderClickAnimations() {
    if (!this.ctx) return

    const clickColor = this.options.clickColor || '#007AFF'

    this.clickAnimations.forEach(anim => {
      this.ctx!.save()
      
      // Render multiple rings for a more sophisticated effect
      const rings = 2
      for (let i = 0; i < rings; i++) {
        const ringOpacity = anim.opacity * (1 - i * 0.3)
        const ringRadius = anim.radius + i * 10
        
        this.ctx!.globalAlpha = ringOpacity
        this.ctx!.strokeStyle = clickColor
        this.ctx!.lineWidth = 2 - i * 0.5
        this.ctx!.beginPath()
        this.ctx!.arc(anim.x, anim.y, ringRadius, 0, Math.PI * 2)
        this.ctx!.stroke()
      }
      
      // Add a subtle filled circle at the center
      if (anim.opacity > 0.5) {
        this.ctx!.globalAlpha = (anim.opacity - 0.5) * 0.3
        this.ctx!.fillStyle = clickColor
        this.ctx!.beginPath()
        this.ctx!.arc(anim.x, anim.y, 5, 0, Math.PI * 2)
        this.ctx!.fill()
      }
      
      this.ctx!.restore()
    })
  }

  dispose() {
    this.canvas = null
    this.ctx = null
    this.events = []
    this.clickAnimations.clear()
  }
}
import type { MouseEvent } from '@/types/project'
import { easeInOutCubic, easeOutCubic, easeInQuad } from '@/lib/utils/easing'

// Extend MouseEvent for cursor-specific needs
interface CursorEvent extends Omit<MouseEvent, 'x' | 'y' | 'screenWidth' | 'screenHeight'> {
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  velocity?: { x: number; y: number }
  acceleration?: { x: number; y: number }
}

interface CursorOptions {
  size?: number
  color?: string
  clickColor?: string
  clickSize?: number
  smoothing?: boolean
  motionBlur?: boolean
  cursorStyle?: 'macos' | 'windows' | 'custom'
  autoHide?: boolean
  hideDelay?: number // ms before hiding cursor when idle
}

interface InterpolatedPosition {
  x: number
  y: number
  vx: number // velocity x
  vy: number // velocity y
  visible: boolean
}

export class CursorRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private cursorImage: HTMLImageElement
  private events: CursorEvent[] = []
  private currentIndex = 0
  private clickAnimations: Map<string, {
    x: number
    y: number
    radius: number
    opacity: number
    scale: number
    startTime: number
  }> = new Map()

  private currentPosition: InterpolatedPosition = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    visible: true
  }

  private targetPosition = { x: 0, y: 0 }
  private cursorTrail: Array<{ x: number; y: number; opacity: number; age: number }> = []
  private lastMovementTime = 0
  private lastClickTime = 0

  // Spring physics for ultra-smooth cursor movement (Screen Studio quality)
  private readonly SPRING_STIFFNESS = 0.12 // Smoother than before
  private readonly SPRING_DAMPING = 0.88 // Less bouncy
  private readonly TRAIL_LENGTH = 8 // Longer trail for fast movements
  private readonly TRAIL_FADE_SPEED = 0.12 // Slower fade
  private readonly VELOCITY_SMOOTHING = 0.25 // Blend factor for velocity

  constructor(private options: CursorOptions = {}) {
    this.options = {
      size: 1.8, // Bigger cursor like Screen Studio
      color: '#000000',
      clickColor: '#007AFF',
      smoothing: true,
      motionBlur: true,
      cursorStyle: 'macos',
      autoHide: true,
      hideDelay: 600, // Hide after 600ms of no movement
      ...options
    }

    // Create cursor image
    this.cursorImage = new Image()
    this.cursorImage.src = this.createCursorDataURL()
  }

  private createCursorDataURL(): string {
    const size = (this.options.size || 1.8) * 24 // Scale base size
    const color = this.options.color || '#000000'

    if (this.options.cursorStyle === 'macos') {
      // High-quality macOS-style cursor
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <!-- Sophisticated shadow filter -->
            <filter id="cursor-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feFlood flood-color="#000000" flood-opacity="0.3"/>
              <feComposite in2="offsetblur" operator="in"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            <!-- Gradient for depth -->
            <linearGradient id="cursor-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#f8f8f8;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#e0e0e0;stop-opacity:1" />
            </linearGradient>
            
            <!-- Dark gradient for arrow -->
            <linearGradient id="arrow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${color};stop-opacity:0.95" />
              <stop offset="100%" style="stop-color:${color};stop-opacity:0.85" />
            </linearGradient>
          </defs>
          
          <!-- White background for visibility -->
          <path d="M3,3 L3,16 L6,13.5 L9,19 L11.5,18 L8.5,12.5 L13.5,12.5 Z" 
                fill="url(#cursor-gradient)" 
                filter="url(#cursor-shadow)"
                stroke="${color}" 
                stroke-width="0.5"
                stroke-opacity="0.3"/>
          
          <!-- Inner arrow shape -->
          <path d="M4.5,5 L4.5,13 L6.5,11.5 L8.5,16 L9.5,15.5 L7.5,11 L11,11 Z" 
                fill="url(#arrow-gradient)"/>
        </svg>
      `
      return `data:image/svg+xml;base64,${btoa(svg)}`
    }

    // Fallback cursor
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
        this.ctx = this.canvas.getContext('2d', { alpha: true })

        // Set up context for smooth rendering
        if (this.ctx) {
          this.ctx.imageSmoothingEnabled = true
          this.ctx.imageSmoothingQuality = 'high'
        }
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

    // Clear canvas with slight fade for motion blur effect
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Get target position from events
    const targetEvent = this.getEventAtTime(currentTime)
    if (!targetEvent) return

    // Update target position
    this.targetPosition = {
      x: targetEvent.mouseX,
      y: targetEvent.mouseY
    }

    // Check for clicks
    if (targetEvent.eventType === 'click') {
      this.addClickAnimation(targetEvent.mouseX, targetEvent.mouseY, currentTime)
      this.lastClickTime = currentTime
    }

    // Check if mouse is moving
    const isMoving = Math.abs(this.targetPosition.x - this.currentPosition.x) > 1 ||
      Math.abs(this.targetPosition.y - this.currentPosition.y) > 1

    if (isMoving) {
      this.lastMovementTime = currentTime
    }

    // Auto-hide cursor when idle
    const idleTime = currentTime - this.lastMovementTime
    const fadeOutStart = this.options.hideDelay || 600
    const fadeOutDuration = 200

    let cursorOpacity = 1
    if (this.options.autoHide && idleTime > fadeOutStart) {
      const fadeProgress = Math.min((idleTime - fadeOutStart) / fadeOutDuration, 1)
      cursorOpacity = 1 - fadeProgress
      this.currentPosition.visible = cursorOpacity > 0
    } else {
      this.currentPosition.visible = true
    }

    // Apply spring physics for smooth interpolation with velocity data
    this.updateCursorPosition(targetEvent)

    // Update and render effects
    this.updateClickAnimations(currentTime)
    this.renderClickAnimations()

    // Update motion trail
    if (this.options.motionBlur && isMoving) {
      this.updateMotionTrail()
      this.renderMotionTrail()
    }

    // Render cursor if visible
    if (this.currentPosition.visible && cursorOpacity > 0) {
      this.renderCursor(cursorOpacity)
    }
  }

  private updateCursorPosition(targetEvent?: CursorEvent) {
    // Spring physics for ultra-smooth movement
    const dx = this.targetPosition.x - this.currentPosition.x
    const dy = this.targetPosition.y - this.currentPosition.y

    // If we have velocity data, use it for prediction
    if (targetEvent?.velocity) {
      // Blend recorded velocity with spring physics
      const predictedVx = targetEvent.velocity.x * 0.001 // Convert to pixels per frame
      const predictedVy = targetEvent.velocity.y * 0.001
      
      // Mix predicted velocity with spring physics
      this.currentPosition.vx = this.currentPosition.vx * (1 - this.VELOCITY_SMOOTHING) + 
                                (dx * this.SPRING_STIFFNESS + predictedVx) * this.VELOCITY_SMOOTHING
      this.currentPosition.vy = this.currentPosition.vy * (1 - this.VELOCITY_SMOOTHING) + 
                                (dy * this.SPRING_STIFFNESS + predictedVy) * this.VELOCITY_SMOOTHING
    } else {
      // Fallback to pure spring physics
      this.currentPosition.vx += dx * this.SPRING_STIFFNESS
      this.currentPosition.vy += dy * this.SPRING_STIFFNESS
    }

    // Apply damping
    this.currentPosition.vx *= this.SPRING_DAMPING
    this.currentPosition.vy *= this.SPRING_DAMPING

    // Update position with sub-pixel precision
    this.currentPosition.x += this.currentPosition.vx
    this.currentPosition.y += this.currentPosition.vy

    // Clamp very small movements to prevent jitter
    if (Math.abs(this.currentPosition.vx) < 0.01) this.currentPosition.vx = 0
    if (Math.abs(this.currentPosition.vy) < 0.01) this.currentPosition.vy = 0
  }

  private updateMotionTrail() {
    const speed = Math.sqrt(this.currentPosition.vx ** 2 + this.currentPosition.vy ** 2)

    // Only add to trail if moving fast enough
    if (speed > 2) {
      this.cursorTrail.push({
        x: this.currentPosition.x,
        y: this.currentPosition.y,
        opacity: Math.min(0.4, speed * 0.05),
        age: 0
      })

      // Limit trail length
      if (this.cursorTrail.length > this.TRAIL_LENGTH) {
        this.cursorTrail.shift()
      }
    }

    // Update trail aging
    this.cursorTrail = this.cursorTrail.filter(point => {
      point.age += 1
      point.opacity -= this.TRAIL_FADE_SPEED
      return point.opacity > 0
    })
  }

  private renderMotionTrail() {
    if (!this.ctx || !this.cursorImage.complete) return

    this.cursorTrail.forEach((point, index) => {
      const trailOpacity = point.opacity * (index / this.cursorTrail.length)

      this.ctx!.save()
      this.ctx!.globalAlpha = trailOpacity

      // Slightly smaller cursor for trail
      const scale = 0.8 + (index / this.cursorTrail.length) * 0.2
      this.ctx!.translate(point.x, point.y)
      this.ctx!.scale(scale, scale)
      this.ctx!.translate(-point.x, -point.y)

      this.ctx!.drawImage(this.cursorImage, point.x - 2, point.y - 2)
      this.ctx!.restore()
    })
  }

  private renderCursor(opacity: number) {
    if (!this.ctx || !this.cursorImage.complete) return

    this.ctx.save()
    this.ctx.globalAlpha = opacity

    // Check for recent click to add subtle pulse
    const timeSinceClick = Date.now() - this.lastClickTime
    let scale = 1

    if (timeSinceClick < 200) {
      // Subtle pulse on click
      const pulseProgress = timeSinceClick / 200
      scale = 1 + Math.sin(pulseProgress * Math.PI) * 0.1

      this.ctx.translate(this.currentPosition.x, this.currentPosition.y)
      this.ctx.scale(scale, scale)
      this.ctx.translate(-this.currentPosition.x, -this.currentPosition.y)
    }

    // Draw cursor with sub-pixel precision
    this.ctx.drawImage(
      this.cursorImage,
      Math.round(this.currentPosition.x - 2),
      Math.round(this.currentPosition.y - 2)
    )

    this.ctx.restore()
  }

  private getEventAtTime(currentTime: number): CursorEvent | null {
    // Find events around current time
    let before: CursorEvent | null = null
    let after: CursorEvent | null = null

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]

      if (event.timestamp <= currentTime) {
        before = event
      } else if (!after) {
        after = event
        break
      }
    }

    if (!before) return null
    if (!after || !this.options.smoothing) return before

    // Interpolate between events for smooth movement
    const progress = (currentTime - before.timestamp) / (after.timestamp - before.timestamp)
    const easedProgress = easeInOutCubic(Math.min(1, Math.max(0, progress)))

    return {
      ...before,
      mouseX: before.mouseX + (after.mouseX - before.mouseX) * easedProgress,
      mouseY: before.mouseY + (after.mouseY - before.mouseY) * easedProgress
    }
  }


  private addClickAnimation(x: number, y: number, timestamp: number) {
    const id = `click-${timestamp}-${Math.random()}`
    this.clickAnimations.set(id, {
      x,
      y,
      radius: 0,
      opacity: 1,
      scale: 1.3,
      startTime: timestamp
    })
  }

  private updateClickAnimations(currentTime: number) {
    this.clickAnimations.forEach((anim, id) => {
      const age = currentTime - anim.startTime
      const maxAge = 500 // Animation duration in ms

      if (age > maxAge) {
        this.clickAnimations.delete(id)
        return
      }

      const progress = age / maxAge

      // Smooth expansion with easing
      anim.radius = easeOutCubic(progress) * 30

      // Fade out with acceleration at the end
      anim.opacity = 1 - easeInQuad(progress)

      // Scale down as it expands
      anim.scale = 1.3 - progress * 0.3
    })
  }

  private renderClickAnimations() {
    if (!this.ctx) return

    const clickColor = this.options.clickColor || '#007AFF'

    this.clickAnimations.forEach(anim => {
      this.ctx!.save()

      // Render multiple rings for sophisticated effect
      for (let i = 0; i < 2; i++) {
        const ringDelay = i * 50 // Stagger the rings
        const ringProgress = Math.max(0, (anim.radius - ringDelay) / 30)

        if (ringProgress > 0) {
          const ringOpacity = anim.opacity * (1 - i * 0.4) * (1 - ringProgress * 0.5)
          const ringRadius = anim.radius - ringDelay

          // Outer ring
          this.ctx!.globalAlpha = ringOpacity
          this.ctx!.strokeStyle = clickColor
          this.ctx!.lineWidth = 2.5 - i * 0.5
          this.ctx!.beginPath()
          this.ctx!.arc(anim.x, anim.y, ringRadius, 0, Math.PI * 2)
          this.ctx!.stroke()

          // Inner glow
          if (i === 0 && anim.opacity > 0.5) {
            const glowGradient = this.ctx!.createRadialGradient(
              anim.x, anim.y, 0,
              anim.x, anim.y, ringRadius * 0.5
            )
            glowGradient.addColorStop(0, `${clickColor}33`)
            glowGradient.addColorStop(1, `${clickColor}00`)

            this.ctx!.globalAlpha = (anim.opacity - 0.5) * 0.6
            this.ctx!.fillStyle = glowGradient
            this.ctx!.beginPath()
            this.ctx!.arc(anim.x, anim.y, ringRadius * 0.5, 0, Math.PI * 2)
            this.ctx!.fill()
          }
        }
      }

      this.ctx!.restore()
    })
  }


  dispose() {
    this.canvas = null
    this.ctx = null
    this.events = []
    this.clickAnimations.clear()
    this.cursorTrail = []
  }
}
import type { MouseEvent } from '@/types/project'
import { easeInOutCubic } from '@/lib/utils/easing'

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
}

export class CursorRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private cursorImage: HTMLImageElement
  private events: CursorEvent[] = []
  private clickAnimations: Map<string, {
    x: number
    y: number
    radius: number
    opacity: number
    startTime: number
  }> = new Map()

  private currentPosition = { x: 0, y: 0 }
  private targetPosition = { x: 0, y: 0 }
  
  // Simple easing factor for smooth movement
  private readonly SMOOTHING_FACTOR = 0.15

  constructor(private options: CursorOptions = {}) {
    this.options = {
      size: 1.5,
      color: '#000000',
      clickColor: '#007AFF',
      smoothing: true,
      cursorStyle: 'macos',
      ...options
    }

    // Create cursor image
    this.cursorImage = new Image()
    this.cursorImage.src = this.createCursorDataURL()
  }

  private createCursorDataURL(): string {
    const size = (this.options.size || 1.5) * 20
    const color = this.options.color || '#000000'

    // Simple macOS-style cursor
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
            <feOffset dx="0" dy="1" result="offsetblur"/>
            <feFlood flood-color="#000000" flood-opacity="0.2"/>
            <feComposite in2="offsetblur" operator="in"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <path d="M3,3 L3,16 L6,13.5 L9,19 L11.5,18 L8.5,12.5 L13.5,12.5 Z" 
              fill="white" 
              filter="url(#shadow)"
              stroke="${color}" 
              stroke-width="0.5"/>
        
        <path d="M4.5,5 L4.5,13 L6.5,11.5 L8.5,16 L9.5,15.5 L7.5,11 L11,11 Z" 
              fill="${color}"/>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  attachToVideo(video: HTMLVideoElement, events: CursorEvent[]): HTMLCanvasElement {
    this.events = events

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

        if (this.ctx) {
          this.ctx.imageSmoothingEnabled = true
          this.ctx.imageSmoothingQuality = 'high'
        }
      }
    }

    video.addEventListener('loadedmetadata', updateCanvasSize)
    video.addEventListener('timeupdate', () => this.render(video.currentTime * 1000))

    updateCanvasSize()
    return this.canvas
  }

  private render(currentTime: number) {
    if (!this.ctx || !this.canvas) return

    // Clear canvas
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
    }

    // Simple smooth interpolation
    if (this.options.smoothing) {
      this.currentPosition.x += (this.targetPosition.x - this.currentPosition.x) * this.SMOOTHING_FACTOR
      this.currentPosition.y += (this.targetPosition.y - this.currentPosition.y) * this.SMOOTHING_FACTOR
    } else {
      this.currentPosition = { ...this.targetPosition }
    }

    // Update and render click animations
    this.updateClickAnimations(currentTime)
    this.renderClickAnimations()

    // Render cursor
    this.renderCursor()
  }

  private renderCursor() {
    if (!this.ctx || !this.cursorImage.complete) return

    this.ctx.save()
    this.ctx.drawImage(
      this.cursorImage,
      Math.round(this.currentPosition.x - 2),
      Math.round(this.currentPosition.y - 2)
    )
    this.ctx.restore()
  }

  private getEventAtTime(currentTime: number): CursorEvent | null {
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

    // Interpolate between events
    const progress = (currentTime - before.timestamp) / (after.timestamp - before.timestamp)
    const easedProgress = easeInOutCubic(Math.min(1, Math.max(0, progress)))

    return {
      ...before,
      mouseX: before.mouseX + (after.mouseX - before.mouseX) * easedProgress,
      mouseY: before.mouseY + (after.mouseY - before.mouseY) * easedProgress
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

      const progress = age / maxAge
      anim.radius = progress * 25
      anim.opacity = 1 - progress
    })
  }

  private renderClickAnimations() {
    if (!this.ctx) return

    const clickColor = this.options.clickColor || '#007AFF'

    this.clickAnimations.forEach(anim => {
      this.ctx!.save()
      this.ctx!.globalAlpha = anim.opacity * 0.5
      this.ctx!.strokeStyle = clickColor
      this.ctx!.lineWidth = 2
      this.ctx!.beginPath()
      this.ctx!.arc(anim.x, anim.y, anim.radius, 0, Math.PI * 2)
      this.ctx!.stroke()
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
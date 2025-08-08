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
}

export class CursorRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private cursorImage: HTMLImageElement
  private events: CursorEvent[] = []
  private currentIndex = 0
  private clickAnimations: Map<string, { x: number; y: number; radius: number; opacity: number }> = new Map()

  constructor(private options: CursorOptions = {}) {
    // Create cursor image
    this.cursorImage = new Image()
    this.cursorImage.src = this.createCursorDataURL()
  }

  private createCursorDataURL(): string {
    // Create a simple cursor SVG
    const size = (this.options.size || 1) * 20
    const color = this.options.color || '#ffffff'

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow">
            <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.3"/>
          </filter>
        </defs>
        <path d="M0,0 L0,16 L4,12 L7,18 L10,17 L7,11 L12,11 Z" 
              fill="${color}" 
              stroke="#000000" 
              stroke-width="0.5"
              filter="url(#shadow)"/>
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

    // Render click animations
    this.updateClickAnimations()
    this.renderClickAnimations()

    // Check for new clicks
    if (event.eventType === 'click') {
      this.addClickAnimation(event.mouseX, event.mouseY)
    }

    // Render cursor
    const x = event.mouseX
    const y = event.mouseY

    if (this.cursorImage.complete) {
      this.ctx.drawImage(this.cursorImage, x, y)
    }
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
      opacity: 1
    })
  }

  private updateClickAnimations() {
    this.clickAnimations.forEach((anim, id) => {
      anim.radius += 2
      anim.opacity -= 0.05

      if (anim.opacity <= 0) {
        this.clickAnimations.delete(id)
      }
    })
  }

  private renderClickAnimations() {
    if (!this.ctx) return

    const clickColor = this.options.clickColor || '#3b82f6'

    this.clickAnimations.forEach(anim => {
      this.ctx!.save()
      this.ctx!.globalAlpha = anim.opacity
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
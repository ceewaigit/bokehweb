import type { KeyboardEvent } from '@/types/project'

interface KeystrokeOptions {
  fontSize?: number
  fontFamily?: string
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderRadius?: number
  padding?: number
  fadeOutDuration?: number // ms
  position?: 'bottom-center' | 'bottom-right' | 'top-center'
  maxWidth?: number
}

interface ActiveKeystroke {
  id: string
  key: string
  modifiers: string[]
  startTime: number
  fadeStartTime: number
  opacity: number
  x: number
  y: number
}

export class KeystrokeRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private activeKeystrokes: Map<string, ActiveKeystroke> = new Map()
  private keyHistory: KeyboardEvent[] = []
  private currentIndex = 0

  // Default styling matching Screen Studio
  private readonly DISPLAY_DURATION = 1500 // ms - how long to show each keystroke
  private readonly FADE_DURATION = 300 // ms - fade out animation
  private readonly MAX_CONCURRENT = 3 // max number of keystrokes shown at once

  constructor(private options: KeystrokeOptions = {}) {
    this.options = {
      fontSize: 16,
      fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      textColor: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 6,
      padding: 12,
      fadeOutDuration: this.FADE_DURATION,
      position: 'bottom-center',
      maxWidth: 300,
      ...options
    }
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (this.ctx) {
      this.ctx.font = `${this.options.fontSize}px ${this.options.fontFamily}`
    }
  }

  setKeyboardEvents(events: KeyboardEvent[]) {
    this.keyHistory = events
    this.currentIndex = 0
    this.activeKeystrokes.clear()
  }

  render(timestamp: number, videoWidth: number, videoHeight: number) {
    if (!this.canvas || !this.ctx || this.keyHistory.length === 0) return

    // Add new keystrokes that should be visible at this timestamp
    while (this.currentIndex < this.keyHistory.length) {
      const event = this.keyHistory[this.currentIndex]
      if (event.timestamp > timestamp) break

      // Create display-friendly key string
      const keyDisplay = this.formatKeystroke(event.key, event.modifiers)
      const keystrokeId = `${event.timestamp}-${event.key}`

      // Calculate position based on settings
      const position = this.calculatePosition(
        this.activeKeystrokes.size,
        videoWidth,
        videoHeight
      )

      this.activeKeystrokes.set(keystrokeId, {
        id: keystrokeId,
        key: keyDisplay,
        modifiers: event.modifiers,
        startTime: event.timestamp,
        fadeStartTime: event.timestamp + this.DISPLAY_DURATION,
        opacity: 1,
        x: position.x,
        y: position.y
      })

      this.currentIndex++

      // Remove oldest if we have too many
      if (this.activeKeystrokes.size > this.MAX_CONCURRENT) {
        const oldest = Array.from(this.activeKeystrokes.keys())[0]
        this.activeKeystrokes.delete(oldest)
      }
    }

    // Update and render active keystrokes
    const toRemove: string[] = []

    this.activeKeystrokes.forEach((keystroke, id) => {
      // Calculate opacity based on fade
      if (timestamp >= keystroke.fadeStartTime) {
        const fadeProgress = (timestamp - keystroke.fadeStartTime) / this.FADE_DURATION
        keystroke.opacity = Math.max(0, 1 - fadeProgress)

        if (keystroke.opacity <= 0) {
          toRemove.push(id)
          return
        }
      }

      // Render the keystroke
      this.drawKeystroke(keystroke, videoWidth, videoHeight)
    })

    // Clean up faded keystrokes
    toRemove.forEach(id => this.activeKeystrokes.delete(id))
  }

  private formatKeystroke(key: string, modifiers: string[]): string {
    const parts: string[] = []

    // Add modifiers with Mac-style symbols
    if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push('⌘')
    if (modifiers.includes('ctrl')) parts.push('⌃')
    if (modifiers.includes('alt') || modifiers.includes('option')) parts.push('⌥')
    if (modifiers.includes('shift')) parts.push('⇧')

    // Format the key
    const formattedKey = this.formatKey(key)
    if (formattedKey) parts.push(formattedKey)

    return parts.join(' ')
  }

  private formatKey(key: string): string {
    // Special key mappings for better display
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Enter': '↵',
      'Return': '↵',
      'Tab': '⇥',
      'Backspace': '⌫',
      'Delete': '⌦',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Home': '↖',
      'End': '↘',
      'PageUp': '⇞',
      'PageDown': '⇟',
    }

    return keyMap[key] || key.toUpperCase()
  }

  private calculatePosition(
    index: number,
    videoWidth: number,
    videoHeight: number
  ): { x: number; y: number } {
    const margin = 20
    const spacing = 10
    const estimatedWidth = 100 // Rough estimate, will calculate actual

    switch (this.options.position) {
      case 'bottom-right':
        return {
          x: videoWidth - margin - estimatedWidth,
          y: videoHeight - margin - (index * (this.options.fontSize! + this.options.padding! * 2 + spacing))
        }
      case 'top-center':
        return {
          x: videoWidth / 2,
          y: margin + (index * (this.options.fontSize! + this.options.padding! * 2 + spacing))
        }
      case 'bottom-center':
      default:
        return {
          x: videoWidth / 2,
          y: videoHeight - margin - (index * (this.options.fontSize! + this.options.padding! * 2 + spacing))
        }
    }
  }

  private drawKeystroke(keystroke: ActiveKeystroke, videoWidth: number, videoHeight: number) {
    if (!this.ctx) return

    const ctx = this.ctx
    ctx.save()

    // Set opacity
    ctx.globalAlpha = keystroke.opacity

    // Set font
    ctx.font = `${this.options.fontSize}px ${this.options.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Measure text
    const metrics = ctx.measureText(keystroke.key)
    const textWidth = metrics.width
    const boxWidth = Math.min(textWidth + this.options.padding! * 2, this.options.maxWidth!)
    const boxHeight = this.options.fontSize! + this.options.padding! * 2

    // Adjust position to center the box
    const boxX = keystroke.x - boxWidth / 2
    const boxY = keystroke.y - boxHeight / 2

    // Draw background with rounded corners
    this.drawRoundedRect(
      ctx,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      this.options.borderRadius!
    )

    // Fill background
    ctx.fillStyle = this.options.backgroundColor!
    ctx.fill()

    // Draw border
    ctx.strokeStyle = this.options.borderColor!
    ctx.lineWidth = 1
    ctx.stroke()

    // Draw text
    ctx.fillStyle = this.options.textColor!
    ctx.fillText(
      keystroke.key,
      keystroke.x,
      keystroke.y
    )

    ctx.restore()
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  reset() {
    this.currentIndex = 0
    this.activeKeystrokes.clear()
  }

  // Check if there are keystrokes to render at given time
  hasKeystrokesAtTime(timestamp: number): boolean {
    return this.keyHistory.some(event =>
      event.timestamp <= timestamp &&
      event.timestamp + this.DISPLAY_DURATION + this.FADE_DURATION > timestamp
    )
  }
}
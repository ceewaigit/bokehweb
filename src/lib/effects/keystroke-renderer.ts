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
  groupingDelay?: number // ms - delay before showing grouped text
  groupDisplayDuration?: number // ms - how long to show grouped text
}

interface ActiveKeystroke {
  id: string
  text: string  // Changed from key to text to support grouped strings
  startTime: number
  fadeStartTime: number
  opacity: number
  x: number
  y: number
  fadeIn?: boolean  // For smooth fade-in animation
}

export class KeystrokeRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private activeKeystrokes: Map<string, ActiveKeystroke> = new Map()
  private keyHistory: KeyboardEvent[] = []
  private currentIndex = 0
  
  // Text grouping state
  private textBuffer: string = ''
  private bufferStartTime: number = 0
  private lastKeyTime: number = 0

  // Timing constants
  private readonly DISPLAY_DURATION = 2000 // ms - how long to show grouped text
  private readonly FADE_DURATION = 300 // ms - fade out animation
  private readonly MAX_CONCURRENT = 3 // max number of text groups shown at once
  private readonly GROUPING_DELAY = 500 // ms - delay before showing grouped text
  private readonly FADE_IN_DURATION = 200 // ms - fade in animation

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
      groupingDelay: this.GROUPING_DELAY,
      groupDisplayDuration: this.DISPLAY_DURATION,
      ...options
    }
  }

  updateSettings(newOptions: KeystrokeOptions) {
    this.options = {
      ...this.options,
      ...newOptions
    }
    // Update canvas font if canvas is set
    if (this.ctx) {
      this.ctx.font = `${this.options.fontSize}px ${this.options.fontFamily}`
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

    // Process new keystrokes and group them
    while (this.currentIndex < this.keyHistory.length) {
      const event = this.keyHistory[this.currentIndex]
      if (event.timestamp > timestamp) break

      // Add to buffer
      this.processKeystroke(event, timestamp)
      this.currentIndex++
    }

    // Check if it's time to display the buffered text
    if (this.textBuffer.length > 0 && this.shouldDisplayBuffer(timestamp)) {
      this.createTextGroup(timestamp, videoWidth, videoHeight)
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

      // Apply fade-in effect if needed
      if (keystroke.fadeIn) {
        const fadeInProgress = Math.min(1, (timestamp - keystroke.startTime) / this.FADE_IN_DURATION)
        keystroke.opacity = Math.min(keystroke.opacity, fadeInProgress)
        if (fadeInProgress >= 1) {
          keystroke.fadeIn = false
        }
      }

      // Render the keystroke
      this.drawKeystroke(keystroke, videoWidth, videoHeight)
    })

    // Clean up faded keystrokes
    toRemove.forEach(id => this.activeKeystrokes.delete(id))
  }

  private processKeystroke(event: KeyboardEvent, _currentTimestamp: number) {
    // Check if this is a trigger to display (Enter, click, or long pause)
    const timeSinceLastKey = event.timestamp - this.lastKeyTime
    const isEnter = event.key === 'Enter' || event.key === 'Return'
    const isPause = this.lastKeyTime > 0 && timeSinceLastKey > this.options.groupingDelay!
    
    // If we should display the buffer, reset it for next group
    if (this.textBuffer.length > 0 && (isEnter || isPause)) {
      // Buffer will be displayed by shouldDisplayBuffer check in render
      // Don't reset here, let createTextGroup handle it
    }
    
    // Start new buffer if needed
    if (this.textBuffer.length === 0) {
      this.bufferStartTime = event.timestamp
    }
    
    // Add to buffer (skip Enter key display)
    if (!isEnter) {
      const keyDisplay = this.formatSingleKey(event.key, event.modifiers)
      if (keyDisplay) {
        // Add space between keys, but not at the beginning
        if (this.textBuffer.length > 0 && !this.isSpecialKey(event.key)) {
          this.textBuffer += ' '
        }
        this.textBuffer += keyDisplay
      }
    }
    
    this.lastKeyTime = event.timestamp
  }
  
  private shouldDisplayBuffer(timestamp: number): boolean {
    // Check if enough time has passed since the last key
    return this.lastKeyTime > 0 && 
           this.textBuffer.length > 0 &&
           (timestamp - this.lastKeyTime) > this.options.groupingDelay!
  }
  
  private createTextGroup(timestamp: number, videoWidth: number, videoHeight: number) {
    if (!this.textBuffer.length) return
    
    const groupId = `group-${this.bufferStartTime}`
    const position = this.calculatePosition(
      this.activeKeystrokes.size,
      videoWidth,
      videoHeight
    )
    
    this.activeKeystrokes.set(groupId, {
      id: groupId,
      text: this.textBuffer,
      startTime: this.bufferStartTime,
      fadeStartTime: timestamp + this.options.groupDisplayDuration!,
      opacity: 1,
      x: position.x,
      y: position.y,
      fadeIn: true
    })
    
    // Remove oldest if we have too many
    if (this.activeKeystrokes.size > this.MAX_CONCURRENT) {
      const oldest = Array.from(this.activeKeystrokes.keys())[0]
      this.activeKeystrokes.delete(oldest)
    }
    
    // Reset buffer
    this.textBuffer = ''
    this.bufferStartTime = 0
  }
  
  private isSpecialKey(key: string): boolean {
    const specialKeys = ['Enter', 'Return', 'Tab', 'Backspace', 'Delete', 'Escape', 
                         'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                         'Home', 'End', 'PageUp', 'PageDown']
    return specialKeys.includes(key)
  }
  
  private formatSingleKey(key: string, modifiers: string[]): string {
    // Handle modifier combos (e.g., Cmd+C)
    if (modifiers.length > 0 && key.length === 1) {
      const parts: string[] = []
      // Add modifiers with Mac-style symbols
      if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push('⌘')
      if (modifiers.includes('ctrl')) parts.push('⌃')
      if (modifiers.includes('alt') || modifiers.includes('option')) parts.push('⌥')
      if (modifiers.includes('shift')) parts.push('⇧')
      parts.push(key.toUpperCase())
      return parts.join('')
    }
    
    // For regular typing, just show the character
    if (key.length === 1) {
      return key
    }
    
    // For special keys, show them with formatting
    return this.formatKey(key)
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

  private drawKeystroke(keystroke: ActiveKeystroke, _videoWidth: number, _videoHeight: number) {
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
    const metrics = ctx.measureText(keystroke.text)
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
      keystroke.text,
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
    this.textBuffer = ''
    this.bufferStartTime = 0
    this.lastKeyTime = 0
  }

  // Check if there are keystrokes to render at given time
  hasKeystrokesAtTime(timestamp: number): boolean {
    return this.keyHistory.some(event =>
      event.timestamp <= timestamp &&
      event.timestamp + this.DISPLAY_DURATION + this.FADE_DURATION > timestamp
    )
  }
}
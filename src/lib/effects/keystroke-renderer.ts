import type { KeyboardEvent } from '@/types/project'
import { KeystrokePosition } from '@/types/project'

interface KeystrokeOptions {
  fontSize?: number
  fontFamily?: string
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderRadius?: number
  padding?: number
  fadeOutDuration?: number
  position?: KeystrokePosition
  maxWidth?: number
}

interface ActiveKeystroke {
  id: string
  text: string
  startTime: number
  fadeStartTime: number
  opacity: number
  x: number
  y: number
  fadeIn?: boolean
}

interface KeystrokeBuffer {
  text: string
  startTime: number
  lastKeyTime: number
  keys: KeyboardEvent[]
}

export class KeystrokeRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private activeKeystrokes: Map<string, ActiveKeystroke> = new Map()
  private keyHistory: KeyboardEvent[] = []
  private currentIndex = 0
  private buffer: KeystrokeBuffer | null = null
  private displayQueue: KeystrokeBuffer[] = []

  // Timing constants
  private readonly DISPLAY_DURATION = 2500 // ms - how long to show text
  private readonly FADE_DURATION = 300 // ms - fade out animation
  private readonly BUFFER_TIMEOUT = 800 // ms - time before flushing buffer
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
      position: KeystrokePosition.BottomCenter,
      maxWidth: 300,
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
    this.buffer = null
    this.displayQueue = []
  }

  private flushBuffer() {
    if (!this.buffer || this.buffer.text.trim().length === 0) {
      this.buffer = null
      return
    }

    this.displayQueue.push({
      text: this.buffer.text.trim(),
      startTime: this.buffer.startTime,
      lastKeyTime: this.buffer.lastKeyTime,
      keys: [...this.buffer.keys]
    })

    this.buffer = null
  }

  render(timestamp: number, videoWidth: number, videoHeight: number) {
    if (!this.canvas || !this.ctx || this.keyHistory.length === 0) return

    // Process new keystrokes into buffer
    while (this.currentIndex < this.keyHistory.length) {
      const event = this.keyHistory[this.currentIndex]
      if (event.timestamp > timestamp) break

      // Filter out standalone modifier keys
      const modifierKeys = ['CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'Command', 'Option', 'Fn']
      if (!modifierKeys.includes(event.key)) {
        // Check if we should flush buffer (Enter key, long pause, or special keys)
        const shouldFlush =
          event.key === 'Enter' ||
          event.key === 'Tab' ||
          event.key === 'Escape' ||
          (this.buffer && event.timestamp - this.buffer.lastKeyTime > this.BUFFER_TIMEOUT) ||
          (event.modifiers && event.modifiers.length > 0) // Shortcut keys flush buffer

        if (shouldFlush && this.buffer) {
          this.flushBuffer()
        }

        // Handle different key types
        if (event.modifiers && event.modifiers.length > 0) {
          // Shortcut keys show immediately
          const keyDisplay = this.formatSingleKey(event.key, event.modifiers)
          this.displayQueue.push({
            text: keyDisplay,
            startTime: event.timestamp,
            lastKeyTime: event.timestamp,
            keys: [event]
          })
        } else if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
          // Special keys show with their symbol
          const keyDisplay = this.formatKey(event.key)
          this.displayQueue.push({
            text: keyDisplay,
            startTime: event.timestamp,
            lastKeyTime: event.timestamp,
            keys: [event]
          })
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
          // Handle backspace/delete in buffer
          if (this.buffer && this.buffer.text.length > 0) {
            // Remove last character from buffer
            this.buffer.text = this.buffer.text.slice(0, -1)
            this.buffer.lastKeyTime = event.timestamp
            this.buffer.keys.push(event)

            // If buffer is now empty, clear it
            if (this.buffer.text.length === 0) {
              this.buffer = null
            }
          }
        } else {
          // Regular typing - add to buffer
          if (!this.buffer) {
            this.buffer = {
              text: '',
              startTime: event.timestamp,
              lastKeyTime: event.timestamp,
              keys: []
            }
          }

          // Add character to buffer
          if (event.key === ' ') {
            this.buffer.text += ' '
          } else if (event.key.length === 1) {
            this.buffer.text += event.key
          }

          this.buffer.lastKeyTime = event.timestamp
          this.buffer.keys.push(event)
        }
      }

      this.currentIndex++
    }

    // Check if we should flush buffer due to timeout
    if (this.buffer && timestamp - this.buffer.lastKeyTime > this.BUFFER_TIMEOUT) {
      this.flushBuffer()
    }

    // Show current buffer text progressively if it exists
    if (this.buffer && this.buffer.text.length > 0) {
      // Calculate how many characters to show based on actual typing speed
      // Count how many keys were typed (excluding backspaces)
      const typedKeys = this.buffer.keys.filter(k => k.key !== 'Backspace' && k.key !== 'Delete')

      // Show characters based on actual key timing
      let charsToShow = 0
      for (const key of typedKeys) {
        if (key.timestamp <= timestamp) {
          charsToShow++
        } else {
          break
        }
      }

      // Ensure we don't exceed buffer text length
      charsToShow = Math.min(charsToShow, this.buffer.text.length)

      if (charsToShow > 0) {
        const displayText = this.buffer.text.substring(0, charsToShow)
        const bufferId = 'current-buffer'

        // Update or create the current buffer display
        if (!this.activeKeystrokes.has(bufferId)) {
          const position = this.calculatePosition(0, videoWidth, videoHeight)
          this.activeKeystrokes.set(bufferId, {
            id: bufferId,
            text: displayText,
            startTime: timestamp,
            fadeStartTime: timestamp + 10000, // Don't fade while typing
            opacity: 1,
            x: position.x,
            y: position.y,
            fadeIn: true
          })
        } else {
          // Update existing text
          const existing = this.activeKeystrokes.get(bufferId)!
          existing.text = displayText
          existing.fadeStartTime = timestamp + 10000 // Keep resetting fade
        }
      }
    }

    // Process display queue for completed text blocks
    while (this.displayQueue.length > 0) {
      const buffered = this.displayQueue.shift()!

      // Wait for the right time to show this text
      if (buffered.startTime > timestamp) {
        // Put it back, not time yet
        this.displayQueue.unshift(buffered)
        break
      }

      // Remove current buffer display if exists
      if (this.activeKeystrokes.has('current-buffer')) {
        this.activeKeystrokes.delete('current-buffer')
      }

      // Show the completed text for its display duration
      const position = this.calculatePosition(0, videoWidth, videoHeight)
      const keystrokeId = `buffer-${buffered.startTime}`

      this.activeKeystrokes.set(keystrokeId, {
        id: keystrokeId,
        text: buffered.text,
        startTime: timestamp,
        fadeStartTime: timestamp + this.DISPLAY_DURATION,
        opacity: 1,
        x: position.x,
        y: position.y,
        fadeIn: true
      })

      // Since MAX_CONCURRENT is 1, we should already have removed the buffer above
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


  private formatSingleKey(key: string, modifiers: string[]): string {
    // Normalize key for display - convert KeyA→A, Digit1→1
    let displayKey = key
    if (key.startsWith('Key') && key.length === 4) {
      displayKey = key.charAt(3).toUpperCase()
    } else if (key.startsWith('Digit') && key.length === 6) {
      displayKey = key.charAt(5)
    }

    // Handle modifier combos (e.g., Cmd+C)
    if (modifiers.length > 0 && displayKey.length === 1) {
      const parts: string[] = []
      // Add modifiers with Mac-style symbols
      if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push('⌘')
      if (modifiers.includes('ctrl')) parts.push('⌃')
      if (modifiers.includes('alt') || modifiers.includes('option')) parts.push('⌥')
      if (modifiers.includes('shift')) parts.push('⇧')
      parts.push(displayKey.toUpperCase())
      return parts.join('')
    }

    // For regular typing, just show the character
    if (displayKey.length === 1) {
      return displayKey
    }

    // For special keys, show them with formatting
    return this.formatKey(key)
  }

  private formatKey(key: string): string {
    // Special key mappings for better display
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'Space': 'Space',
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

    // Direct mapping first
    if (keyMap[key]) {
      return keyMap[key]
    }

    // Handle KeyA-KeyZ format → A-Z
    if (key.startsWith('Key') && key.length === 4) {
      return key.charAt(3).toUpperCase()
    }

    // Handle Digit0-Digit9 format → 0-9
    if (key.startsWith('Digit') && key.length === 6) {
      return key.charAt(5)
    }

    // Handle Numpad keys → show with prefix
    if (key.startsWith('Numpad')) {
      const numpadKey = key.slice(6)
      if (numpadKey.length === 1) {
        return numpadKey // Just the digit
      }
      // Numpad operators
      const numpadMap: Record<string, string> = {
        'Multiply': '×',
        'Add': '+',
        'Subtract': '-',
        'Decimal': '.',
        'Divide': '÷',
        'Enter': '↵',
      }
      return numpadMap[numpadKey] || numpadKey
    }

    // Handle modifier keys - strip Left/Right suffix
    if (key.endsWith('Left') || key.endsWith('Right')) {
      const base = key.replace(/(Left|Right)$/, '')
      const modifierMap: Record<string, string> = {
        'Shift': '⇧',
        'Control': '⌃',
        'Alt': '⌥',
        'Meta': '⌘',
      }
      return modifierMap[base] || base
    }

    // F-keys are already fine (F1, F2, etc.)
    if (key.match(/^F\d{1,2}$/)) {
      return key
    }

    return key.toUpperCase()
  }

  private calculatePosition(
    _index: number, // Keep for compatibility but unused since we only show one at a time
    videoWidth: number,
    videoHeight: number
  ): { x: number; y: number } {
    const margin = 40

    switch (this.options.position) {
      case KeystrokePosition.BottomRight:
        return {
          x: videoWidth - margin - 150, // Estimate for right alignment
          y: videoHeight - margin
        }
      case KeystrokePosition.TopCenter:
        return {
          x: videoWidth / 2,
          y: margin
        }
      case KeystrokePosition.BottomCenter:
      default:
        return {
          x: videoWidth / 2,
          y: videoHeight - margin
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
    this.buffer = null
    this.displayQueue = []
  }

  hasKeystrokesAtTime(timestamp: number): boolean {
    return this.keyHistory.some(event =>
      event.timestamp <= timestamp &&
      event.timestamp + this.DISPLAY_DURATION + this.FADE_DURATION > timestamp
    )
  }
}
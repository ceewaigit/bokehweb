export interface BackgroundOptions {
  type: 'solid' | 'gradient' | 'image' | 'wallpaper' | 'blur'
  color?: string
  gradient?: {
    type: 'linear' | 'radial'
    colors: string[]
    angle?: number
  }
  image?: string | HTMLImageElement
  blur?: number
  padding?: number
  borderRadius?: number
  shadow?: {
    enabled: boolean
    color: string
    blur: number
    offsetX: number
    offsetY: number
    spread?: number
  }
  // Screen Studio-like presets
  preset?: 'screenStudio' | 'minimal' | 'colorful' | 'dark' | 'light'
}

export class BackgroundRenderer {
  private backgroundImage: HTMLImageElement | null = null
  private gradientCanvas: HTMLCanvasElement | null = null
  private gradientCtx: CanvasRenderingContext2D | null = null

  // Screen Studio-like presets
  private static readonly PRESETS = {
    screenStudio: {
      type: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        colors: ['#0F172A', '#1E293B'], // Dark blue-gray gradient
        angle: 135
      },
      padding: 120,
      borderRadius: 16,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.5)',
        blur: 50,
        offsetX: 0,
        offsetY: 25,
        spread: -10
      }
    },
    minimal: {
      type: 'solid' as const,
      color: '#FAFAFA',
      padding: 40,
      borderRadius: 12,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.15)',
        blur: 30,
        offsetX: 0,
        offsetY: 10
      }
    },
    colorful: {
      type: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        colors: ['#667eea', '#764ba2', '#f093fb'],
        angle: 45
      },
      padding: 50,
      borderRadius: 20,
      shadow: {
        enabled: true,
        color: 'rgba(102, 126, 234, 0.4)',
        blur: 60,
        offsetX: 0,
        offsetY: 30
      }
    },
    dark: {
      type: 'gradient' as const,
      gradient: {
        type: 'radial' as const,
        colors: ['#1a1a1a', '#000000'],
        angle: 0
      },
      padding: 45,
      borderRadius: 14,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.8)',
        blur: 40,
        offsetX: 0,
        offsetY: 20
      }
    },
    light: {
      type: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        colors: ['#ffffff', '#f0f0f0'],
        angle: 180
      },
      padding: 50,
      borderRadius: 16,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.1)',
        blur: 25,
        offsetX: 0,
        offsetY: 15
      }
    }
  }

  constructor(private options: BackgroundOptions = { type: 'solid', color: '#000000' }) {
    // Apply preset if specified
    if (options.preset && BackgroundRenderer.PRESETS[options.preset]) {
      this.options = { ...BackgroundRenderer.PRESETS[options.preset], ...options }
    }
    this.initializeBackground()
  }

  private async initializeBackground() {
    if (this.options.type === 'image' || this.options.type === 'wallpaper') {
      if (typeof this.options.image === 'string') {
        this.backgroundImage = new Image()
        this.backgroundImage.src = this.options.image
        await new Promise((resolve) => {
          this.backgroundImage!.onload = resolve
        })
      } else if (this.options.image instanceof HTMLImageElement) {
        this.backgroundImage = this.options.image
      }
    }

    if (this.options.type === 'gradient') {
      this.createGradientCanvas()
    }
  }

  private createGradientCanvas() {
    this.gradientCanvas = document.createElement('canvas')
    this.gradientCanvas.width = 1920
    this.gradientCanvas.height = 1080
    this.gradientCtx = this.gradientCanvas.getContext('2d')!

    if (!this.options.gradient) {
      this.options.gradient = {
        type: 'linear',
        colors: ['#667eea', '#764ba2'],
        angle: 45
      }
    }

    const { type, colors, angle = 0 } = this.options.gradient

    if (type === 'linear') {
      const angleRad = (angle * Math.PI) / 180
      const x1 = this.gradientCanvas.width / 2 - Math.cos(angleRad) * this.gradientCanvas.width
      const y1 = this.gradientCanvas.height / 2 - Math.sin(angleRad) * this.gradientCanvas.height
      const x2 = this.gradientCanvas.width / 2 + Math.cos(angleRad) * this.gradientCanvas.width
      const y2 = this.gradientCanvas.height / 2 + Math.sin(angleRad) * this.gradientCanvas.height

      const gradient = this.gradientCtx.createLinearGradient(x1, y1, x2, y2)
      colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color)
      })

      this.gradientCtx.fillStyle = gradient
      this.gradientCtx.fillRect(0, 0, this.gradientCanvas.width, this.gradientCanvas.height)
    } else if (type === 'radial') {
      const gradient = this.gradientCtx.createRadialGradient(
        this.gradientCanvas.width / 2,
        this.gradientCanvas.height / 2,
        0,
        this.gradientCanvas.width / 2,
        this.gradientCanvas.height / 2,
        Math.max(this.gradientCanvas.width, this.gradientCanvas.height) / 2
      )

      colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color)
      })

      this.gradientCtx.fillStyle = gradient
      this.gradientCtx.fillRect(0, 0, this.gradientCanvas.width, this.gradientCanvas.height)
    }
  }

  applyBackground(
    ctx: CanvasRenderingContext2D,
    videoFrame?: HTMLVideoElement | HTMLCanvasElement,
    videoX?: number,
    videoY?: number,
    videoWidth?: number,
    videoHeight?: number
  ) {
    const { width, height } = ctx.canvas
    const padding = this.options.padding || 0

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Apply background
    switch (this.options.type) {
      case 'solid':
        ctx.fillStyle = this.options.color || '#000000'
        ctx.fillRect(0, 0, width, height)
        break

      case 'gradient':
        if (this.gradientCanvas) {
          ctx.drawImage(this.gradientCanvas, 0, 0, width, height)
        }
        break

      case 'image':
      case 'wallpaper':
        if (this.backgroundImage) {
          if (this.options.type === 'wallpaper') {
            // Cover mode - fill entire canvas
            const scale = Math.max(
              width / this.backgroundImage.width,
              height / this.backgroundImage.height
            )
            const scaledWidth = this.backgroundImage.width * scale
            const scaledHeight = this.backgroundImage.height * scale
            const x = (width - scaledWidth) / 2
            const y = (height - scaledHeight) / 2
            ctx.drawImage(this.backgroundImage, x, y, scaledWidth, scaledHeight)
          } else {
            // Contain mode - fit within canvas
            ctx.drawImage(this.backgroundImage, 0, 0, width, height)
          }
        }
        break

      case 'blur':
        if (videoFrame) {
          // Draw blurred background
          ctx.save()
          ctx.filter = `blur(${this.options.blur || 20}px)`
          ctx.drawImage(videoFrame, 0, 0, width, height)
          ctx.restore()

          // Add overlay to darken
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fillRect(0, 0, width, height)
        } else {
          // No video frame available - show fallback background
          ctx.fillStyle = '#1a1a1a'
          ctx.fillRect(0, 0, width, height)
        }
        break
    }

    // Draw video frame with padding and effects
    if (videoFrame) {
      // Simple padding calculation - padding is the space around the video
      const frameX = videoX ?? padding
      const frameY = videoY ?? padding
      const frameWidth = videoWidth ?? (width - padding * 2)
      const frameHeight = videoHeight ?? (height - padding * 2)

      // Draw shadow first (behind the video)
      if (this.options.shadow?.enabled) {
        ctx.save()

        // Create shadow by drawing a blurred shape behind the video
        const shadowOffsetX = this.options.shadow.offsetX || 0
        const shadowOffsetY = this.options.shadow.offsetY || 0
        const shadowBlur = this.options.shadow.blur || 40
        const shadowColor = this.options.shadow.color || 'rgba(0, 0, 0, 0.5)'

        // Draw shadow shape
        ctx.filter = `blur(${shadowBlur}px)`
        ctx.fillStyle = shadowColor

        if (this.options.borderRadius && this.options.borderRadius > 0) {
          // Draw rounded rectangle for shadow
          this.roundRect(
            ctx,
            frameX + shadowOffsetX,
            frameY + shadowOffsetY,
            frameWidth,
            frameHeight,
            this.options.borderRadius
          )
          ctx.fill()
        } else {
          // Draw regular rectangle for shadow
          ctx.fillRect(
            frameX + shadowOffsetX,
            frameY + shadowOffsetY,
            frameWidth,
            frameHeight
          )
        }

        ctx.restore()
      }

      // Draw the video frame with clipping for rounded corners
      ctx.save()

      // Apply border radius clipping if specified
      if (this.options.borderRadius && this.options.borderRadius > 0) {
        this.roundRect(ctx, frameX, frameY, frameWidth, frameHeight, this.options.borderRadius)
        ctx.clip()
      }

      // Draw the video frame
      ctx.drawImage(videoFrame, frameX, frameY, frameWidth, frameHeight)

      ctx.restore()
    }
  }

  private roundRect(
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

  updateOptions(options: Partial<BackgroundOptions>) {
    this.options = { ...this.options, ...options }

    if (options.gradient || options.type === 'gradient') {
      this.createGradientCanvas()
    }

    if (options.image || options.type === 'image' || options.type === 'wallpaper') {
      this.initializeBackground()
    }
  }

  /**
   * Calculate the actual video bounds after padding
   * Useful for coordinate transformation in zoom effects
   */
  getVideoBounds(canvasWidth: number, canvasHeight: number): {
    x: number
    y: number
    width: number
    height: number
  } {
    const padding = this.options.padding || 0

    return {
      x: padding,
      y: padding,
      width: canvasWidth - padding * 2,
      height: canvasHeight - padding * 2
    }
  }

  dispose() {
    this.backgroundImage = null
    this.gradientCanvas = null
    this.gradientCtx = null
  }
}
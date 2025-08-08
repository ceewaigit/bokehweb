"use client"

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
    color: string
    blur: number
    offsetX: number
    offsetY: number
  }
}

export class BackgroundRenderer {
  private backgroundImage: HTMLImageElement | null = null
  private gradientCanvas: HTMLCanvasElement | null = null
  private gradientCtx: CanvasRenderingContext2D | null = null
  
  constructor(private options: BackgroundOptions = { type: 'solid', color: '#000000' }) {
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
        }
        break
    }
    
    // Draw video frame with padding and effects
    if (videoFrame) {
      const frameX = videoX ?? padding
      const frameY = videoY ?? padding
      const frameWidth = videoWidth ?? (width - padding * 2)
      const frameHeight = videoHeight ?? (height - padding * 2)
      
      ctx.save()
      
      // Apply shadow if specified
      if (this.options.shadow) {
        ctx.shadowColor = this.options.shadow.color
        ctx.shadowBlur = this.options.shadow.blur
        ctx.shadowOffsetX = this.options.shadow.offsetX
        ctx.shadowOffsetY = this.options.shadow.offsetY
      }
      
      // Apply border radius if specified
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
  
  dispose() {
    this.backgroundImage = null
    this.gradientCanvas = null
    this.gradientCtx = null
  }
}
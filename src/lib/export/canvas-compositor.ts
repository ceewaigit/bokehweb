/**
 * Canvas-based compositor for rendering video frames with effects during export
 * Uses OffscreenCanvas for parallel rendering when available
 * 
 * Architecture Note:
 * - This compositor contains simplified rendering logic optimized for export performance
 * - Full-featured effect renderers (like KeystrokeRenderer) are used for live preview
 * - We keep simplified versions here to avoid complex state management during export
 * - This approach trades some code duplication for better export performance and reliability
 */

import type { 
  Effect,
  Clip,
  Recording,
  RecordingMetadata,
  ExportSettings
} from '@/types'
import { EffectType, RecordingSourceType, BackgroundType, AnnotationType, KeystrokePosition } from '@/types'
import { logger } from '@/lib/utils/logger'
import { interpolateMousePositionNormalized } from '@/lib/effects/utils/mouse-interpolation'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { EffectRenderer } from '@/lib/effects/effect-renderer'

export interface CompositorFrame {
  frameNumber: number
  timestamp: number  // Time in ms
  canvas: OffscreenCanvas | HTMLCanvasElement
  imageData?: ImageData
}

export interface RenderContext {
  clip: Clip
  recording: Recording
  metadata: RecordingMetadata
  effects: Effect[]
  videoElement: HTMLVideoElement
  settings: ExportSettings
}

export class CanvasCompositor {
  private canvasPool: (OffscreenCanvas | HTMLCanvasElement)[] = []
  private readonly supportsOffscreen: boolean
  private maxPoolSize = 8
  private effectRenderer: EffectRenderer
  
  constructor() {
    this.supportsOffscreen = typeof OffscreenCanvas !== 'undefined'
    logger.info(`Canvas compositor initialized. OffscreenCanvas: ${this.supportsOffscreen}`)
    this.effectRenderer = new EffectRenderer()
  }
  
  /**
   * Initialize canvas pool for rendering
   */
  initializePool(width: number, height: number, poolSize: number = 4): void {
    this.maxPoolSize = Math.min(poolSize, 8)  // Cap at 8 for memory
    
    // Clear existing pool
    this.canvasPool = []
    
    for (let i = 0; i < this.maxPoolSize; i++) {
      const canvas = this.createCanvas(width, height)
      this.canvasPool.push(canvas)
    }
    
    logger.debug(`Canvas pool initialized with ${this.maxPoolSize} canvases (${width}x${height})`)
  }
  
  /**
   * Create a canvas (OffscreenCanvas if available, HTMLCanvasElement otherwise)
   */
  private createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
    if (this.supportsOffscreen) {
      return new OffscreenCanvas(width, height)
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    }
  }
  
  /**
   * Get an available canvas from the pool
   */
  private getCanvas(): OffscreenCanvas | HTMLCanvasElement | null {
    return this.canvasPool.pop() || null
  }
  
  /**
   * Return a canvas to the pool
   */
  private returnCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): void {
    if (this.canvasPool.length < this.maxPoolSize) {
      // Clear the canvas before returning to pool
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
      if (ctx && 'clearRect' in ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      this.canvasPool.push(canvas)
    }
  }
  
  /**
   * Render a single frame with all effects
   */
  async renderFrame(
    frameNumber: number,
    context: RenderContext
  ): Promise<CompositorFrame> {
    const startTime = performance.now()
    
    // Get canvas from pool or create new one
    let canvas = this.getCanvas()
    if (!canvas) {
      canvas = this.createCanvas(
        context.settings.resolution.width,
        context.settings.resolution.height
      )
    }
    
    try {
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }
      
      // Calculate timestamp for this frame
      const fps = context.settings.framerate || 30
      const timestamp = (frameNumber / fps) * 1000
      
      // Seek video to correct time
      const clipTime = timestamp - context.clip.startTime
      const sourceTime = this.calculateSourceTime(context.clip, clipTime)
      context.videoElement.currentTime = sourceTime / 1000
      
      // Wait for video to be ready at this time
      await this.waitForVideoReady(context.videoElement)
      
      // Clear canvas
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Apply background effect if present
      this.applyBackgroundEffect(ctx, canvas, context.effects, timestamp)
      
      // Draw video frame with zoom
      this.drawVideoFrame(ctx, canvas, context.videoElement, context.effects, timestamp, context.metadata)
      
      // Apply overlay effects
      await this.applyOverlayEffects(ctx, canvas, context, timestamp)
      
      const renderTime = performance.now() - startTime
      if (frameNumber % 30 === 0) {  // Log every second
        logger.debug(`Frame ${frameNumber} rendered in ${renderTime.toFixed(2)}ms`)
      }
      
      return {
        frameNumber,
        timestamp,
        canvas
      }
    } catch (error) {
      // Return canvas to pool on error
      this.returnCanvas(canvas)
      logger.error(`Failed to render frame ${frameNumber}:`, error)
      throw error
    }
  }
  
  /**
   * Render multiple frames in parallel
   */
  async renderFrameBatch(
    startFrame: number,
    endFrame: number,
    context: RenderContext,
    parallelCount: number = 4
  ): Promise<CompositorFrame[]> {
    const frames: CompositorFrame[] = []
    const batchSize = Math.ceil((endFrame - startFrame) / parallelCount)
    
    try {
      // Create batches for parallel processing
      const batches: Promise<CompositorFrame[]>[] = []
      
      for (let i = 0; i < parallelCount; i++) {
        const batchStart = startFrame + (i * batchSize)
        const batchEnd = Math.min(batchStart + batchSize, endFrame)
        
        if (batchStart < batchEnd) {
          batches.push(this.renderBatch(batchStart, batchEnd, context))
        }
      }
      
      // Wait for all batches to complete
      const results = await Promise.all(batches)
      
      // Flatten results
      for (const batch of results) {
        frames.push(...batch)
      }
      
      // Sort by frame number
      frames.sort((a, b) => a.frameNumber - b.frameNumber)
      
      return frames
    } catch (error) {
      // Clean up any rendered frames on error
      for (const frame of frames) {
        if (frame.canvas) {
          this.returnCanvas(frame.canvas)
        }
      }
      throw error
    }
  }
  
  /**
   * Render a batch of frames sequentially
   */
  private async renderBatch(
    startFrame: number,
    endFrame: number,
    context: RenderContext
  ): Promise<CompositorFrame[]> {
    const frames: CompositorFrame[] = []
    
    for (let frame = startFrame; frame < endFrame; frame++) {
      const renderedFrame = await this.renderFrame(frame, context)
      frames.push(renderedFrame)
    }
    
    return frames
  }
  
  /**
   * Calculate source time with time remapping
   */
  private calculateSourceTime(clip: Clip, clipRelativeTime: number): number {
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
      let sourceTime = clip.sourceIn
      let remainingTime = clipRelativeTime
      
      for (const period of clip.timeRemapPeriods) {
        const periodDuration = period.sourceEndTime - period.sourceStartTime
        const periodPlaybackDuration = periodDuration / period.speedMultiplier
        
        if (remainingTime <= periodPlaybackDuration) {
          return sourceTime + (remainingTime * period.speedMultiplier)
        }
        
        remainingTime -= periodPlaybackDuration
        sourceTime = period.sourceEndTime
      }
      
      const playbackRate = clip.playbackRate || 1
      return sourceTime + (remainingTime * playbackRate)
    }
    
    const playbackRate = clip.playbackRate || 1
    return clip.sourceIn + (clipRelativeTime * playbackRate)
  }
  
  /**
   * Wait for video to be ready at current time
   */
  private async waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      if (video.readyState >= 2) {  // HAVE_CURRENT_DATA
        resolve()
      } else {
        const onReady = () => {
          video.removeEventListener('canplay', onReady)
          resolve()
        }
        video.addEventListener('canplay', onReady)
        
        // Timeout after 1 second
        setTimeout(() => {
          video.removeEventListener('canplay', onReady)
          resolve()
        }, 1000)
      }
    })
  }
  
  /**
   * Apply background effect
   */
  private applyBackgroundEffect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: OffscreenCanvas | HTMLCanvasElement,
    effects: Effect[],
    timestamp: number
  ): void {
    const backgroundEffect = EffectsFactory.getActiveEffectAtTime(
      effects,
      EffectType.Background,
      timestamp
    )
    
    if (!backgroundEffect) return
    
    const data = EffectsFactory.getBackgroundData(backgroundEffect)
    if (!data) return
    
    if (data.type === BackgroundType.Gradient && data.gradient) {
      const gradient = ctx.createLinearGradient(
        0, 0,
        canvas.width * Math.cos(data.gradient.angle * Math.PI / 180),
        canvas.height * Math.sin(data.gradient.angle * Math.PI / 180)
      )
      
      data.gradient!.colors.forEach((color: string, index: number) => {
        gradient.addColorStop(index / (data.gradient!.colors.length - 1), color)
      })
      
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (data.type === BackgroundType.Color && data.color) {
      ctx.fillStyle = data.color
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }
  
  /**
   * Draw video frame with zoom and transformations
   */
  private drawVideoFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: OffscreenCanvas | HTMLCanvasElement,
    video: HTMLVideoElement,
    effects: Effect[],
    timestamp: number,
    metadata?: RecordingMetadata
  ): void {
    // Find active zoom effect
    const zoomEffect = EffectsFactory.getActiveEffectAtTime(
      effects,
      EffectType.Zoom,
      timestamp
    )
    
    ctx.save()
    
    if (zoomEffect && metadata?.mouseEvents) {
      const zoomData = EffectsFactory.getZoomData(zoomEffect)
      if (!zoomData) {
        ctx.restore()
        return
      }
      const scale = zoomData.scale || 2
      
      // Get normalized mouse position for smooth zoom tracking
      const normalizedPos = interpolateMousePositionNormalized(
        metadata.mouseEvents.map(e => ({
          timestamp: e.timestamp,
          x: e.x,
          y: e.y,
          screenWidth: canvas.width,
          screenHeight: canvas.height
        })) as any,
        timestamp
      )
      
      if (normalizedPos) {
        // Calculate zoom center based on mouse position
        const zoomX = normalizedPos.x * canvas.width
        const zoomY = normalizedPos.y * canvas.height
        
        // Apply zoom transformation
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.scale(scale, scale)
        // Pan to keep mouse position centered
        ctx.translate(
          -(zoomX - canvas.width / 2) / scale - canvas.width / 2,
          -(zoomY - canvas.height / 2) / scale - canvas.height / 2
        )
      } else {
        // Fallback to center zoom
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        ctx.translate(centerX, centerY)
        ctx.scale(scale, scale)
        ctx.translate(-centerX, -centerY)
      }
    }
    
    // Draw video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    ctx.restore()
  }
  
  /**
   * Apply overlay effects using the unified effect renderer
   * This ensures exact same rendering as preview
   */
  private async applyOverlayEffects(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: OffscreenCanvas | HTMLCanvasElement,
    context: RenderContext,
    timestamp: number
  ): Promise<void> {
    // Use the effect renderer for all overlay effects
    await this.effectRenderer.renderEffects({
      canvas,
      ctx,
      timestamp,
      width: canvas.width,
      height: canvas.height,
      videoWidth: context.recording.width || 1920,
      videoHeight: context.recording.height || 1080,
      effects: context.effects,
      mouseEvents: context.metadata.mouseEvents,
      keyboardEvents: context.metadata.keyboardEvents,
      clickEvents: context.metadata.clickEvents
    })
  }
  
  /**
   * Draw cursor at current position with smooth rendering
   */
  private drawCursor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: OffscreenCanvas | HTMLCanvasElement,
    mouseEvents: any[],
    timestamp: number
  ): void {
    // Find mouse position at this timestamp
    const mouseEvent = this.interpolateMousePosition(mouseEvents, timestamp)
    if (!mouseEvent) return
    
    // Draw macOS-style cursor with drop shadow
    ctx.save()
    
    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 2
    
    // Cursor arrow shape (macOS style)
    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1
    
    ctx.beginPath()
    ctx.moveTo(mouseEvent.x, mouseEvent.y)
    ctx.lineTo(mouseEvent.x + 12, mouseEvent.y + 12)
    ctx.lineTo(mouseEvent.x + 5, mouseEvent.y + 12)
    ctx.lineTo(mouseEvent.x + 7, mouseEvent.y + 17)
    ctx.lineTo(mouseEvent.x + 4, mouseEvent.y + 18)
    ctx.lineTo(mouseEvent.x + 2, mouseEvent.y + 13)
    ctx.lineTo(mouseEvent.x, mouseEvent.y + 15)
    ctx.closePath()
    
    ctx.fill()
    ctx.stroke()
    
    ctx.restore()
  }
  
  
  /**
   * Draw annotation overlay
   */
  private drawAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: OffscreenCanvas | HTMLCanvasElement,
    annotation: Effect,
    timestamp: number
  ): void {
    const data = annotation.data as any
    const type = data.type || 'text'
    
    // Calculate fade based on effect timing
    const effectDuration = annotation.endTime - annotation.startTime
    const effectAge = timestamp - annotation.startTime
    const fadeInTime = 200
    const fadeOutTime = 200
    
    let opacity = 1
    if (effectAge < fadeInTime) {
      opacity = effectAge / fadeInTime
    } else if (effectAge > effectDuration - fadeOutTime) {
      opacity = (effectDuration - effectAge) / fadeOutTime
    }
    
    if (opacity <= 0) return
    
    ctx.save()
    ctx.globalAlpha = opacity * (data.style?.opacity || 1)
    
    const position = data.position || { x: 100, y: 100 }
    const style = data.style || {}
    
    switch (type) {
      case AnnotationType.Text:
        this.drawTextAnnotation(ctx, position, data.content || '', style)
        break
      case AnnotationType.Arrow:
        this.drawArrowAnnotation(ctx, position, data.endPosition || { x: 200, y: 200 }, style)
        break
      case AnnotationType.Highlight:
        this.drawHighlightAnnotation(ctx, position, data.width || 100, data.height || 100, style)
        break
    }
    
    ctx.restore()
  }
  
  private drawTextAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    position: { x: number; y: number },
    text: string,
    style: any
  ): void {
    const fontSize = style.fontSize || 18
    const fontFamily = style.fontFamily || 'system-ui, -apple-system, sans-serif'
    const color = style.color || '#ffffff'
    const bgColor = style.backgroundColor
    const padding = style.padding || 8
    
    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`
    
    if (bgColor) {
      const metrics = ctx.measureText(text)
      const boxWidth = metrics.width + padding * 2
      const boxHeight = fontSize * 1.4 + padding * 2
      
      ctx.fillStyle = bgColor
      ctx.fillRect(position.x - padding, position.y - padding, boxWidth, boxHeight)
    }
    
    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(text, position.x, position.y)
  }
  
  private drawArrowAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    style: any
  ): void {
    const color = style.color || '#ff0000'
    const strokeWidth = style.strokeWidth || 3
    const arrowHeadSize = style.arrowHeadSize || 10
    
    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    // Draw line
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    
    // Draw arrowhead
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    ctx.save()
    ctx.translate(end.x, end.y)
    ctx.rotate(angle)
    
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-arrowHeadSize, -arrowHeadSize / 2)
    ctx.lineTo(-arrowHeadSize, arrowHeadSize / 2)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    
    ctx.restore()
  }
  
  private drawHighlightAnnotation(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    position: { x: number; y: number },
    width: number,
    height: number,
    style: any
  ): void {
    const color = style.backgroundColor || 'rgba(255, 255, 0, 0.3)'
    const borderColor = style.borderColor
    const borderWidth = style.borderWidth || 2
    
    ctx.fillStyle = color
    ctx.fillRect(position.x, position.y, width, height)
    
    if (borderColor) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      ctx.strokeRect(position.x, position.y, width, height)
    }
  }

  /**
   * Interpolate mouse position at timestamp with smooth easing
   */
  private interpolateMousePosition(
    mouseEvents: any[],
    timestamp: number
  ): { x: number; y: number } | null {
    if (mouseEvents.length === 0) return null
    
    // Find surrounding events
    let before = mouseEvents[0]
    let after = mouseEvents[mouseEvents.length - 1]
    
    for (let i = 0; i < mouseEvents.length - 1; i++) {
      if (mouseEvents[i].timestamp <= timestamp && mouseEvents[i + 1].timestamp > timestamp) {
        before = mouseEvents[i]
        after = mouseEvents[i + 1]
        break
      }
    }
    
    if (before === after) {
      return { x: before.mouseX || before.x, y: before.mouseY || before.y }
    }
    
    // Smooth interpolation with easing
    const t = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // ease-in-out quad
    
    const beforeX = before.mouseX || before.x
    const beforeY = before.mouseY || before.y
    const afterX = after.mouseX || after.x
    const afterY = after.mouseY || after.y
    
    return {
      x: beforeX + (afterX - beforeX) * eased,
      y: beforeY + (afterY - beforeY) * eased
    }
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    // Clear all canvases from pool
    for (const canvas of this.canvasPool) {
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
      if (ctx && 'clearRect' in ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    this.canvasPool = []
    
    // Dispose effect renderer
    this.effectRenderer.dispose()
    
    logger.debug('Canvas compositor disposed')
  }
}

// Singleton instance
export const canvasCompositor = new CanvasCompositor()
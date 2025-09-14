/**
 * Unified effect renderer that can be used by both Remotion preview and export
 * This ensures consistent rendering between preview and final export
 */

import type { 
  Effect, 
  KeyboardEvent, 
  MouseEvent, 
  ClickEvent,
  BackgroundEffectData,
  CursorEffectData,
  KeystrokeEffectData,
  AnnotationData
} from '@/types/project'
import { EffectType, BackgroundType, AnnotationType, CursorStyle, KeystrokePosition } from '@/types/project'
import { KeystrokeRenderer } from './keystroke-renderer'
import { CursorType, electronToCustomCursor, getCursorImagePath } from './cursor-types'

export interface EffectRenderContext {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  timestamp: number // in ms
  width: number
  height: number
  videoWidth: number
  videoHeight: number
  effects: Effect[]
  mouseEvents?: MouseEvent[]
  keyboardEvents?: KeyboardEvent[]
  clickEvents?: ClickEvent[]
}

/**
 * Effect rendering logic for export
 * Separate from preview components but uses same data
 */
export class EffectRenderer {
  private keystrokeRenderer: KeystrokeRenderer
  private cursorImage: HTMLImageElement | null = null
  private cursorType: CursorType = CursorType.ARROW
  
  constructor() {
    // Initialize renderers with defaults
    this.keystrokeRenderer = new KeystrokeRenderer({
      fontSize: 16,
      fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      textColor: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 6,
      padding: 12,
      fadeOutDuration: 300,
      position: KeystrokePosition.BottomCenter,
      maxWidth: 300
    })
  }
  
  /**
   * Render background effect
   */
  renderBackground(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as BackgroundEffectData
    if (!data?.type) return
    
    const { ctx, width, height } = context
    
    switch (data.type) {
      case BackgroundType.Color:
        ctx.fillStyle = data.color || '#000000'
        ctx.fillRect(0, 0, width, height)
        break
        
      case BackgroundType.Gradient:
        if (data.gradient?.colors?.length) {
          const gradient = this.createGradient(ctx, width, height, data.gradient)
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, width, height)
        }
        break
        
      case BackgroundType.Wallpaper:
        // Draw gradient first as base
        if (data.gradient?.colors?.length) {
          const gradient = this.createGradient(ctx, width, height, data.gradient)
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, width, height)
        }
        // Wallpaper would be composited on top if available
        // This requires image loading which should be handled externally
        break
        
      case BackgroundType.Image:
        // Image rendering requires external image loading
        // Should be handled by the compositor
        break
    }
  }
  
  /**
   * Render cursor effect using exact same logic as CursorLayer
   */
  async renderCursor(context: EffectRenderContext, effect: Effect): Promise<void> {
    const data = effect.data as CursorEffectData
    if (!context.mouseEvents || context.mouseEvents.length === 0) return
    
    const { ctx, timestamp, videoWidth, videoHeight } = context
    
    // Find cursor position at timestamp (same interpolation as CursorLayer)
    const cursorPos = this.interpolateCursorPosition(context.mouseEvents, timestamp)
    if (!cursorPos) return
    
    // Determine cursor type from events
    const cursorEvent = context.mouseEvents.find(e => e.timestamp <= timestamp) || context.mouseEvents[0]
    const cursorType = electronToCustomCursor(cursorEvent?.cursorType || 'default')
    
    // Apply hide on idle if configured
    if (data.hideOnIdle) {
      const lastMovement = context.mouseEvents
        .filter(e => e.timestamp <= timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0]
      
      if (lastMovement && timestamp - lastMovement.timestamp > data.idleTimeout) {
        return // Hide cursor when idle
      }
    }
    
    // Draw cursor based on style
    ctx.save()
    
    if (data.style === CursorStyle.MacOS || data.style === CursorStyle.Default) {
      // Draw macOS-style cursor
      this.drawMacOSCursor(ctx, cursorPos.x, cursorPos.y, cursorType, data.size || 1)
    } else if (data.style === CursorStyle.Custom && data.color) {
      // Draw custom colored cursor
      this.drawCustomCursor(ctx, cursorPos.x, cursorPos.y, data.color, data.size || 1)
    }
    
    // Draw click effect if needed
    if (data.clickEffects && context.clickEvents) {
      this.drawClickEffects(ctx, context.clickEvents, timestamp)
    }
    
    ctx.restore()
  }
  
  /**
   * Render keystroke effect using the KeystrokeRenderer
   */
  renderKeystroke(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as KeystrokeEffectData
    if (!context.keyboardEvents || context.keyboardEvents.length === 0) return
    
    // Update renderer settings from effect data
    this.keystrokeRenderer.updateSettings({
      fontSize: data.fontSize || 16,
      fontFamily: data.fontFamily || 'SF Pro Display, system-ui, -apple-system, sans-serif',
      backgroundColor: data.backgroundColor || 'rgba(0, 0, 0, 0.8)',
      textColor: data.textColor || '#ffffff',
      borderColor: data.borderColor || 'rgba(255, 255, 255, 0.2)',
      borderRadius: data.borderRadius || 6,
      padding: data.padding || 12,
      fadeOutDuration: data.fadeOutDuration || 300,
      position: data.position || KeystrokePosition.BottomCenter,
      maxWidth: data.maxWidth || 300
    })
    
    // Set events and render
    this.keystrokeRenderer.setKeyboardEvents(context.keyboardEvents)
    this.keystrokeRenderer.setCanvas(context.canvas as HTMLCanvasElement)
    this.keystrokeRenderer.render(context.timestamp, context.width, context.height)
  }
  
  /**
   * Render annotation effect
   */
  renderAnnotation(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as AnnotationData
    if (!data) return
    
    const { ctx, timestamp } = context
    
    // Calculate fade based on effect timing
    const effectDuration = effect.endTime - effect.startTime
    const effectAge = timestamp - effect.startTime
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
    
    switch (data.type) {
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
  
  /**
   * Main render method that processes all effects
   */
  async renderEffects(context: EffectRenderContext): Promise<void> {
    const { effects, timestamp } = context
    
    // Find active effects at current timestamp
    const activeEffects = effects.filter(e => 
      e.enabled &&
      timestamp >= e.startTime &&
      timestamp <= e.endTime
    )
    
    // Render in order: background -> video -> cursor -> keystroke -> annotations
    for (const effect of activeEffects) {
      switch (effect.type) {
        case EffectType.Background:
          this.renderBackground(context, effect)
          break
        case EffectType.Cursor:
          await this.renderCursor(context, effect)
          break
        case EffectType.Keystroke:
          this.renderKeystroke(context, effect)
          break
        case EffectType.Annotation:
          this.renderAnnotation(context, effect)
          break
        // Zoom is handled separately by video transformation
      }
    }
  }
  
  // Helper methods
  
  private createGradient(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    gradientData: { colors: string[], angle: number }
  ): CanvasGradient {
    const angle = (gradientData.angle || 135) * Math.PI / 180
    const x1 = width / 2 - Math.cos(angle) * width / 2
    const y1 = height / 2 - Math.sin(angle) * height / 2
    const x2 = width / 2 + Math.cos(angle) * width / 2
    const y2 = height / 2 + Math.sin(angle) * height / 2
    
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    gradientData.colors.forEach((color, index) => {
      const stop = index / (gradientData.colors.length - 1)
      gradient.addColorStop(stop, color)
    })
    
    return gradient
  }
  
  private interpolateCursorPosition(
    mouseEvents: MouseEvent[],
    timestamp: number
  ): { x: number, y: number } | null {
    if (mouseEvents.length === 0) return null
    
    // Find surrounding events for interpolation
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
      return { x: before.x, y: before.y }
    }
    
    // Smooth interpolation
    const t = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    
    return {
      x: before.x + (after.x - before.x) * eased,
      y: before.y + (after.y - before.y) * eased
    }
  }
  
  private drawMacOSCursor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    type: CursorType,
    scale: number
  ): void {
    // Draw macOS-style cursor
    ctx.save()
    
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 4 * scale
    ctx.shadowOffsetX = 1 * scale
    ctx.shadowOffsetY = 2 * scale
    
    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1 * scale
    
    if (type === CursorType.ARROW) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 12 * scale, y + 12 * scale)
      ctx.lineTo(x + 5 * scale, y + 12 * scale)
      ctx.lineTo(x + 7 * scale, y + 17 * scale)
      ctx.lineTo(x + 4 * scale, y + 18 * scale)
      ctx.lineTo(x + 2 * scale, y + 13 * scale)
      ctx.lineTo(x, y + 15 * scale)
      ctx.closePath()
      
      ctx.fill()
      ctx.stroke()
    }
    // Add other cursor types as needed
    
    ctx.restore()
  }
  
  private drawCustomCursor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    scale: number
  ): void {
    ctx.save()
    
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 5 * scale, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
  }
  
  private drawClickEffects(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    clickEvents: ClickEvent[],
    timestamp: number
  ): void {
    // Draw ripple effects for recent clicks
    const recentClicks = clickEvents.filter(e => 
      e.timestamp <= timestamp &&
      timestamp - e.timestamp < 500 // Show ripple for 500ms
    )
    
    for (const click of recentClicks) {
      const age = timestamp - click.timestamp
      const progress = age / 500
      const radius = 20 + progress * 30
      const opacity = 1 - progress
      
      ctx.save()
      ctx.globalAlpha = opacity * 0.5
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(click.x, click.y, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
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
   * Cleanup resources
   */
  dispose(): void {
    this.keystrokeRenderer?.reset()
  }
}
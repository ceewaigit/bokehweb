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
import { calculateBackgroundStyle, applyGradientToCanvas } from './utils/background-calculator'
import { calculateCursorState, getCursorPath, type CursorState } from './utils/cursor-calculator'

export interface EffectRenderContext {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  timestamp: number // in ms
  width: number
  height: number
  videoWidth: number
  videoHeight: number
  fps?: number
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
  private cursorStateCache = new Map<string, CursorState>()

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
   * Render background effect using calculator
   */
  renderBackground(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as BackgroundEffectData
    if (!data?.type) return

    const { ctx, width, height } = context

    // Use background calculator for consistent rendering
    const backgroundStyle = calculateBackgroundStyle(data, width, height)

    if (backgroundStyle.canvasDrawing) {
      if (backgroundStyle.canvasDrawing.type === 'fill') {
        ctx.fillStyle = backgroundStyle.canvasDrawing.color || '#000000'
        ctx.fillRect(0, 0, width, height)
      } else if (backgroundStyle.canvasDrawing.type === 'gradient' && backgroundStyle.canvasDrawing.gradient) {
        applyGradientToCanvas(
          ctx,
          backgroundStyle.canvasDrawing.gradient,
          width,
          height
        )
      }
      // Image backgrounds handled externally by compositor
    }
  }

  /**
   * Render cursor effect using calculator
   */
  async renderCursor(context: EffectRenderContext, effect: Effect): Promise<void> {
    const data = effect.data as CursorEffectData
    if (!context.mouseEvents || context.mouseEvents.length === 0) return

    const { ctx, timestamp } = context
    const cacheKey = effect.id || 'default'
    const previousState = this.getPreviousCursorState(cacheKey, timestamp)

    // Use cursor calculator for state calculation
    const cursorState = calculateCursorState(
      data,
      context.mouseEvents,
      context.clickEvents || [],
      timestamp,
      previousState,
      context.fps
    )

    this.cursorStateCache.set(cacheKey, cursorState)

    if (!cursorState.visible) return

    // Draw cursor using calculated state
    ctx.save()
    ctx.globalAlpha = cursorState.opacity

    // Apply shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 4 * cursorState.scale
    ctx.shadowOffsetX = 1 * cursorState.scale
    ctx.shadowOffsetY = 2 * cursorState.scale

    // Draw cursor using path from calculator
    const cursorPath = getCursorPath(cursorState.x, cursorState.y, cursorState.type, cursorState.scale)
    ctx.fillStyle = data.style === CursorStyle.Custom && data.color ? data.color : '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1 * cursorState.scale
    ctx.fill(cursorPath)
    ctx.stroke(cursorPath)

    // Draw click effects from calculated state
    if (cursorState.clickEffects.length > 0) {
      ctx.shadowColor = 'transparent'
      for (const click of cursorState.clickEffects) {
        ctx.globalAlpha = click.opacity
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(click.x, click.y, click.radius, 0, Math.PI * 2)
        ctx.stroke()
      }
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

  // Helper methods - Most logic now moved to calculators

  // Drawing methods removed - now using calculators and their path generation

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

  private getPreviousCursorState(cacheKey: string, timestamp: number): CursorState | undefined {
    const prev = this.cursorStateCache.get(cacheKey)
    if (!prev) return undefined

    if (!Number.isFinite(prev.timestamp) || timestamp <= prev.timestamp) {
      this.cursorStateCache.delete(cacheKey)
      return undefined
    }

    return prev
  }
}

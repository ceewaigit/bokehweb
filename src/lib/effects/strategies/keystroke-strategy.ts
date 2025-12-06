/**
 * Keystroke effect rendering strategy
 */

import type { Effect, KeystrokeEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import type { EffectRenderContext } from '../effect-renderer'
import type { IEffectStrategy } from './index'
import { KeystrokeRenderer } from '../keystroke-renderer'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'

export class KeystrokeEffectStrategy implements IEffectStrategy {
  readonly effectType = EffectType.Keystroke

  private keystrokeRenderer: KeystrokeRenderer

  constructor() {
    // Initialize renderer with centralized defaults
    this.keystrokeRenderer = new KeystrokeRenderer({
      fontSize: DEFAULT_KEYSTROKE_DATA.fontSize!,
      fontFamily: DEFAULT_KEYSTROKE_DATA.fontFamily!,
      backgroundColor: DEFAULT_KEYSTROKE_DATA.backgroundColor!,
      textColor: DEFAULT_KEYSTROKE_DATA.textColor!,
      borderColor: DEFAULT_KEYSTROKE_DATA.borderColor!,
      borderRadius: DEFAULT_KEYSTROKE_DATA.borderRadius!,
      padding: DEFAULT_KEYSTROKE_DATA.padding!,
      fadeOutDuration: DEFAULT_KEYSTROKE_DATA.fadeOutDuration!,
      position: DEFAULT_KEYSTROKE_DATA.position!,
      maxWidth: DEFAULT_KEYSTROKE_DATA.maxWidth!
    })
  }

  canRender(effect: Effect): boolean {
    return effect.type === EffectType.Keystroke
  }

  render(context: EffectRenderContext, effect: Effect): void {
    const data = effect.data as KeystrokeEffectData
    if (!context.keyboardEvents || context.keyboardEvents.length === 0) return

    // Update renderer settings from effect data, falling back to centralized defaults
    this.keystrokeRenderer.updateSettings({
      fontSize: data.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize!,
      fontFamily: data.fontFamily ?? DEFAULT_KEYSTROKE_DATA.fontFamily!,
      backgroundColor: data.backgroundColor ?? DEFAULT_KEYSTROKE_DATA.backgroundColor!,
      textColor: data.textColor ?? DEFAULT_KEYSTROKE_DATA.textColor!,
      borderColor: data.borderColor ?? DEFAULT_KEYSTROKE_DATA.borderColor!,
      borderRadius: data.borderRadius ?? DEFAULT_KEYSTROKE_DATA.borderRadius!,
      padding: data.padding ?? DEFAULT_KEYSTROKE_DATA.padding!,
      fadeOutDuration: data.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration!,
      position: data.position ?? DEFAULT_KEYSTROKE_DATA.position!,
      maxWidth: data.maxWidth ?? DEFAULT_KEYSTROKE_DATA.maxWidth!
    })

    // Set events and render
    this.keystrokeRenderer.setKeyboardEvents(context.keyboardEvents)
    this.keystrokeRenderer.setCanvas(context.canvas as HTMLCanvasElement)
    this.keystrokeRenderer.render(context.timestamp, context.width, context.height)
  }

  dispose(): void {
    this.keystrokeRenderer?.reset()
  }
}

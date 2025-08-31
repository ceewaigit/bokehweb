/**
 * Effect utilities for cleaner effect management
 */

import type { Effect } from '@/types/project'

export class EffectUtils {
  /**
   * Clone an effect with a new ID and optional overrides
   */
  static cloneEffect(effect: Effect, overrides?: Partial<Effect>): Effect {
    const cloned: any = {
      ...effect,
      ...overrides,
      id: overrides?.id || `${effect.id}-copy-${Date.now()}`
    }

    // Deep clone the data object if it exists
    if (effect.data) {
      cloned.data = { ...effect.data }
    }

    return cloned as Effect
  }

  /**
   * Clone multiple effects for a new clip
   */
  static cloneEffectsForClip(effects: Effect[], newClipId: string): Effect[] {
    return effects.map(effect =>
      EffectUtils.cloneEffect(effect, { clipId: newClipId })
    )
  }

  /**
   * Split an effect at a specific point
   */
  static splitEffect(effect: Effect, splitPoint: number, leftClipId: string, rightClipId: string): Effect[] {
    if (effect.endTime <= splitPoint) {
      // Effect stays with left clip
      return [{ ...effect, clipId: leftClipId }]
    } else if (effect.startTime >= splitPoint) {
      // Effect moves to right clip with adjusted timing
      return [{
        ...effect,
        clipId: rightClipId,
        startTime: effect.startTime - splitPoint,
        endTime: effect.endTime - splitPoint
      }]
    } else {
      // Effect spans the split point - create two effects
      return [
        {
          ...effect,
          id: `${effect.id}-left`,
          clipId: leftClipId,
          endTime: splitPoint
        },
        {
          ...effect,
          id: `${effect.id}-right`,
          clipId: rightClipId,
          startTime: 0,
          endTime: effect.endTime - splitPoint
        }
      ]
    }
  }

  /**
   * Adjust effect timing for trim operations
   */
  static adjustEffectForTrim(effect: Effect, trimStart: number, trimEnd: number): Effect | null {
    // If effect is completely outside the trim range, remove it
    if (effect.endTime <= trimStart || effect.startTime >= trimEnd) {
      return null
    }

    // Adjust the effect timing
    return {
      ...effect,
      startTime: Math.max(0, effect.startTime - trimStart),
      endTime: Math.min(trimEnd - trimStart, effect.endTime - trimStart)
    }
  }
}
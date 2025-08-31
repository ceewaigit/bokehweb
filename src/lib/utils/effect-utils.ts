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
   * Clone multiple effects (no longer needed - effects are timeline-global)
   * @deprecated Effects are now timeline-global
   */
  static cloneEffectsForClip(effects: Effect[], newClipId: string): Effect[] {
    // No-op: Effects are timeline-global, not per-clip
    return []
  }

  /**
   * Split an effect at a specific point (effects are timeline-global, splits may still be needed for zoom effects)
   */
  static splitEffect(effect: Effect, splitPoint: number, leftClipId: string, rightClipId: string): Effect[] {
    // For timeline-global effects, we don't need to split most effects
    // Only zoom effects might need splitting if they're specific to a region
    if (effect.type !== 'zoom') {
      // Background, cursor, keystroke effects don't need splitting
      return [effect]
    }
    
    // For zoom effects, keep them as-is since they use absolute timeline positions
    return [effect]
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
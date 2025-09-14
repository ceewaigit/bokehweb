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

  /**
   * Check if an effect is active at a given time
   */
  static isEffectActive(effect: Effect, time: number): boolean {
    return effect.enabled && time >= effect.startTime && time <= effect.endTime
  }

  /**
   * Get all effects active at a specific time
   */
  static getActiveEffectsAtTime(effects: Effect[], time: number): Effect[] {
    return effects.filter(effect => this.isEffectActive(effect, time))
  }

  /**
   * Check if effects overlap in time
   */
  static doEffectsOverlap(effect1: Effect, effect2: Effect): boolean {
    return effect1.startTime < effect2.endTime && effect2.startTime < effect1.endTime
  }
}
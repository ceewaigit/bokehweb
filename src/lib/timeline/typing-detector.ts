/**
 * Typing detection and speed-up suggestion utility
 */

import type { KeyboardEvent } from '@/types/project'

export interface TypingPeriod {
  startTime: number
  endTime: number
  keyCount: number
  averageWpm: number
  suggestedSpeedMultiplier: number
  confidence: number // 0-1, how confident we are this is typing
}

export interface TypingSuggestions {
  periods: TypingPeriod[]
  overallSuggestion?: {
    speedMultiplier: number
    timesSaved: number // in milliseconds
  }
}

const DEBUG_TYPING = process.env.NEXT_PUBLIC_ENABLE_TYPING_DEBUG === '1'

export class TypingDetector {
  private static readonly MIN_TYPING_DURATION = 2000 // 2 seconds minimum
  private static readonly MAX_GAP_BETWEEN_KEYS = 3000 // 3 seconds max gap
  private static readonly MIN_KEYS_FOR_TYPING = 8 // minimum keys to consider typing
  private static readonly TYPING_CHARS = /^[a-zA-Z0-9\s.,;:!?\-_(){}[\]"'`~@#$%^&*+=<>/\\|]$/

  /**
   * Analyze keyboard events to detect typing periods
   */
  static analyzeTyping(keyboardEvents: KeyboardEvent[]): TypingSuggestions {
    if (!keyboardEvents || keyboardEvents.length === 0) {
      return { periods: [] }
    }

    // Filter to actual typing characters (exclude pure navigation/modifier keys)
    const typingEvents = keyboardEvents.filter(event =>
      this.isTypingKey(event.key) &&
      (!event.modifiers || event.modifiers.length === 0) // exclude shortcuts
    )

    if (typingEvents.length < this.MIN_KEYS_FOR_TYPING) {
      return { periods: [] }
    }

    const periods = this.detectTypingPeriods(typingEvents)
    const overallSuggestion = this.calculateOverallSuggestion(periods)
    
    if (DEBUG_TYPING && periods.length > 0) {
      console.log('[TypingDetector] Detected typing periods', {
        totalKeyboardEvents: keyboardEvents.length,
        typingEvents: typingEvents.length,
        periodsDetected: periods.map(p => ({
          startTime: p.startTime,
          endTime: p.endTime,
          duration: p.endTime - p.startTime,
          keyCount: p.keyCount,
          wpm: p.averageWpm,
          speedMultiplier: p.suggestedSpeedMultiplier
        }))
      })
    }

    return {
      periods,
      overallSuggestion
    }
  }

  /**
   * Check if a key is considered a typing key
   */
  private static isTypingKey(key: string): boolean {
    // Accept alphanumeric and punctuation characters
    if (key.length === 1 && this.TYPING_CHARS.test(key)) {
      return true
    }

    // Accept numeric keycodes emitted by uiohook as strings (e.g., "30")
    if (/^\d+$/.test(key)) {
      return true
    }

    // Common typing keys
    const typingKeys = ['Space', 'Backspace', 'Delete', 'Enter', 'Return', 'Tab']
    return typingKeys.includes(key)
  }

  /**
   * Detect continuous typing periods from filtered events
   */
  private static detectTypingPeriods(typingEvents: KeyboardEvent[]): TypingPeriod[] {
    const periods: TypingPeriod[] = []
    let currentPeriod: KeyboardEvent[] = []

    for (let i = 0; i < typingEvents.length; i++) {
      const event = typingEvents[i]
      const lastEvent = currentPeriod[currentPeriod.length - 1]

      // Start new period or continue current one
      if (!lastEvent || (event.timestamp - lastEvent.timestamp) <= this.MAX_GAP_BETWEEN_KEYS) {
        currentPeriod.push(event)
      } else {
        // Gap too large, finish current period and start new one
        if (this.isValidTypingPeriod(currentPeriod)) {
          periods.push(this.createTypingPeriod(currentPeriod))
        }
        currentPeriod = [event]
      }
    }

    // Don't forget the last period
    if (this.isValidTypingPeriod(currentPeriod)) {
      periods.push(this.createTypingPeriod(currentPeriod))
    }

    return periods
  }

  /**
   * Check if a period qualifies as typing
   */
  private static isValidTypingPeriod(events: KeyboardEvent[]): boolean {
    if (events.length < this.MIN_KEYS_FOR_TYPING) return false

    const duration = events[events.length - 1].timestamp - events[0].timestamp
    return duration >= this.MIN_TYPING_DURATION
  }

  /**
   * Create a TypingPeriod from events
   */
  private static createTypingPeriod(events: KeyboardEvent[]): TypingPeriod {
    const startTime = events[0].timestamp
    const endTime = events[events.length - 1].timestamp
    const duration = endTime - startTime
    const keyCount = events.length

    // Calculate WPM (assuming average word is 5 characters)
    const charactersTyped = events.filter(e => TypingDetector.isPrintableCharacter(e.key)).length
    const words = charactersTyped / 5
    const minutes = duration / 60000
    const averageWpm = minutes > 0 ? words / minutes : 0

    // Calculate confidence based on pattern analysis
    const confidence = this.calculateConfidence(events, averageWpm)

    // Suggest speed multiplier based on typing speed and pattern
    const suggestedSpeedMultiplier = this.calculateSpeedSuggestion(averageWpm, confidence, duration)

    return {
      startTime,
      endTime,
      keyCount,
      averageWpm,
      suggestedSpeedMultiplier,
      confidence
    }
  }

  /**
   * Calculate confidence that this is actually typing (vs random key presses)
   */
  private static isPrintableCharacter(key: string): boolean {
    if (key === 'Space' || key === 'Return' || key === 'Enter' || key === 'Tab') return true
    if (/^\d+$/.test(key)) return true
    return key.length === 1 && this.TYPING_CHARS.test(key)
  }

  private static calculateConfidence(events: KeyboardEvent[], wpm: number): number {
    let confidence = 0.5 // base confidence

    // Higher confidence for reasonable WPM
    if (wpm >= 20 && wpm <= 120) {
      confidence += 0.3
    } else if (wpm >= 10 && wpm <= 150) {
      confidence += 0.1
    }

    // Check for typing patterns
    const hasSpaces = events.some(e => e.key === 'Space')
    const hasBackspace = events.some(e => e.key === 'Backspace')
    const hasLetters = events.some(e => /^[a-zA-Z]$/.test(e.key))

    if (hasSpaces) confidence += 0.1
    if (hasBackspace) confidence += 0.1
    if (hasLetters) confidence += 0.1

    // Check for consistent timing (not too erratic)
    const intervals = []
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].timestamp - events[i - 1].timestamp)
    }

    if (intervals.length > 1) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, interval) =>
        sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)

      // Lower standard deviation suggests more consistent typing
      if (stdDev < avgInterval * 0.5) {
        confidence += 0.1
      }
    }

    return Math.min(1, Math.max(0, confidence))
  }

  /**
   * Calculate suggested speed multiplier
   */
  private static calculateSpeedSuggestion(wpm: number, confidence: number, duration: number): number {
    // Base speed suggestion on typing speed
    let speedMultiplier = 1.0

    // Slower typing = more speed-up potential
    if (wpm < 30) {
      speedMultiplier = 3.0
    } else if (wpm < 50) {
      speedMultiplier = 2.5
    } else if (wpm < 70) {
      speedMultiplier = 2.0
    } else {
      speedMultiplier = 1.5
    }

    // Reduce multiplier for low confidence
    speedMultiplier *= confidence

    // Longer periods can handle more speed-up
    if (duration > 10000) { // 10+ seconds
      speedMultiplier *= 1.1
    }

    // Reasonable bounds
    return Math.min(4.0, Math.max(1.2, speedMultiplier))
  }

  /**
   * Calculate overall suggestion for the entire clip
   */
  private static calculateOverallSuggestion(periods: TypingPeriod[]): {
    speedMultiplier: number
    timesSaved: number
  } | undefined {
    if (periods.length === 0) return undefined

    // Weight by duration and confidence
    let totalDuration = 0
    let weightedSpeedSum = 0

    for (const period of periods) {
      const duration = period.endTime - period.startTime
      const weight = duration * period.confidence
      totalDuration += duration
      weightedSpeedSum += period.suggestedSpeedMultiplier * weight
    }

    if (totalDuration === 0) return undefined

    const averageSpeed = weightedSpeedSum / totalDuration
    const timesSaved = totalDuration * (1 - 1 / averageSpeed)

    return {
      speedMultiplier: Math.round(averageSpeed * 10) / 10, // Round to 1 decimal
      timesSaved: Math.round(timesSaved)
    }
  }

  /**
   * Get typing periods that overlap with a specific time range
   */
  static getTypingPeriodsInRange(
    suggestions: TypingSuggestions,
    startTime: number,
    endTime: number
  ): TypingPeriod[] {
    return suggestions.periods.filter(period =>
      period.startTime < endTime && period.endTime > startTime
    )
  }
} 
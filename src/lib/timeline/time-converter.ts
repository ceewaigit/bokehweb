import type { Clip, Effect } from '@/types/project'
import { TimelineConfig } from './config'

/**
 * Unified time conversion utility for consistent time transformations
 */
export class TimeConverter {
  /**
   * Convert milliseconds to pixels based on zoom level
   */
  static msToPixels(ms: number, pixelsPerMs: number): number {
    return ms * pixelsPerMs
  }

  /**
   * Convert pixels to milliseconds based on zoom level
   */
  static pixelsToMs(pixels: number, pixelsPerMs: number): number {
    return pixels / pixelsPerMs
  }

  /**
   * Convert milliseconds to frame number
   */
  static msToFrame(ms: number, fps: number = TimelineConfig.DEFAULT_FPS): number {
    return Math.floor((ms / 1000) * fps)
  }

  /**
   * Convert frame number to milliseconds
   */
  static frameToMs(frame: number, fps: number = TimelineConfig.DEFAULT_FPS): number {
    return (frame / fps) * 1000
  }

  /**
   * Convert absolute timeline time to clip-relative time
   */
  static toClipRelative(absoluteMs: number, clipStartMs: number): number {
    return absoluteMs - clipStartMs
  }

  /**
   * Convert clip-relative time to absolute timeline time
   */
  static toAbsolute(clipRelativeMs: number, clipStartMs: number): number {
    return clipRelativeMs + clipStartMs
  }

  /**
   * Convert effect times from absolute to clip-relative
   */
  static effectToClipRelative(effect: Effect, clipStartMs: number): Effect {
    return {
      ...effect,
      startTime: this.toClipRelative(effect.startTime, clipStartMs),
      endTime: this.toClipRelative(effect.endTime, clipStartMs)
    }
  }

  /**
   * Convert effect times from clip-relative to absolute
   */
  static effectToAbsolute(effect: Effect, clipStartMs: number): Effect {
    return {
      ...effect,
      startTime: this.toAbsolute(effect.startTime, clipStartMs),
      endTime: this.toAbsolute(effect.endTime, clipStartMs)
    }
  }

  /**
   * Convert array of effects to clip-relative times
   */
  static effectsToClipRelative(effects: Effect[], clipStartMs: number): Effect[] {
    return effects.map(effect => this.effectToClipRelative(effect, clipStartMs))
  }

  /**
   * Convert array of effects to absolute times
   */
  static effectsToAbsolute(effects: Effect[], clipStartMs: number): Effect[] {
    return effects.map(effect => this.effectToAbsolute(effect, clipStartMs))
  }

  /**
   * Calculate pixels per millisecond based on viewport and zoom
   */
  static calculatePixelsPerMs(viewportWidth: number, zoom: number): number {
    const usableWidth = viewportWidth - TimelineConfig.TRACK_LABEL_WIDTH
    const basePixelsPerMs = usableWidth / TimelineConfig.BASE_VISIBLE_DURATION_MS
    return basePixelsPerMs * zoom
  }

  /**
   * Calculate timeline width based on duration and zoom
   */
  static calculateTimelineWidth(
    durationMs: number,
    pixelsPerMs: number,
    minWidth: number
  ): number {
    const extraPadding = durationMs * TimelineConfig.TIMELINE_EXTRA_PADDING_PERCENT
    const totalDuration = durationMs + extraPadding
    const calculatedWidth = totalDuration * pixelsPerMs
    const minUsableWidth = minWidth - TimelineConfig.TRACK_LABEL_WIDTH
    return Math.max(calculatedWidth, minUsableWidth)
  }

  /**
   * Calculate optimal zoom to fit duration in viewport
   */
  static calculateOptimalZoom(durationMs: number, viewportWidth: number): number {
    // We want to show the full duration plus 10% padding on screen initially
    const targetDuration = durationMs * 1.1
    
    // Calculate required zoom to fit target duration in viewport
    const optimalZoom = TimelineConfig.BASE_VISIBLE_DURATION_MS / targetDuration
    
    // Clamp zoom to reasonable values
    const clampedZoom = Math.max(
      TimelineConfig.MIN_ZOOM,
      Math.min(2.0, optimalZoom) // Max 2.0 for initial view
    )
    
    // Round to nearest 0.05 for cleaner values
    return Math.round(clampedZoom * 20) / 20
  }

  /**
   * Format milliseconds to display time (MM:SS.mmm)
   */
  static formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const milliseconds = Math.floor(ms % 1000)
    
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
  }

  /**
   * Parse formatted time string to milliseconds
   */
  static parseTime(timeStr: string): number {
    const parts = timeStr.split(':')
    if (parts.length !== 2) return 0
    
    const minutes = parseInt(parts[0], 10) || 0
    const secondsParts = parts[1].split('.')
    const seconds = parseInt(secondsParts[0], 10) || 0
    const milliseconds = parseInt(secondsParts[1], 10) || 0
    
    return (minutes * 60 + seconds) * 1000 + milliseconds
  }

  /**
   * Snap time to grid interval
   */
  static snapToGrid(
    timeMs: number,
    intervalMs: number = TimelineConfig.SNAP_INTERVAL_MS
  ): number {
    return Math.round(timeMs / intervalMs) * intervalMs
  }

  /**
   * Get ruler intervals based on zoom level
   */
  static getRulerIntervals(zoom: number): { major: number; minor: number } {
    if (zoom < 0.5) {
      return { major: 5000, minor: 1000 }
    } else if (zoom < 1) {
      return { major: 2000, minor: 500 }
    } else if (zoom > 2) {
      return { major: 1000, minor: 50 }
    }
    return { major: 1000, minor: 100 }
  }

  /**
   * Check if a time is within a range
   */
  static isTimeInRange(
    timeMs: number,
    startMs: number,
    endMs: number
  ): boolean {
    return timeMs >= startMs && timeMs <= endMs
  }

  /**
   * Get clip at specific time
   */
  static getClipAtTime(clips: Clip[], timeMs: number): Clip | null {
    for (const clip of clips) {
      if (this.isTimeInRange(timeMs, clip.startTime, clip.startTime + clip.duration)) {
        return clip
      }
    }
    return null
  }

  /**
   * Get effects active at specific time
   */
  static getEffectsAtTime(effects: Effect[], timeMs: number): Effect[] {
    return effects.filter(effect => 
      effect.enabled && this.isTimeInRange(timeMs, effect.startTime, effect.endTime)
    )
  }
}
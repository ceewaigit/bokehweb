/**
 * Time Space Converter - Centralized utilities for converting between different time coordinate systems
 * 
 * THREE TIME COORDINATE SYSTEMS:
 * 
 * 1. SOURCE SPACE (Recording Metadata)
 *    - Original timestamps from recording (milliseconds from recording start)
 *    - Stored in recording.metadata.keyboardEvents/mouseEvents/etc
 *    - NEVER MODIFIED - this is the source of truth
 *    - Example: A keypress at 5000ms in the original recording
 * 
 * 2. TIMELINE SPACE (UI Position)
 *    - Position on the timeline UI that the user sees
 *    - Represents the actual playback time in the final video
 *    - Affected by clip position and playback rate
 *    - Example: A clip starting at timeline position 10000ms
 * 
 * 3. CLIP-RELATIVE SPACE (Internal Clip Time)
 *    - Time relative to the start of a clip
 *    - Accounts for playback rate and time remapping
 *    - Used for internal clip calculations
 *    - Example: 1000ms into a clip (regardless of where clip is on timeline)
 * 
 * CRITICAL RULES:
 * - Effects should ALWAYS use TIMELINE SPACE (when to show the effect in final video)
 * - Metadata should ALWAYS remain in SOURCE SPACE (original recording data)
 * - UI operations (split, trim) work in TIMELINE SPACE (what user sees)
 * - Internal clip operations use CLIP-RELATIVE SPACE
 */

import type { Clip } from '@/types/project'

/**
 * Convert source recording time to timeline position
 * @param sourceMs - Time in milliseconds from recording start (source space)
 * @param clip - The clip containing this source time
 * @returns Timeline position in milliseconds
 */
export function sourceToTimeline(sourceMs: number, clip: Clip): number {
  // First convert source to clip-relative
  const clipRelativeMs = sourceToClipRelative(sourceMs, clip)
  
  // Then add clip's position on timeline
  return clip.startTime + clipRelativeMs
}

/**
 * Convert timeline position to source recording time
 * @param timelineMs - Position on timeline in milliseconds
 * @param clip - The clip at this timeline position
 * @returns Source recording time in milliseconds
 */
export function timelineToSource(timelineMs: number, clip: Clip): number {
  // First get clip-relative time
  const clipRelativeMs = timelineMs - clip.startTime
  
  // Then convert to source
  return clipRelativeToSource(clipRelativeMs, clip)
}

/**
 * Convert source recording time to clip-relative time
 * This accounts for playback rate and time remapping
 * @param sourceMs - Time in milliseconds from recording start
 * @param clip - The clip to convert for
 * @returns Time relative to clip start in milliseconds
 */
export function sourceToClipRelative(sourceMs: number, clip: Clip): number {
  const playbackRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
  const sourceIn = clip.sourceIn || 0

  if (!isFinite(sourceMs)) {
    return 0
  }

  // Guard against timestamps before the clip starts
  if (sourceMs <= sourceIn) {
    return 0
  }

  // Guard against timestamps after the clip ends
  const sourceOut = clip.sourceOut || (sourceIn + clip.duration * playbackRate)
  if (sourceMs >= sourceOut) {
    return clip.duration
  }

  // Handle time remapping if present
  const rawPeriods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  // Fast path when no time remapping
  if (!rawPeriods) {
    return (sourceMs - sourceIn) / playbackRate
  }

  // Complex path with time remapping
  let playbackTime = 0
  let currentSource = sourceIn

  for (const period of rawPeriods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    // Handle gap before this period at base playback rate
    if (currentSource < periodStart) {
      if (sourceMs <= periodStart) {
        return playbackTime + Math.max(0, sourceMs - currentSource) / playbackRate
      }

      playbackTime += (periodStart - currentSource) / playbackRate
      currentSource = periodStart
    }

    // If timestamp falls within this period, map using period's speed
    if (sourceMs <= periodEnd) {
      return playbackTime + Math.max(0, sourceMs - currentSource) / Math.max(0.0001, period.speedMultiplier)
    }

    // Otherwise, consume entire period and continue
    playbackTime += (periodEnd - currentSource) / Math.max(0.0001, period.speedMultiplier)
    currentSource = periodEnd
  }

  // Remaining tail after last remap period
  if (sourceMs > currentSource) {
    playbackTime += (sourceMs - currentSource) / playbackRate
  }

  return playbackTime
}

/**
 * Convert clip-relative time to source recording time
 * Inverse of sourceToClipRelative
 * @param clipRelativeMs - Time relative to clip start in milliseconds
 * @param clip - The clip to convert for
 * @returns Source recording time in milliseconds
 */
export function clipRelativeToSource(clipRelativeMs: number, clip: Clip): number {
  const sourceIn = clip.sourceIn || 0
  const baseRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1

  // Handle time remapping if present
  const periods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  // Fast path when no time remapping
  if (!periods) {
    const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
    const clipDuration = clip.duration || 0

    // Use proportional mapping: map clip progress (0-1) to source range
    // This correctly handles clips with any playbackRate
    const sourceDuration = sourceOut - sourceIn
    const progress = clipDuration > 0 ? clipRelativeMs / clipDuration : 0
    const result = sourceIn + progress * sourceDuration
    const clamped = Math.max(sourceIn, Math.min(sourceOut, result))

    // DEBUG: Log time conversion calculation
    if (typeof window !== 'undefined' && (window as any).__SCREEN_STUDIO_DEBUG__) {
      console.log('🔍 [clipRelativeToSource] Fast Path (FIXED):', {
        clipRelativeMs: clipRelativeMs.toFixed(2),
        clipDuration,
        sourceIn,
        sourceOut,
        sourceDuration,
        progress: progress.toFixed(4),
        calculation: `${sourceIn} + ${progress.toFixed(4)} * ${sourceDuration} = ${result.toFixed(2)}`,
        clamped: clamped.toFixed(2),
        clipId: clip.id
      });
    }

    return clamped
  }

  // Complex path with time remapping
  let remainingTimeline = clipRelativeMs
  let currentSource = sourceIn

  for (const period of periods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    // Handle gap before this period
    if (currentSource < periodStart) {
      const gapDurationSource = periodStart - currentSource
      const gapTimelineDuration = gapDurationSource / baseRate

      if (remainingTimeline <= gapTimelineDuration) {
        const result = currentSource + remainingTimeline * baseRate
        const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
        return Math.max(sourceIn, Math.min(sourceOut, result))
      }

      remainingTimeline -= gapTimelineDuration
      currentSource = periodStart
    }

    // Handle this period
    const effectiveSpeed = Math.max(0.0001, period.speedMultiplier)
    const periodDurationSource = periodEnd - periodStart
    const periodTimelineDuration = periodDurationSource / effectiveSpeed

    if (remainingTimeline <= periodTimelineDuration) {
      const result = periodStart + remainingTimeline * effectiveSpeed
      const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
      return Math.max(sourceIn, Math.min(sourceOut, result))
    }

    remainingTimeline -= periodTimelineDuration
    currentSource = periodEnd
  }

  // Handle remaining tail
  const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
  const result = currentSource + remainingTimeline * baseRate
  return Math.max(sourceIn, Math.min(sourceOut, result))
}

/**
 * Convert timeline position to clip-relative time
 * @param timelineMs - Position on timeline in milliseconds
 * @param clip - The clip at this timeline position
 * @returns Time relative to clip start in milliseconds
 */
export function timelineToClipRelative(timelineMs: number, clip: Clip): number {
  const clipRelativeMs = timelineMs - clip.startTime
  
  // Clamp to clip bounds
  if (clipRelativeMs < 0) return 0
  if (clipRelativeMs > clip.duration) return clip.duration
  
  return clipRelativeMs
}

/**
 * Convert clip-relative time to timeline position
 * @param clipRelativeMs - Time relative to clip start in milliseconds
 * @param clip - The clip to convert for
 * @returns Timeline position in milliseconds
 */
export function clipRelativeToTimeline(clipRelativeMs: number, clip: Clip): number {
  return clip.startTime + clipRelativeMs
}

/**
 * Get the actual source duration accounting for playback rate
 * @param clip - The clip to get source duration for
 * @returns Source duration in milliseconds
 */
export function getSourceDuration(clip: Clip): number {
  const sourceIn = clip.sourceIn || 0
  const sourceOut = clip.sourceOut || 0
  
  if (sourceOut >= sourceIn) {
    return sourceOut - sourceIn
  }
  
  // Fallback: If sourceOut not set, assume current clip duration represents source
  const playbackRate = clip.playbackRate || 1
  return clip.duration * playbackRate
}

/**
 * Calculate effective timeline duration for a given playback rate
 * @param clip - The clip to calculate for
 * @param rate - Optional playback rate override
 * @returns Effective duration in milliseconds
 */
export function computeEffectiveDuration(clip: Clip, rate?: number): number {
  const playback = (rate != null ? rate : (clip.playbackRate ?? 1)) || 1
  const base = getSourceDuration(clip)
  const effective = base / playback
  return Math.max(1, Math.round(effective))
}

/**
 * Validate that a timeline position falls within a clip
 * @param timelineMs - Position on timeline
 * @param clip - The clip to check
 * @returns True if position is within clip bounds
 */
export function isTimelinePositionInClip(timelineMs: number, clip: Clip): boolean {
  return timelineMs >= clip.startTime && timelineMs < clip.startTime + clip.duration
}

/**
 * Validate that a source time falls within a clip's source range
 * @param sourceMs - Source recording time
 * @param clip - The clip to check
 * @returns True if source time is within clip's source range
 */
export function isSourceTimeInClip(sourceMs: number, clip: Clip): boolean {
  const sourceIn = clip.sourceIn || 0
  const sourceOut = clip.sourceOut || (sourceIn + getSourceDuration(clip))
  return sourceMs >= sourceIn && sourceMs <= sourceOut
}

/**
 * PIXEL CONVERSION FUNCTIONS
 * Convert between timeline time (ms) and UI pixel positions
 */

/**
 * Calculate pixels per millisecond for a given zoom level
 * @param stageWidth - Width of the timeline stage in pixels
 * @param zoom - Zoom level (1 = default, 2 = 2x zoom, etc)
 * @returns Pixels per millisecond
 */
export function calculatePixelsPerMs(stageWidth: number, zoom: number): number {
  const basePixelsPerMs = 0.1 // Base scale: 0.1 pixel per ms
  return basePixelsPerMs * zoom
}

/**
 * Calculate total timeline width based on duration and zoom
 * @param duration - Duration in milliseconds
 * @param pixelsPerMs - Pixels per millisecond (from calculatePixelsPerMs)
 * @param minWidth - Minimum width in pixels
 * @returns Total timeline width in pixels
 */
export function calculateTimelineWidth(duration: number, pixelsPerMs: number, minWidth: number): number {
  return Math.max(duration * pixelsPerMs, minWidth)
}

/**
 * Convert milliseconds to pixel position on timeline
 * @param timeMs - Time in milliseconds
 * @param pixelsPerMs - Pixels per millisecond
 * @returns Pixel position
 */
export function msToPixels(timeMs: number, pixelsPerMs: number): number {
  return timeMs * pixelsPerMs
}

/**
 * Convert pixel position to milliseconds on timeline
 * @param pixels - Pixel position
 * @param pixelsPerMs - Pixels per millisecond
 * @returns Time in milliseconds
 */
export function pixelsToMs(pixels: number, pixelsPerMs: number): number {
  return pixels / pixelsPerMs
}

/**
 * Calculate optimal zoom level for a given duration and viewport
 * @param duration - Duration in milliseconds
 * @param viewportWidth - Width of the viewport in pixels
 * @returns Optimal zoom level
 */
export function calculateOptimalZoom(duration: number, viewportWidth: number): number {
  if (duration === 0) return 1
  
  // We want the timeline to fit comfortably in the viewport
  // Leave some padding (80% of viewport)
  const targetWidth = viewportWidth * 0.8
  const basePixelsPerMs = 0.1
  
  // Calculate zoom needed to fit duration in target width
  const requiredZoom = targetWidth / (duration * basePixelsPerMs)
  
  // Clamp between reasonable zoom levels
  return Math.max(0.1, Math.min(10, requiredZoom))
}

/**
 * Get ruler intervals for timeline based on zoom level
 * @param zoom - Current zoom level
 * @returns Object with major and minor interval in milliseconds
 */
export function getRulerIntervals(zoom: number): { major: number; minor: number } {
  // Adjust intervals based on zoom level
  if (zoom < 0.5) {
    return { major: 10000, minor: 5000 } // 10s major, 5s minor
  } else if (zoom < 1) {
    return { major: 5000, minor: 1000 } // 5s major, 1s minor
  } else if (zoom < 2) {
    return { major: 1000, minor: 500 } // 1s major, 500ms minor
  } else if (zoom < 5) {
    return { major: 500, minor: 100 } // 500ms major, 100ms minor
  } else {
    return { major: 100, minor: 50 } // 100ms major, 50ms minor
  }
}

/**
 * TimeConverter namespace - groups all time conversion functions
 * Used for backward compatibility with existing imports
 */
export const TimeConverter = {
  // Time coordinate conversions
  sourceToTimeline,
  timelineToSource,
  sourceToClipRelative,
  clipRelativeToSource,
  timelineToClipRelative,
  clipRelativeToTimeline,
  getSourceDuration,
  computeEffectiveDuration,
  isTimelinePositionInClip,
  isSourceTimeInClip,
  
  // Pixel conversions
  calculatePixelsPerMs,
  calculateTimelineWidth,
  msToPixels,
  pixelsToMs,
  calculateOptimalZoom,
  getRulerIntervals
}

// Alias for backward compatibility
export const TimeSpaceConverter = TimeConverter
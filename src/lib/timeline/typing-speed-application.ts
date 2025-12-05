import type { Project, Track, Clip } from '@/types/project'
import { reflowClips, calculateTimelineDuration } from './timeline-operations'

/**
 * Service for applying typing speed suggestions to clips by splitting them
 * This creates separate clips for typing sections with increased playback rates
 */
export class TypingSpeedApplicationService {
  /**
   * Apply typing speed suggestions to a clip by using time remapping
   * This modifies the clip's playback speed variably without splitting it
   * Returns the affected clip and original state for undo
   * 
   * @param periods - Array of typing periods with at least startTime, endTime, and suggestedSpeedMultiplier
   */
  static applyTypingSpeedToClip(
    project: Project,
    clipId: string,
    periods: Array<Pick<import('./typing-detector').TypingPeriod, 'startTime' | 'endTime' | 'suggestedSpeedMultiplier'>>
  ): { affectedClips: string[]; originalClips: Clip[] } {
    const affectedClips: string[] = []
    const originalClips: Clip[] = []

    // Find the source clip and track
    let sourceClip: Clip | null = null
    let track: Track | null = null
    let clipIndex = -1

    for (const t of project.timeline.tracks) {
      const index = t.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        sourceClip = t.clips[index]
        track = t
        clipIndex = index
        break
      }
    }

    if (!sourceClip || !track) {
      console.error('applyTypingSpeedToClip: Clip not found:', clipId)
      return { affectedClips: [], originalClips: [] }
    }

    // Save original clip state for undo
    originalClips.push({ ...sourceClip })

    // Get clip's source range and base playback rate
    const sourceIn = sourceClip.sourceIn || 0
    const sourceOut = sourceClip.sourceOut || (sourceIn + sourceClip.duration * (sourceClip.playbackRate || 1))
    const baseRate = sourceClip.playbackRate || 1

    // Filter and sort periods within the clip's source range
    const validPeriods = periods
      .filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
      .map(p => ({
        start: Math.max(p.startTime, sourceIn),
        end: Math.min(p.endTime, sourceOut),
        speedMultiplier: p.suggestedSpeedMultiplier
      }))
      .sort((a, b) => a.start - b.start)

    if (validPeriods.length === 0) {
      return { affectedClips: [clipId], originalClips }
    }

    // Get FPS from project settings or default to 60
    const fps = project.settings.frameRate || 60
    const minDuration = 1000 / fps // Minimum duration is 1 frame

    // 1. Generate initial segments covering the entire source range
    interface Segment {
      start: number
      end: number
      speedMultiplier: number
    }

    const segments: Segment[] = []
    let currentPos = sourceIn

    for (const period of validPeriods) {
      // Add gap before typing period (normal speed)
      if (currentPos < period.start) {
        segments.push({
          start: currentPos,
          end: period.start,
          speedMultiplier: 1
        })
      }

      // Add typing period (sped up)
      segments.push({
        start: period.start,
        end: period.end,
        speedMultiplier: period.speedMultiplier
      })

      currentPos = period.end
    }

    // Add remaining portion after last typing period (normal speed)
    if (currentPos < sourceOut) {
      segments.push({
        start: currentPos,
        end: sourceOut,
        speedMultiplier: 1
      })
    }

    // 2. Merge small segments to prevent sub-frame clips
    // We iterate and merge any segment < minDuration into its neighbor
    const mergedSegments: Segment[] = []

    for (const segment of segments) {
      const duration = segment.end - segment.start

      if (duration < minDuration) {
        // Segment is too small. Merge it.
        if (mergedSegments.length > 0) {
          // Merge into previous segment
          const prev = mergedSegments[mergedSegments.length - 1]
          prev.end = segment.end
          // Note: We keep the speed of the previous segment. 
          // This effectively "eats" the small segment into the previous one.
        } else {
          // If it's the very first segment and too small, we can't merge backwards.
          // We'll add it for now, and hope the next one merges backwards into it?
          // Or we just drop it? No, dropping changes sourceIn.
          // We must keep it or merge forward.
          // Let's add it, but check next time.
          mergedSegments.push(segment)
        }
      } else {
        // Check if we can merge with previous if they have same speed
        if (mergedSegments.length > 0) {
          const prev = mergedSegments[mergedSegments.length - 1]
          if (prev.speedMultiplier === segment.speedMultiplier) {
            prev.end = segment.end
          } else {
            mergedSegments.push(segment)
          }
        } else {
          mergedSegments.push(segment)
        }
      }
    }

    // Final pass to catch any remaining tiny segments (like the first one if it was small)
    // If the first segment is still small and there's a second one, merge first into second.
    if (mergedSegments.length > 1 && (mergedSegments[0].end - mergedSegments[0].start) < minDuration) {
      const first = mergedSegments[0]
      const second = mergedSegments[1]
      second.start = first.start
      mergedSegments.shift()
    }

    // Remove the original clip
    track.clips.splice(clipIndex, 1)

    // 3. Create new clips from merged segments
    let timelinePosition = sourceClip.startTime
    const newClips: Clip[] = []

    for (let i = 0; i < mergedSegments.length; i++) {
      const segment = mergedSegments[i]
      const sourceDuration = segment.end - segment.start

      // Skip effectively zero length segments
      if (sourceDuration <= 0.001) continue

      // Apply speed directly to playbackRate
      const effectiveRate = baseRate * segment.speedMultiplier

      // Calculate duration based on combined speed
      // Use precise float division
      const clipDuration = sourceDuration / effectiveRate

      const newClip: Clip = {
        id: `${sourceClip.id}-part-${i}`,
        recordingId: sourceClip.recordingId,
        startTime: timelinePosition,
        duration: clipDuration,
        sourceIn: segment.start,
        sourceOut: segment.end,
        playbackRate: effectiveRate,
        // CRITICAL: Mark ALL segments as applied to prevent UI from showing suggestions again
        // This fixes the bug where suggestions bar persists on "Normal" segments
        typingSpeedApplied: true,
        timeRemapPeriods: []
      }

      newClips.push(newClip)
      affectedClips.push(newClip.id)
      timelinePosition += clipDuration
    }

    // Insert new clips at the original position
    track.clips.splice(clipIndex, 0, ...newClips)

    // Sort clips by start time to maintain order
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Always do full reflow to ensure all clips are contiguous
    reflowClips(track, 0, project)

    // Update timeline duration
    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()

    return { affectedClips, originalClips }
  }
}

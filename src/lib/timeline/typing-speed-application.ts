import type { Project, Track, Clip } from '@/types/project'
import { reflowClips, calculateTimelineDuration } from './timeline-operations'

/**
 * Service for applying typing speed suggestions to clips by splitting them
 * This creates separate clips for typing sections with increased playback rates
 */
export class TypingSpeedApplicationService {
  /**
   * Apply typing speed suggestions to a clip by splitting it into multiple clips
   * Each split clip has its playbackRate adjusted for the typing speed
   * Returns the affected clips and original state for undo
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

    // Create split points including typing periods and gaps
    const splitPoints: Array<{ start: number, end: number, speedMultiplier: number }> = []
    let currentPos = sourceIn

    for (const period of validPeriods) {
      // Add gap before typing period (normal speed)
      if (currentPos < period.start) {
        splitPoints.push({
          start: currentPos,
          end: period.start,
          speedMultiplier: 1
        })
      }

      // Add typing period (sped up)
      splitPoints.push({
        start: period.start,
        end: period.end,
        speedMultiplier: period.speedMultiplier
      })

      currentPos = period.end
    }

    // Add remaining portion after last typing period (normal speed)
    if (currentPos < sourceOut) {
      splitPoints.push({
        start: currentPos,
        end: sourceOut,
        speedMultiplier: 1
      })
    }

    // Remove the original clip
    track.clips.splice(clipIndex, 1)

    // Create new clips from split points
    let timelinePosition = sourceClip.startTime
    const newClips: Clip[] = []

    for (let i = 0; i < splitPoints.length; i++) {
      const split = splitPoints[i]
      const sourceDuration = split.end - split.start

      // Apply speed directly to playbackRate for consistency with manual speed changes
      const effectiveRate = baseRate * split.speedMultiplier

      // Calculate duration based on combined speed
      const clipDuration = sourceDuration / effectiveRate

      const newClip: Clip = {
        id: `${sourceClip.id}-split-${i}`,
        recordingId: sourceClip.recordingId,
        startTime: timelinePosition,
        duration: clipDuration,
        sourceIn: split.start,
        sourceOut: split.end,
        playbackRate: effectiveRate,  // Use actual speed multiplier so it's visible in UI
        typingSpeedApplied: split.speedMultiplier > 1
      }

      newClips.push(newClip)
      affectedClips.push(newClip.id)
      timelinePosition += clipDuration
    }

    // Insert new clips at the original position
    // Note: Effects are stored in source space on Recording, not affected by clip splits
    track.clips.splice(clipIndex, 0, ...newClips)

    // Sort clips by start time to maintain order
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Always do full reflow to ensure all clips are contiguous
    // This handles any rounding errors or duration mismatches automatically
    // and ensures gaps close as expected when clips become shorter due to speed-up
    reflowClips(track, 0, project)

    // Update timeline duration
    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()

    return { affectedClips, originalClips }
  }
}

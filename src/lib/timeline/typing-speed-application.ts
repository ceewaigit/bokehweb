import type { Project, Track, Clip } from '@/types/project'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { reflowClips, calculateTimelineDuration } from './timeline-operations'

const DEBUG_TYPING = process.env.NEXT_PUBLIC_ENABLE_TYPING_DEBUG === '1'

/**
 * Service for applying typing speed suggestions to clips by splitting them
 * This creates separate clips for typing sections with increased playback rates
 */
export class TypingSpeedApplicationService {
  /**
   * Apply typing speed suggestions to a clip using time remap periods
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

    if (DEBUG_TYPING) {
      console.log('[TypingApply] Applying typing speed with time remap', {
        clipId,
        periods: periods.map(p => ({
          start: p.startTime,
          end: p.endTime,
          rate: p.suggestedSpeedMultiplier
        }))
      })
    }

    // Get clip's source range and base playback rate
    const sourceIn = sourceClip.sourceIn || 0
    const sourceOut = sourceClip.sourceOut || (sourceIn + sourceClip.duration * (sourceClip.playbackRate || 1))
    const baseRate = sourceClip.playbackRate || 1

    // Filter and sort periods within the clip's source range
    const validPeriods = periods
      .filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
      .map(p => ({
        sourceStartTime: Math.max(p.startTime, sourceIn),
        sourceEndTime: Math.min(p.endTime, sourceOut),
        speedMultiplier: p.suggestedSpeedMultiplier
      }))
      .sort((a, b) => a.sourceStartTime - b.sourceStartTime)

    if (validPeriods.length === 0) {
      if (DEBUG_TYPING) {
        console.log('[TypingApply] No valid periods within clip range')
      }
      return { affectedClips: [clipId], originalClips }
    }

    // Create a modified clip with time remap periods
    const modifiedClip: Clip = {
      ...sourceClip,
      timeRemapPeriods: validPeriods,
      typingSpeedApplied: true
    }

    // Calculate new duration based on time remapping
    let newDuration = 0
    let currentPos = sourceIn

    for (const period of validPeriods) {
      // Add time before the period (normal speed)
      if (currentPos < period.sourceStartTime) {
        const gapDuration = period.sourceStartTime - currentPos
        newDuration += gapDuration / baseRate
      }

      // Add the period itself (sped up)
      const periodDuration = period.sourceEndTime - period.sourceStartTime
      newDuration += periodDuration / (baseRate * period.speedMultiplier)

      currentPos = period.sourceEndTime
    }

    // Add remaining time after last period (normal speed)
    if (currentPos < sourceOut) {
      const remainingDuration = sourceOut - currentPos
      newDuration += remainingDuration / baseRate
    }

    modifiedClip.duration = newDuration

    // Replace the original clip with the modified one
    track.clips[clipIndex] = modifiedClip
    affectedClips.push(modifiedClip.id)

    // Sort clips by start time to maintain order
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Reflow clips to ensure no gaps
    reflowClips(track, 0, project)

    if (DEBUG_TYPING) {
      console.log('[TypingApply] Time remap applied', {
        originalClipId: sourceClip.id,
        periodsCount: validPeriods.length,
        newDuration,
        affectedClips
      })
    }

    // Remove applied typing periods from the recording's metadata
    const recording = project.recordings.find(r => r.id === sourceClip.recordingId)
    if (recording && recording.metadata?.keyboardEvents) {
      recording.metadata.keyboardEvents = recording.metadata.keyboardEvents.filter(event => {
        const isInAppliedPeriod = periods.some(period =>
          event.timestamp >= period.startTime && event.timestamp <= period.endTime
        )
        return !isInAppliedPeriod
      })

      RecordingStorage.setMetadata(recording.id, recording.metadata)
    }

    // Update timeline duration
    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()

    return { affectedClips, originalClips }
  }
}

import type { Project, Track, Clip, TimeRemapPeriod } from '@/types/project'
import { reflowClips, calculateTimelineDuration } from './timeline-operations'

/**
 * Service for applying typing speed suggestions to clips using time remapping
 * This replaces the old splitting logic with a cleaner time remap approach
 */
export class TypingSpeedApplicationService {
  /**
   * Apply typing speed suggestions to a clip using time remapping
   * Returns the affected clips and original state for undo
   * 
   * @param periods - Array of typing periods with at least startTime, endTime, and suggestedSpeedMultiplier
   */
  static applyTypingSpeedToClip(
    project: Project,
    clipId: string,
    periods: Array<Pick<import('./typing-detector').TypingPeriod, 'startTime' | 'endTime' | 'suggestedSpeedMultiplier'>>
  ): { affectedClips: string[]; originalClips: Clip[] } {
    const affectedClips: string[] = [clipId]
    const originalClips: Clip[] = []

    // Find the source clip and track
    let sourceClip: Clip | null = null
    let track: Track | null = null
    for (const t of project.timeline.tracks) {
      const clip = t.clips.find(c => c.id === clipId)
      if (clip) {
        sourceClip = clip
        track = t
        break
      }
    }

    if (!sourceClip || !track) {
      console.error('applyTypingSpeedToClip: Clip not found:', clipId)
      return { affectedClips: [], originalClips: [] }
    }

    // Save original clip state for undo
    originalClips.push({ ...sourceClip })

    console.log('[TypingApply] Applying typing speed as time remap', {
      clipId,
      periods: periods.map(p => ({ 
        start: p.startTime, 
        end: p.endTime, 
        rate: p.suggestedSpeedMultiplier 
      }))
    })

    // Convert periods to TimeRemapPeriod format
    const timeRemapPeriods: TimeRemapPeriod[] = periods.map(p => ({
      sourceStartTime: p.startTime,
      sourceEndTime: p.endTime,
      speedMultiplier: p.suggestedSpeedMultiplier
    }))
    
    // Sort periods by start time
    timeRemapPeriods.sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    
    // Store the periods on the clip
    sourceClip.timeRemapPeriods = timeRemapPeriods
    sourceClip.typingSpeedApplied = true
    
    // Calculate new duration based on time remapping
    const newDuration = this.calculateRemappedDuration(sourceClip, timeRemapPeriods)
    const oldDuration = sourceClip.duration
    sourceClip.duration = newDuration
    
    // Reflow clips after duration change
    reflowClips(track, 0, project)
    
    console.log('[TypingApply] Time remap applied', {
      clipId: sourceClip.id,
      oldDuration,
      newDuration,
      periods: sourceClip.timeRemapPeriods
    })
    
    // Remove applied typing periods from the recording's metadata
    const recording = project.recordings.find(r => r.id === sourceClip.recordingId)
    if (recording && recording.metadata?.keyboardEvents) {
      recording.metadata.keyboardEvents = recording.metadata.keyboardEvents.filter(event => {
        const isInAppliedPeriod = periods.some(period => 
          event.timestamp >= period.startTime && event.timestamp <= period.endTime
        )
        return !isInAppliedPeriod
      })
    }
    
    // Update timeline duration
    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()
    
    return { affectedClips, originalClips }
  }

  /**
   * Calculate the new duration for a clip with time remapping
   */
  private static calculateRemappedDuration(
    clip: Clip,
    timeRemapPeriods: TimeRemapPeriod[]
  ): number {
    const sourceIn = clip.sourceIn || 0
    const sourceOut = clip.sourceOut || (sourceIn + clip.duration)
    const baseRate = clip.playbackRate || 1
    let totalDuration = 0
    let currentPos = sourceIn
    
    for (const period of timeRemapPeriods) {
      // Handle time before this period
      if (currentPos < period.sourceStartTime) {
        const gapDuration = Math.min(period.sourceStartTime - currentPos, sourceOut - currentPos)
        totalDuration += gapDuration / baseRate
        currentPos += gapDuration
      }
      
      // Handle time within this period
      if (currentPos < sourceOut && currentPos < period.sourceEndTime) {
        const periodStart = Math.max(currentPos, period.sourceStartTime)
        const periodEnd = Math.min(period.sourceEndTime, sourceOut)
        const periodDuration = periodEnd - periodStart
        totalDuration += periodDuration / period.speedMultiplier
        currentPos = periodEnd
      }
    }
    
    // Handle any remaining time after all periods
    if (currentPos < sourceOut) {
      totalDuration += (sourceOut - currentPos) / baseRate
    }
    
    return totalDuration
  }
}
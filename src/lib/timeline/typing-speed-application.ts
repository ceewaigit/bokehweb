import type { Project, Track, Clip, Effect } from '@/types/project'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { reflowClips, calculateTimelineDuration } from './timeline-operations'

const DEBUG_TYPING = process.env.NEXT_PUBLIC_ENABLE_TYPING_DEBUG === '1'

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

    if (DEBUG_TYPING) {
      console.log('[TypingApply] Starting typing speed application', {
        clipId,
        clipSourceRange: { sourceIn, sourceOut },
        clipDuration: sourceClip.duration,
        clipPlaybackRate: baseRate,
        periodsReceived: periods.map(p => ({
          start: p.startTime,
          end: p.endTime,
          rate: p.suggestedSpeedMultiplier
        }))
      })
    }

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
      if (DEBUG_TYPING) {
        console.log('[TypingApply] No valid periods within clip range', {
          clipSourceRange: { sourceIn, sourceOut },
          periodsFiltered: periods.filter(p => p.endTime > sourceIn && p.startTime < sourceOut)
        })
      }
      return { affectedClips: [clipId], originalClips }
    }
    
    if (DEBUG_TYPING) {
      console.log('[TypingApply] Valid periods after filtering', {
        validPeriods,
        clipSourceRange: { sourceIn, sourceOut }
      })
    }

    // Create split points including typing periods and gaps
    const splitPoints: Array<{start: number, end: number, speedMultiplier: number}> = []
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
    track.clips.splice(clipIndex, 0, ...newClips)

    // Sort clips by start time to maintain order
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Reflow only clips after the inserted ones to preserve timeline position
    // Find the index of the last new clip after sorting
    const lastNewClipIndex = track.clips.findIndex(c => c.id === newClips[newClips.length - 1].id)
    if (lastNewClipIndex !== -1 && lastNewClipIndex < track.clips.length - 1) {
      reflowClips(track, lastNewClipIndex + 1, project)
    }

    if (DEBUG_TYPING) {
      console.log('[TypingApply] Clip split complete', {
        originalClip: {
          id: sourceClip.id,
          startTime: sourceClip.startTime,
          duration: sourceClip.duration,
          sourceIn: sourceClip.sourceIn,
          sourceOut: sourceClip.sourceOut,
          playbackRate: sourceClip.playbackRate
        },
        splitPoints,
        newClips: newClips.map(c => ({
          id: c.id,
          startTime: c.startTime,
          duration: c.duration,
          sourceIn: c.sourceIn,
          sourceOut: c.sourceOut,
          playbackRate: c.playbackRate,
          typingSpeedApplied: c.typingSpeedApplied
        })),
        totalNewDuration: newClips.reduce((sum, c) => sum + c.duration, 0)
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

    // Adjust effects for the split clips
    adjustEffectsForSplitClips(project, sourceClip, newClips)

    // Update timeline duration
    project.timeline.duration = calculateTimelineDuration(project)
    project.modifiedAt = new Date().toISOString()

    return { affectedClips, originalClips }
  }
}

/**
 * Adjusts effects when a clip is split into multiple clips
 * Effects need to be adjusted to match the new clip boundaries and timing
 */
function adjustEffectsForSplitClips(
  project: Project,
  originalClip: Clip,
  newClips: Clip[]
): void {
  if (!project.timeline.effects || project.timeline.effects.length === 0) {
    return
  }

  const originalStart = originalClip.startTime
  const originalEnd = originalClip.startTime + originalClip.duration

  // Find all effects that overlap with the original clip
  const overlappingEffects = project.timeline.effects.filter(effect =>
    effect.startTime < originalEnd && effect.endTime > originalStart
  )

  if (overlappingEffects.length === 0) {
    return
  }

  if (DEBUG_TYPING) {
    console.log('[TypingApply] Adjusting effects for split clips', {
      originalClip: { id: originalClip.id, start: originalStart, end: originalEnd },
      newClips: newClips.map(c => ({ id: c.id, start: c.startTime, end: c.startTime + c.duration })),
      overlappingEffects: overlappingEffects.length
    })
  }

  const effectsToRemove: string[] = []
  const effectsToAdd: Effect[] = []

  for (const effect of overlappingEffects) {
    // Calculate the source-space position of this effect relative to the original clip
    const effectSourceStart = originalClip.sourceIn + 
      ((effect.startTime - originalStart) / originalClip.duration) * 
      (originalClip.sourceOut - originalClip.sourceIn)
    
    const effectSourceEnd = originalClip.sourceIn + 
      ((effect.endTime - originalStart) / originalClip.duration) * 
      (originalClip.sourceOut - originalClip.sourceIn)

    // Mark original effect for removal
    effectsToRemove.push(effect.id)

    // Create adjusted effects for each new clip that the effect overlaps
    for (const newClip of newClips) {
      // Check if this effect overlaps with this new clip in source space
      if (effectSourceEnd <= newClip.sourceIn || effectSourceStart >= newClip.sourceOut) {
        continue // No overlap in source space
      }

      // Calculate the portion of the effect that belongs to this clip
      const clippedSourceStart = Math.max(effectSourceStart, newClip.sourceIn)
      const clippedSourceEnd = Math.min(effectSourceEnd, newClip.sourceOut)

      // Convert back to timeline space for this new clip
      const relativeStart = (clippedSourceStart - newClip.sourceIn) / (newClip.sourceOut - newClip.sourceIn)
      const relativeEnd = (clippedSourceEnd - newClip.sourceIn) / (newClip.sourceOut - newClip.sourceIn)

      const newEffectStart = newClip.startTime + (relativeStart * newClip.duration)
      const newEffectEnd = newClip.startTime + (relativeEnd * newClip.duration)

      // Create a new effect for this clip
      const adjustedEffect: Effect = {
        ...effect,
        id: `${effect.id}-${newClip.id}`,
        startTime: newEffectStart,
        endTime: newEffectEnd
      }

      effectsToAdd.push(adjustedEffect)

      if (DEBUG_TYPING) {
        console.log('[TypingApply] Created adjusted effect', {
          originalEffect: { id: effect.id, start: effect.startTime, end: effect.endTime },
          newClip: { id: newClip.id, sourceIn: newClip.sourceIn, sourceOut: newClip.sourceOut },
          adjustedEffect: { id: adjustedEffect.id, start: adjustedEffect.startTime, end: adjustedEffect.endTime }
        })
      }
    }
  }

  // Remove original effects
  project.timeline.effects = project.timeline.effects.filter(e => !effectsToRemove.includes(e.id))

  // Add adjusted effects
  project.timeline.effects.push(...effectsToAdd)

  if (DEBUG_TYPING) {
    console.log('[TypingApply] Effects adjustment complete', {
      removed: effectsToRemove.length,
      added: effectsToAdd.length,
      totalEffects: project.timeline.effects.length
    })
  }
}

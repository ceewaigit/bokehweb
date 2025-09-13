import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip, Project, Track, Effect } from '@/types/project'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'
import { computeEffectiveDuration } from '@/lib/timeline/clip-utils'

interface ClipState {
  id: string
  startTime: number
  duration: number
  sourceIn: number
  sourceOut: number
  playbackRate?: number
}

interface EffectState {
  id: string
  startTime: number
  endTime: number
}

export class ApplyTypingSpeedCommand extends Command<{ 
  clipIds: string[]
  speeds: number[]
  affectedEffects: string[]
}> {
  private originalClips: Map<string, ClipState> = new Map()
  private originalEffects: Map<string, EffectState> = new Map()
  private clipSpeedMap: Map<string, number> = new Map()

  constructor(
    private context: CommandContext,
    private sourceClipId: string,
    private periods: TypingPeriod[],
    private applyAll: boolean = false
  ) {
    super({
      name: 'ApplyTypingSpeed',
      description: applyAll 
        ? `Apply ${periods.length} typing speed suggestions`
        : 'Apply typing speed suggestion',
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.sourceClipId)
    return !!result && this.periods.length > 0
  }

  doExecute(): CommandResult<{ clipIds: string[]; speeds: number[]; affectedEffects: string[] }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const sourceResult = this.context.findClip(this.sourceClipId)
    if (!sourceResult) {
      return { success: false, error: `Source clip ${this.sourceClipId} not found` }
    }

    const { clip: sourceClip, track } = sourceResult
    const appliedClipIds: string[] = []
    const appliedSpeeds: number[] = []
    const affectedEffectIds: string[] = []

    // Map typing periods to timeline positions
    const rate = sourceClip.playbackRate || 1
    const sourceIn = sourceClip.sourceIn || 0
    
    const timelineBounds = this.periods.map(p => {
      const periodStartInClip = (p.startTime - sourceIn) / rate
      const periodEndInClip = (p.endTime - sourceIn) / rate
      
      const absStart = sourceClip.startTime + Math.max(0, periodStartInClip)
      const absEnd = sourceClip.startTime + Math.min(sourceClip.duration, periodEndInClip)
      
      return {
        startAbs: absStart,
        endAbs: absEnd,
        speed: p.suggestedSpeedMultiplier,
        period: p
      }
    }).filter(b => b.endAbs > b.startAbs)

    if (timelineBounds.length === 0) {
      return { success: false, error: 'No valid typing periods found within clip bounds' }
    }

    // Store original clips that will be affected
    const originalTrack = project.timeline.tracks.find(t => 
      t.clips.some(c => c.recordingId === sourceClip.recordingId)
    )
    if (originalTrack) {
      // Store all clips from this recording for undo
      originalTrack.clips
        .filter(c => c.recordingId === sourceClip.recordingId)
        .forEach(c => this.storeOriginalClipState(c))
    }

    // Collect all unique split points and sort them
    const splitTimesSet = new Set<number>()
    for (const bound of timelineBounds) {
      // Only add split points that are within the original clip bounds
      if (bound.startAbs > sourceClip.startTime && bound.startAbs < sourceClip.startTime + sourceClip.duration) {
        splitTimesSet.add(bound.startAbs)
      }
      if (bound.endAbs > sourceClip.startTime && bound.endAbs < sourceClip.startTime + sourceClip.duration) {
        splitTimesSet.add(bound.endAbs)
      }
    }
    
    const sortedSplitTimes = Array.from(splitTimesSet).sort((a, b) => a - b)

    // Perform splits from left to right
    const splitClipIds = new Set<string>() // Track which clips we've already split
    
    for (const splitTime of sortedSplitTimes) {
      // Re-fetch project state after each split to get updated clip IDs
      const currentProject = store.currentProject
      if (!currentProject) continue
      
      const currentTrack = currentProject.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!currentTrack) continue
      
      // Find the clip that contains this split time
      const clipToSplit = currentTrack.clips.find(c => 
        c.recordingId === sourceClip.recordingId &&
        splitTime > c.startTime && 
        splitTime < c.startTime + c.duration &&
        !splitClipIds.has(c.id) // Don't try to split the same clip twice
      )
      
      if (clipToSplit) {
        splitClipIds.add(clipToSplit.id)
        try {
          store.splitClip(clipToSplit.id, splitTime)
        } catch (error) {
          // If split fails, continue with other splits
          console.warn(`Failed to split clip ${clipToSplit.id} at ${splitTime}:`, error)
        }
      }
    }

    // Re-fetch project after all splits
    const projectAfterSplits = store.currentProject
    if (!projectAfterSplits) {
      return { success: false, error: 'Project not found after splits' }
    }
    
    // Find all segments and determine which need speed changes
    const updatedTrack = projectAfterSplits.timeline.tracks.find(t => 
      t.clips.some(c => c.recordingId === sourceClip.recordingId)
    )
    if (!updatedTrack) {
      return { success: false, error: 'Track not found after splits' }
    }

    // Map segments to their target speeds
    const segmentSpeeds = new Map<string, number>()
    for (const bound of timelineBounds) {
      // Find clips that overlap with this typing period
      const segments = updatedTrack.clips.filter(c => {
        if (c.recordingId !== sourceClip.recordingId) return false
        const clipEnd = c.startTime + c.duration
        // Check if clip is within or overlaps with the typing period
        const overlaps = (
          (c.startTime >= bound.startAbs - 1 && c.startTime < bound.endAbs + 1) ||
          (clipEnd > bound.startAbs - 1 && clipEnd <= bound.endAbs + 1) ||
          (c.startTime <= bound.startAbs && clipEnd >= bound.endAbs)
        )
        return overlaps
      })
      
      for (const segment of segments) {
        const currentSpeed = segmentSpeeds.get(segment.id)
        segmentSpeeds.set(segment.id, currentSpeed ? Math.max(currentSpeed, bound.speed) : bound.speed)
      }
    }

    // Apply speeds from left to right, tracking cumulative shift
    let cumulativeShift = 0
    const sortedSegments = Array.from(segmentSpeeds.entries())
      .sort((a, b) => {
        const clipA = updatedTrack.clips.find(c => c.id === a[0])!
        const clipB = updatedTrack.clips.find(c => c.id === b[0])!
        return clipA.startTime - clipB.startTime
      })

    for (const [clipId, speed] of sortedSegments) {
      const clip = updatedTrack.clips.find(c => c.id === clipId)
      if (!clip) continue

      // Store original state only if not already stored
      if (!this.originalClips.has(clipId)) {
        this.storeOriginalClipState(clip)
      }
      this.clipSpeedMap.set(clipId, speed)

      const oldDuration = clip.duration
      const newDuration = computeEffectiveDuration(clip, speed)
      const durationDelta = newDuration - oldDuration

      // Apply the speed change
      store.updateClip(clipId, { 
        playbackRate: speed, 
        duration: newDuration 
      }, { exact: true })

      appliedClipIds.push(clipId)
      appliedSpeeds.push(speed)

      // Track cumulative shift for effects
      if (durationDelta !== 0) {
        const clipEnd = clip.startTime + oldDuration
        // Store and shift effects that come after this clip
        this.shiftEffectsAfter(project, clipEnd, durationDelta, affectedEffectIds)
        cumulativeShift += durationDelta
      }
    }

    return {
      success: true,
      data: {
        clipIds: appliedClipIds,
        speeds: appliedSpeeds,
        affectedEffects: affectedEffectIds
      }
    }
  }

  doUndo(): CommandResult<{ clipIds: string[]; speeds: number[]; affectedEffects: string[] }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    // Restore clips in reverse order (right to left)
    const sortedClips = Array.from(this.originalClips.entries())
      .sort((a, b) => b[1].startTime - a[1].startTime)

    for (const [clipId, originalState] of sortedClips) {
      const track = project.timeline.tracks.find(t => 
        t.clips.some(c => c.id === clipId)
      )
      if (!track) continue

      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        // Restore original clip state
        store.updateClip(clipId, {
          startTime: originalState.startTime,
          duration: originalState.duration,
          sourceIn: originalState.sourceIn,
          sourceOut: originalState.sourceOut,
          playbackRate: originalState.playbackRate || 1
        }, { exact: true })
      }
    }

    // Restore effects
    for (const [effectId, originalState] of this.originalEffects.entries()) {
      const effect = project.timeline.effects?.find(e => e.id === effectId)
      if (effect) {
        store.updateEffect(effectId, {
          startTime: originalState.startTime,
          endTime: originalState.endTime
        })
      }
    }

    return {
      success: true,
      data: {
        clipIds: Array.from(this.originalClips.keys()),
        speeds: Array.from(this.originalClips.values()).map(c => c.playbackRate || 1),
        affectedEffects: Array.from(this.originalEffects.keys())
      }
    }
  }

  doRedo(): CommandResult<{ clipIds: string[]; speeds: number[]; affectedEffects: string[] }> {
    // Clear stored states to recapture them
    this.originalClips.clear()
    this.originalEffects.clear()
    return this.doExecute()
  }

  private storeOriginalClipState(clip: Clip): void {
    if (!this.originalClips.has(clip.id)) {
      this.originalClips.set(clip.id, {
        id: clip.id,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        playbackRate: clip.playbackRate
      })
    }
  }

  private shiftEffectsAfter(project: Project, afterTime: number, delta: number, affectedIds: string[]): void {
    if (!project.timeline.effects || delta === 0) return
    
    const store = this.context.getStore()
    
    for (const effect of project.timeline.effects) {
      if (effect.type === 'background') continue // Skip background effects
      
      if (effect.startTime >= afterTime) {
        // Store original state
        if (!this.originalEffects.has(effect.id)) {
          this.originalEffects.set(effect.id, {
            id: effect.id,
            startTime: effect.startTime,
            endTime: effect.endTime
          })
        }
        
        // Shift the effect using store's updateEffect method
        store.updateEffect(effect.id, {
          startTime: effect.startTime + delta,
          endTime: effect.endTime + delta
        })
        affectedIds.push(effect.id)
      }
    }
  }
}
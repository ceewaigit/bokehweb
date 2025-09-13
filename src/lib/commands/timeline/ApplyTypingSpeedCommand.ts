import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'
import { computeEffectiveDuration } from '@/lib/timeline/clip-utils'

interface ClipSnapshot {
  id: string
  startTime: number
  duration: number
  sourceIn: number
  sourceOut: number
  playbackRate?: number
}

export class ApplyTypingSpeedCommand extends Command<{ 
  applied: number // number of clips affected
}> {
  private originalClips: ClipSnapshot[] = []
  private affectedClipIds: string[] = []

  constructor(
    private context: CommandContext,
    private sourceClipId: string,
    private periods: TypingPeriod[]
  ) {
    super({
      name: 'ApplyTypingSpeed',
      description: `Apply ${periods.length} typing speed suggestion${periods.length > 1 ? 's' : ''}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.sourceClipId)
    return !!result && this.periods.length > 0
  }

  doExecute(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    let project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const sourceResult = this.context.findClip(this.sourceClipId)
    if (!sourceResult) {
      return { success: false, error: `Clip ${this.sourceClipId} not found` }
    }

    const { clip: sourceClip } = sourceResult
    
    // Save the original state of the source clip
    this.saveClipState(sourceClip)
    
    let appliedCount = 0

    // Process each typing period
    for (const period of this.periods) {
      // Re-fetch project state for each period
      project = store.currentProject
      if (!project) continue
      
      // Find the current state of our clip (it may have been split)
      const track = project.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!track) continue

      // Map the typing period to timeline coordinates
      const rate = sourceClip.playbackRate || 1
      const sourceIn = sourceClip.sourceIn || 0
      
      // Calculate where in the timeline these source times map to
      const periodStartInClip = (period.startTime - sourceIn) / rate
      const periodEndInClip = (period.endTime - sourceIn) / rate
      
      // Convert to absolute timeline positions
      const absStart = sourceClip.startTime + Math.max(0, periodStartInClip)
      const absEnd = sourceClip.startTime + Math.min(sourceClip.duration, periodEndInClip)
      
      if (absEnd <= absStart) continue

      // Find all clips that need to be processed for this period
      const clipsToProcess = track.clips.filter(c => {
        if (c.recordingId !== sourceClip.recordingId) return false
        const clipEnd = c.startTime + c.duration
        // Check if clip overlaps with the typing period
        return (c.startTime < absEnd && clipEnd > absStart)
      })

      // Process each clip that overlaps with the typing period
      for (const clip of clipsToProcess) {
        const clipEnd = clip.startTime + clip.duration
        
        // Determine if we need to split this clip
        const needsSplitAtStart = absStart > clip.startTime && absStart < clipEnd
        const needsSplitAtEnd = absEnd > clip.startTime && absEnd < clipEnd
        
        // Save the clip state before any modifications
        this.saveClipState(clip)
        
        if (needsSplitAtStart && needsSplitAtEnd) {
          // Need to split twice - the typing period is in the middle of this clip
          store.splitClip(clip.id, absStart)
          
          // After first split, find the right-side clip and split it at the end
          const updatedProject = store.currentProject
          if (updatedProject) {
            const updatedTrack = updatedProject.timeline.tracks.find(t => 
              t.clips.some(c => c.recordingId === sourceClip.recordingId)
            )
            if (updatedTrack) {
              const rightClip = updatedTrack.clips.find(c => 
                c.recordingId === sourceClip.recordingId &&
                c.startTime >= absStart &&
                absEnd > c.startTime && 
                absEnd < c.startTime + c.duration
              )
              if (rightClip) {
                store.splitClip(rightClip.id, absEnd)
              }
            }
          }
        } else if (needsSplitAtStart) {
          // Only need to split at the start
          store.splitClip(clip.id, absStart)
        } else if (needsSplitAtEnd) {
          // Only need to split at the end
          store.splitClip(clip.id, absEnd)
        }
      }

      // Now apply speed to clips that are fully within the typing period
      project = store.currentProject
      if (!project) continue
      
      const updatedTrack = project.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!updatedTrack) continue

      const clipsToSpeedUp = updatedTrack.clips.filter(c => {
        if (c.recordingId !== sourceClip.recordingId) return false
        const clipEnd = c.startTime + c.duration
        // Check if clip is fully within the typing period (with small tolerance)
        return c.startTime >= absStart - 0.1 && clipEnd <= absEnd + 0.1
      })

      for (const targetClip of clipsToSpeedUp) {
        const newDuration = computeEffectiveDuration(targetClip, period.suggestedSpeedMultiplier)
        store.updateClip(targetClip.id, { 
          playbackRate: period.suggestedSpeedMultiplier, 
          duration: newDuration 
        })
        
        if (!this.affectedClipIds.includes(targetClip.id)) {
          this.affectedClipIds.push(targetClip.id)
        }
        appliedCount++
      }
    }

    return {
      success: true,
      data: { applied: appliedCount }
    }
  }

  doUndo(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    // First, remove all split clips that weren't in the original state
    const originalClipIds = this.originalClips.map(c => c.id)
    
    // Find and remove clips that were created by splits
    for (const track of project.timeline.tracks) {
      const clipsToRemove = track.clips.filter(c => 
        this.affectedClipIds.some(id => c.id.includes(id)) && 
        !originalClipIds.includes(c.id)
      )
      for (const clip of clipsToRemove) {
        store.removeClip(clip.id)
      }
    }

    // Restore original clips
    for (const snapshot of this.originalClips) {
      // Check if clip still exists
      const exists = project.timeline.tracks.some(t => 
        t.clips.some(c => c.id === snapshot.id)
      )
      
      if (!exists) {
        // Re-add the clip if it was removed
        const track = project.timeline.tracks.find(t => 
          t.clips.some(c => c.recordingId === this.sourceClipId.split('-')[0])
        )
        if (track) {
          store.addClip({
            id: snapshot.id,
            recordingId: this.sourceClipId.split('-')[0],
            startTime: snapshot.startTime,
            duration: snapshot.duration,
            sourceIn: snapshot.sourceIn,
            sourceOut: snapshot.sourceOut,
            playbackRate: snapshot.playbackRate
          } as Clip, snapshot.startTime)
        }
      } else {
        // Update existing clip
        store.updateClip(snapshot.id, {
          startTime: snapshot.startTime,
          duration: snapshot.duration,
          sourceIn: snapshot.sourceIn,
          sourceOut: snapshot.sourceOut,
          playbackRate: snapshot.playbackRate || 1
        }, { exact: true })
      }
    }

    return {
      success: true,
      data: { applied: 0 }
    }
  }

  doRedo(): CommandResult<{ applied: number }> {
    // Clear saved states and re-execute
    this.originalClips = []
    this.affectedClipIds = []
    return this.doExecute()
  }

  private saveClipState(clip: Clip): void {
    // Only save if we haven't saved this clip already
    if (!this.originalClips.some(s => s.id === clip.id)) {
      this.originalClips.push({
        id: clip.id,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        playbackRate: clip.playbackRate
      })
    }
  }
}
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
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const sourceResult = this.context.findClip(this.sourceClipId)
    if (!sourceResult) {
      return { success: false, error: `Clip ${this.sourceClipId} not found` }
    }

    const { clip: sourceClip, track } = sourceResult
    
    // Save the original state of all clips from this recording
    for (const clip of track.clips) {
      if (clip.recordingId === sourceClip.recordingId) {
        this.saveClipState(clip)
      }
    }
    
    // Collect all unique split points across all periods
    const splitPoints = new Set<number>()
    
    for (const period of this.periods) {
      // Map the typing period to timeline coordinates
      const rate = sourceClip.playbackRate || 1
      const sourceIn = sourceClip.sourceIn || 0
      
      const periodStartInClip = (period.startTime - sourceIn) / rate
      const periodEndInClip = (period.endTime - sourceIn) / rate
      
      const absStart = sourceClip.startTime + Math.max(0, periodStartInClip)
      const absEnd = sourceClip.startTime + Math.min(sourceClip.duration, periodEndInClip)
      
      if (absEnd <= absStart) continue
      
      // Add split points if they're within the clip bounds
      if (absStart > sourceClip.startTime && absStart < sourceClip.startTime + sourceClip.duration) {
        splitPoints.add(absStart)
      }
      if (absEnd > sourceClip.startTime && absEnd < sourceClip.startTime + sourceClip.duration) {
        splitPoints.add(absEnd)
      }
    }
    
    // Sort split points from left to right
    const sortedSplitPoints = Array.from(splitPoints).sort((a, b) => a - b)
    
    // Apply all splits
    for (const splitPoint of sortedSplitPoints) {
      // Get fresh project state
      const currentProject = store.currentProject
      if (!currentProject) continue
      
      // Find the track containing our clips
      const currentTrack = currentProject.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!currentTrack) continue
      
      // Find the clip that contains this split point
      const clipToSplit = currentTrack.clips.find(c => 
        c.recordingId === sourceClip.recordingId &&
        splitPoint > c.startTime &&
        splitPoint < c.startTime + c.duration
      )
      
      if (clipToSplit) {
        store.splitClip(clipToSplit.id, splitPoint)
      }
    }
    
    // Now apply speed changes to the appropriate segments
    let appliedCount = 0
    
    for (const period of this.periods) {
      // Get fresh project state
      const currentProject = store.currentProject
      if (!currentProject) continue
      
      const currentTrack = currentProject.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!currentTrack) continue
      
      // Map the typing period to timeline coordinates
      const rate = sourceClip.playbackRate || 1
      const sourceIn = sourceClip.sourceIn || 0
      
      const periodStartInClip = (period.startTime - sourceIn) / rate
      const periodEndInClip = (period.endTime - sourceIn) / rate
      
      const absStart = sourceClip.startTime + Math.max(0, periodStartInClip)
      const absEnd = sourceClip.startTime + Math.min(sourceClip.duration, periodEndInClip)
      
      if (absEnd <= absStart) continue
      
      // Find clips that are fully within this typing period
      const clipsToSpeedUp = currentTrack.clips.filter(c => {
        if (c.recordingId !== sourceClip.recordingId) return false
        const clipEnd = c.startTime + c.duration
        // Check if clip is fully within the typing period (with tolerance)
        return c.startTime >= absStart - 0.1 && clipEnd <= absEnd + 0.1
      })
      
      // Apply speed to each clip
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
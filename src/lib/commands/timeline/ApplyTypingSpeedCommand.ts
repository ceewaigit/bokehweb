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

    const { clip: sourceClip } = sourceResult
    let appliedCount = 0

    // Process each typing period
    for (const period of this.periods) {
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

      // Step 1: Split at the start if needed
      let currentProject = store.currentProject
      if (!currentProject) continue

      if (absStart > sourceClip.startTime) {
        // Find clip at this position
        const track = currentProject.timeline.tracks.find(t => 
          t.clips.some(c => c.recordingId === sourceClip.recordingId)
        )
        if (track) {
          const clipToSplit = track.clips.find(c => 
            c.recordingId === sourceClip.recordingId &&
            absStart > c.startTime && 
            absStart < c.startTime + c.duration
          )
          if (clipToSplit) {
            // Save original state before split
            this.saveClipState(clipToSplit)
            store.splitClip(clipToSplit.id, absStart)
          }
        }
      }

      // Step 2: Split at the end if needed
      currentProject = store.currentProject
      if (!currentProject) continue

      if (absEnd < sourceClip.startTime + sourceClip.duration) {
        const track = currentProject.timeline.tracks.find(t => 
          t.clips.some(c => c.recordingId === sourceClip.recordingId)
        )
        if (track) {
          const clipToSplit = track.clips.find(c => 
            c.recordingId === sourceClip.recordingId &&
            absEnd > c.startTime && 
            absEnd < c.startTime + c.duration
          )
          if (clipToSplit) {
            // Save original state before split
            this.saveClipState(clipToSplit)
            store.splitClip(clipToSplit.id, absEnd)
          }
        }
      }

      // Step 3: Apply speed to the middle segment
      currentProject = store.currentProject
      if (!currentProject) continue

      const track = currentProject.timeline.tracks.find(t => 
        t.clips.some(c => c.recordingId === sourceClip.recordingId)
      )
      if (!track) continue

      // Find clips in the typing period range
      const clipsInRange = track.clips.filter(c => {
        const clipEnd = c.startTime + c.duration
        return c.recordingId === sourceClip.recordingId &&
               c.startTime >= absStart - 0.1 && 
               clipEnd <= absEnd + 0.1
      })

      // Apply speed to each clip in range
      for (const targetClip of clipsInRange) {
        // Save original state before modification
        this.saveClipState(targetClip)
        
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
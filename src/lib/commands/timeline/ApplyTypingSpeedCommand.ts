import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'

interface ClipSnapshot {
  id: string
  recordingId: string
  startTime: number
  duration: number
  sourceIn: number
  sourceOut: number
  playbackRate?: number
}

/**
 * Command to apply typing speed suggestions to clips.
 * This command is designed to handle a single typing period at a time.
 * For multiple periods, execute multiple commands sequentially with fresh context.
 */
export class ApplyTypingSpeedCommand extends Command<{ 
  applied: number // number of clips affected
}> {
  private originalClips: ClipSnapshot[] = []
  private recordingId: string = ''
  private trackId: string = ''

  constructor(
    private context: CommandContext,
    private sourceClipId: string,
    private periods: TypingPeriod[]
  ) {
    super({
      name: 'ApplyTypingSpeed',
      description: `Apply typing speed suggestion`,
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
    this.recordingId = sourceClip.recordingId
    this.trackId = track.id
    
    // Save the original state of all clips from this recording
    for (const clip of track.clips) {
      if (clip.recordingId === this.recordingId) {
        this.saveClipState(clip)
      }
    }
    
    // We only process the first period since this command is meant for single periods
    const period = this.periods[0]
    
    // Convert typing period from source coordinates to timeline coordinates
    const timelinePeriod = this.mapPeriodToTimeline(sourceClip, period)
    
    if (!timelinePeriod) {
      return { success: false, error: 'Typing period is outside clip bounds' }
    }
    
    console.log('[ApplyTypingSpeedCommand] Processing period:', {
      source: { start: period.startTime, end: period.endTime },
      timeline: { start: timelinePeriod.startTime, end: timelinePeriod.endTime },
      speed: period.suggestedSpeedMultiplier
    })
    
    // Determine if we need to split the clip
    const clipStart = sourceClip.startTime
    const clipEnd = sourceClip.startTime + sourceClip.duration
    
    const needsSplitAtStart = timelinePeriod.startTime > clipStart + 0.1
    const needsSplitAtEnd = timelinePeriod.endTime < clipEnd - 0.1
    
    let targetClipId = sourceClip.id
    
    // Perform splits if needed
    if (needsSplitAtStart) {
      console.log('[ApplyTypingSpeedCommand] Splitting at period start:', timelinePeriod.startTime)
      store.splitClip(targetClipId, timelinePeriod.startTime)
      
      // After split, find the right-side clip (which contains our typing period)
      const updatedTrack = project.timeline.tracks.find(t => t.id === this.trackId)
      if (updatedTrack) {
        const rightClip = updatedTrack.clips.find(c => 
          c.recordingId === this.recordingId &&
          Math.abs(c.startTime - timelinePeriod.startTime) < 1
        )
        if (rightClip) {
          targetClipId = rightClip.id
        }
      }
    }
    
    if (needsSplitAtEnd) {
      console.log('[ApplyTypingSpeedCommand] Splitting at period end:', timelinePeriod.endTime)
      store.splitClip(targetClipId, timelinePeriod.endTime)
      
      // After this split, the left-side clip is our target
      const updatedTrack = project.timeline.tracks.find(t => t.id === this.trackId)
      if (updatedTrack) {
        const leftClip = updatedTrack.clips.find(c => 
          c.recordingId === this.recordingId &&
          c.startTime >= timelinePeriod.startTime - 1 &&
          c.startTime + c.duration <= timelinePeriod.endTime + 1
        )
        if (leftClip) {
          targetClipId = leftClip.id
        }
      }
    }
    
    // Apply speed to the target clip
    const finalTrack = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!finalTrack) {
      return { success: false, error: 'Track lost after splits' }
    }
    
    const targetClip = finalTrack.clips.find(c => c.id === targetClipId)
    if (!targetClip) {
      // Try to find by position if ID lookup fails
      const targetClip = finalTrack.clips.find(c => 
        c.recordingId === this.recordingId &&
        Math.abs(c.startTime - timelinePeriod.startTime) < 1 &&
        Math.abs(c.startTime + c.duration - timelinePeriod.endTime) < 1
      )
      
      if (targetClip) {
        console.log('[ApplyTypingSpeedCommand] Found target clip by position:', targetClip.id)
        const sourceDuration = (targetClip.sourceOut - targetClip.sourceIn)
        const newDuration = sourceDuration / period.suggestedSpeedMultiplier
        
        store.updateClip(targetClip.id, { 
          playbackRate: period.suggestedSpeedMultiplier,
          duration: newDuration
        })
        
        return {
          success: true,
          data: { applied: 1 }
        }
      }
      
      console.error('[ApplyTypingSpeedCommand] Could not find target clip after splits')
      return { success: false, error: 'Target clip not found after splits' }
    }
    
    console.log('[ApplyTypingSpeedCommand] Applying speed to clip:', targetClip.id)
    const sourceDuration = (targetClip.sourceOut - targetClip.sourceIn)
    const newDuration = sourceDuration / period.suggestedSpeedMultiplier
    
    store.updateClip(targetClip.id, { 
      playbackRate: period.suggestedSpeedMultiplier,
      duration: newDuration
    })

    return {
      success: true,
      data: { applied: 1 }
    }
  }

  doUndo(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track) {
      return { success: false, error: 'Track not found' }
    }

    // Remove all clips from this recording
    const clipsToRemove = track.clips.filter(c => c.recordingId === this.recordingId)
    for (const clip of clipsToRemove) {
      store.removeClip(clip.id)
    }

    // Restore original clips
    for (const snapshot of this.originalClips) {
      store.addClip({
        id: snapshot.id,
        recordingId: snapshot.recordingId,
        startTime: snapshot.startTime,
        duration: snapshot.duration,
        sourceIn: snapshot.sourceIn,
        sourceOut: snapshot.sourceOut,
        playbackRate: snapshot.playbackRate
      } as Clip, snapshot.startTime)
    }

    return {
      success: true,
      data: { applied: 0 }
    }
  }

  doRedo(): CommandResult<{ applied: number }> {
    // Clear saved states and re-execute
    this.originalClips = []
    return this.doExecute()
  }

  private saveClipState(clip: Clip): void {
    if (!this.originalClips.some(s => s.id === clip.id)) {
      this.originalClips.push({
        id: clip.id,
        recordingId: clip.recordingId,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        playbackRate: clip.playbackRate
      })
    }
  }
  
  private mapPeriodToTimeline(sourceClip: Clip, period: TypingPeriod): TypingPeriod | null {
    // The typing period is in source time (milliseconds from start of recording)
    // We need to map it to timeline time
    
    const sourceIn = sourceClip.sourceIn || 0
    const sourceOut = sourceClip.sourceOut || (sourceIn + sourceClip.duration)
    const playbackRate = sourceClip.playbackRate || 1
    
    // Check if period overlaps with this clip's source range
    if (period.endTime <= sourceIn || period.startTime >= sourceOut) {
      return null // Period is outside this clip's source range
    }
    
    // Clip the period to the source range
    const clippedStart = Math.max(period.startTime, sourceIn)
    const clippedEnd = Math.min(period.endTime, sourceOut)
    
    // Convert from source time to clip-relative time
    const relativeStart = (clippedStart - sourceIn) / playbackRate
    const relativeEnd = (clippedEnd - sourceIn) / playbackRate
    
    // Convert to absolute timeline time
    const timelineStart = sourceClip.startTime + relativeStart
    const timelineEnd = sourceClip.startTime + relativeEnd
    
    // Only return if the period has meaningful duration
    if (timelineEnd - timelineStart > 100) { // At least 100ms
      return {
        ...period,
        startTime: timelineStart,
        endTime: timelineEnd
      }
    }
    
    return null
  }
}
import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'
import { computeEffectiveDuration } from '@/lib/timeline/clip-utils'

interface ClipSnapshot {
  id: string
  recordingId: string
  startTime: number
  duration: number
  sourceIn: number
  sourceOut: number
  playbackRate?: number
}

interface SplitResult {
  originalClipId: string
  leftClip?: { id: string; startTime: number; endTime: number }
  rightClip?: { id: string; startTime: number; endTime: number }
}

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
    this.recordingId = sourceClip.recordingId
    this.trackId = track.id
    
    // Save the original state of all clips from this recording
    for (const clip of track.clips) {
      if (clip.recordingId === this.recordingId) {
        this.saveClipState(clip)
      }
    }
    
    // Convert typing periods from source coordinates to timeline coordinates
    // The typing periods are in source time (from keyboard events), 
    // we need to map them to timeline time accounting for the clip's position and rate
    console.log('[ApplyTypingSpeedCommand] Source clip:', {
      id: sourceClip.id,
      startTime: sourceClip.startTime,
      duration: sourceClip.duration,
      sourceIn: sourceClip.sourceIn,
      sourceOut: sourceClip.sourceOut,
      playbackRate: sourceClip.playbackRate
    })
    console.log('[ApplyTypingSpeedCommand] Input periods (source time):', this.periods.map(p => ({
      start: p.startTime,
      end: p.endTime,
      speed: p.suggestedSpeedMultiplier
    })))
    
    const timelinePeriods = this.mapPeriodsToTimeline(sourceClip, this.periods)
    
    console.log('[ApplyTypingSpeedCommand] Mapped periods (timeline time):', timelinePeriods.map(p => ({
      start: p.startTime,
      end: p.endTime,
      speed: p.suggestedSpeedMultiplier
    })))
    
    if (timelinePeriods.length === 0) {
      return { success: false, error: 'No valid typing periods within clip bounds' }
    }
    
    // Collect all unique split points
    const splitPoints = new Set<number>()
    for (const period of timelinePeriods) {
      // Check if we need to split at the start of the period
      // A split is needed if the period start is inside a clip (not at boundaries)
      const needsSplitAtStart = track.clips.some(clip => {
        if (clip.recordingId !== this.recordingId) return false
        const clipStart = clip.startTime
        const clipEnd = clip.startTime + clip.duration
        return period.startTime > clipStart && period.startTime < clipEnd
      })
      
      if (needsSplitAtStart) {
        console.log('[ApplyTypingSpeedCommand] Need split at period start', period.startTime)
        splitPoints.add(period.startTime)
      }
      
      // Check if we need to split at the end of the period
      const needsSplitAtEnd = track.clips.some(clip => {
        if (clip.recordingId !== this.recordingId) return false
        const clipStart = clip.startTime
        const clipEnd = clip.startTime + clip.duration
        return period.endTime > clipStart && period.endTime < clipEnd
      })
      
      if (needsSplitAtEnd) {
        console.log('[ApplyTypingSpeedCommand] Need split at period end', period.endTime)
        splitPoints.add(period.endTime)
      }
    }
    
    // Sort split points from left to right
    const sortedSplitPoints = Array.from(splitPoints).sort((a, b) => a - b)
    
    // Keep track of split results for mapping
    const splitMap = new Map<number, SplitResult>()
    
    // Apply all splits one by one
    console.log('[ApplyTypingSpeedCommand] Split points to apply:', sortedSplitPoints)
    
    // Process splits in order, getting fresh state each time
    for (let i = 0; i < sortedSplitPoints.length; i++) {
      const splitTime = sortedSplitPoints[i]
      
      // Get fresh project state directly from store
      const currentProject = store.currentProject
      
      if (!currentProject) {
        console.log('[ApplyTypingSpeedCommand] Project lost during splits')
        continue
      }
      
      const currentTrack = currentProject.timeline.tracks.find(t => t.id === this.trackId)
      if (!currentTrack) {
        console.log('[ApplyTypingSpeedCommand] Track lost during splits')
        continue
      }
      
      console.log(`[ApplyTypingSpeedCommand] Split ${i + 1}/${sortedSplitPoints.length} at time`, splitTime)
      console.log('[ApplyTypingSpeedCommand] Available clips:', currentTrack.clips
        .filter(c => c.recordingId === this.recordingId)
        .map(c => ({ id: c.id, start: c.startTime, end: c.startTime + c.duration })))
      
      // Find the clip containing this split point - must be from same recording
      const clipToSplit = currentTrack.clips.find(clip => {
        if (clip.recordingId !== this.recordingId) return false
        const clipStart = clip.startTime
        const clipEnd = clip.startTime + clip.duration
        // Split point must be strictly inside the clip (not at boundaries)
        return splitTime > clipStart && splitTime < clipEnd
      })
      
      if (clipToSplit) {
        console.log('[ApplyTypingSpeedCommand] Found clip to split:', 
          { id: clipToSplit.id, start: clipToSplit.startTime, end: clipToSplit.startTime + clipToSplit.duration })
        console.log('[ApplyTypingSpeedCommand] Splitting clip', clipToSplit.id, 'at time', splitTime)
        
        // Perform the split - this is synchronous
        store.splitClip(clipToSplit.id, splitTime)
        
        // Track the split result
        splitMap.set(splitTime, {
          originalClipId: clipToSplit.id,
          // The actual resulting clip IDs will be determined after re-fetching
        })
      } else {
        console.log('[ApplyTypingSpeedCommand] No clip found to split at time', splitTime)
      }
    }
    
    // Now apply speed changes to the appropriate segments
    let appliedCount = 0
    
    // Get fresh state after all splits - need to access the actual Zustand store
    // The store.currentProject might be stale after multiple synchronous updates
    const updatedProject = this.context.getProject()
    if (!updatedProject) {
      return { success: false, error: 'Project lost after splits' }
    }
    
    const updatedTrack = updatedProject.timeline.tracks.find(t => t.id === this.trackId)
    if (!updatedTrack) {
      return { success: false, error: 'Track lost after splits' }
    }
    
    // Process each typing period
    console.log('[ApplyTypingSpeedCommand] Processing periods with updated track')
    console.log('[ApplyTypingSpeedCommand] Track has', updatedTrack.clips.length, 'clips')
    
    for (const period of timelinePeriods) {
      // After splits, we should have clips that match the period boundaries
      // Find the clip(s) that were created for this typing period
      const clipsInPeriod = updatedTrack.clips.filter(clip => {
        if (clip.recordingId !== this.recordingId) return false
        
        const clipStart = clip.startTime
        const clipEnd = clip.startTime + clip.duration
        
        // A clip is "in" the period if it substantially overlaps
        // We use a tolerance because of floating point precision
        const tolerance = 1 // 1ms
        
        // Calculate the overlap
        const overlapStart = Math.max(clipStart, period.startTime - tolerance)
        const overlapEnd = Math.min(clipEnd, period.endTime + tolerance)
        const overlapDuration = Math.max(0, overlapEnd - overlapStart)
        
        // Consider it "in period" if more than 90% overlaps
        const clipDuration = clipEnd - clipStart
        const overlapRatio = clipDuration > 0 ? overlapDuration / clipDuration : 0
        
        return overlapRatio > 0.9
      })
      
      console.log('[ApplyTypingSpeedCommand] Period:', period.startTime, '-', period.endTime)
      console.log('[ApplyTypingSpeedCommand] Found', clipsInPeriod.length, 'clips for this period')
      
      // Apply speed to each clip that matches this period
      for (const clip of clipsInPeriod) {
        // Calculate new duration based on speed multiplier
        const sourceDuration = (clip.sourceOut - clip.sourceIn)
        const newDuration = sourceDuration / period.suggestedSpeedMultiplier
        
        console.log('[ApplyTypingSpeedCommand] Applying speed to clip', clip.id, 
          'rate:', period.suggestedSpeedMultiplier, 'newDuration:', newDuration)
        
        // Update the clip with new playback rate and duration
        store.updateClip(clip.id, { 
          playbackRate: period.suggestedSpeedMultiplier,
          duration: newDuration
        })
        
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
      // Re-add the clip with its original properties
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
    // Only save if we haven't saved this clip already
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
  
  private mapPeriodsToTimeline(sourceClip: Clip, periods: TypingPeriod[]): TypingPeriod[] {
    const mapped: TypingPeriod[] = []
    
    for (const period of periods) {
      // The typing periods are in source time (milliseconds from start of recording)
      // We need to map them to timeline time
      
      const sourceIn = sourceClip.sourceIn || 0
      const sourceOut = sourceClip.sourceOut || (sourceIn + sourceClip.duration)
      const playbackRate = sourceClip.playbackRate || 1
      
      // Check if period overlaps with this clip's source range
      if (period.endTime <= sourceIn || period.startTime >= sourceOut) {
        continue // Period is outside this clip's source range
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
      
      // Only include if the period has meaningful duration
      if (timelineEnd - timelineStart > 100) { // At least 100ms
        mapped.push({
          ...period,
          startTime: timelineStart,
          endTime: timelineEnd
        })
      }
    }
    
    return mapped
  }
  
}
import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export interface SplitClipResult {
  originalClipId: string
  leftClipId: string
  rightClipId: string
}

export class SplitClipCommand extends Command<SplitClipResult> {
  private originalClip?: Clip
  private leftClip?: Clip
  private rightClip?: Clip
  private trackId?: string

  constructor(
    private context: CommandContext,
    private clipId: string,
    private splitTime: number
  ) {
    super({
      name: 'SplitClip',
      description: `Split clip ${clipId} at ${splitTime}ms`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    const { clip } = result
    const relativeTime = this.splitTime - clip.startTime

    // Can only split within clip bounds
    return relativeTime > 0 && relativeTime < clip.duration
  }

  doExecute(): CommandResult<SplitClipResult> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip, track } = result
    this.trackId = track.id
    
    // Store original clip
    this.originalClip = JSON.parse(JSON.stringify(clip))
    
    const relativeTime = this.splitTime - clip.startTime
    
    if (relativeTime <= 0 || relativeTime >= clip.duration) {
      return {
        success: false,
        error: 'Split time must be within clip bounds'
      }
    }

    // Create left clip (modify existing)
    this.leftClip = {
      ...JSON.parse(JSON.stringify(clip)),
      duration: relativeTime,
      sourceOut: clip.sourceIn + relativeTime
    }

    // Create right clip (new)
    this.rightClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip-${Date.now()}`,
      startTime: clip.startTime + relativeTime,
      duration: clip.duration - relativeTime,
      sourceIn: clip.sourceIn + relativeTime
    }

    // Handle effects for split clips
    if (clip.effects) {
      // Split zoom blocks
      if (clip.effects.zoom?.blocks) {
        const leftBlocks = clip.effects.zoom.blocks.filter(
          block => block.startTime < relativeTime
        ).map(block => ({
          ...block,
          endTime: Math.min(block.endTime, relativeTime)
        }))

        const rightBlocks = clip.effects.zoom.blocks.filter(
          block => block.endTime > relativeTime
        ).map(block => ({
          ...block,
          startTime: Math.max(0, block.startTime - relativeTime),
          endTime: block.endTime - relativeTime
        }))

        if (this.leftClip && this.leftClip.effects?.zoom) {
          this.leftClip.effects.zoom.blocks = leftBlocks
        }
        if (this.rightClip && this.rightClip.effects?.zoom) {
          this.rightClip.effects.zoom.blocks = rightBlocks
        }
      }
    }

    // Execute split using store method
    store.splitClip(this.clipId, this.splitTime)

    return {
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: this.leftClip?.id || '',
        rightClipId: this.rightClip?.id || ''
      }
    }
  }

  doUndo(): CommandResult<SplitClipResult> {
    if (!this.originalClip || !this.trackId) {
      return {
        success: false,
        error: 'Cannot undo: missing original clip data'
      }
    }

    const store = this.context.getStore()
    const project = this.context.getProject()
    
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track) {
      return {
        success: false,
        error: 'Track no longer exists'
      }
    }

    // Remove split clips
    if (this.leftClip) {
      const leftIndex = track.clips.findIndex(c => c.id === this.leftClip!.id)
      if (leftIndex !== -1) {
        track.clips.splice(leftIndex, 1)
      }
    }

    if (this.rightClip) {
      const rightIndex = track.clips.findIndex(c => c.id === this.rightClip!.id)
      if (rightIndex !== -1) {
        track.clips.splice(rightIndex, 1)
      }
    }

    // Restore original clip
    track.clips.push(this.originalClip)
    
    // Sort clips by start time
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Update project
    project.modifiedAt = new Date().toISOString()

    // Restore selection
    store.selectClip(this.originalClip.id)

    return {
      success: true,
      data: {
        originalClipId: this.originalClip.id,
        leftClipId: this.leftClip?.id || '',
        rightClipId: this.rightClip?.id || ''
      }
    }
  }

  doRedo(): CommandResult<SplitClipResult> {
    if (!this.leftClip || !this.rightClip || !this.trackId) {
      return {
        success: false,
        error: 'Cannot redo: missing split clip data'
      }
    }

    const project = this.context.getProject()
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track) {
      return {
        success: false,
        error: 'Track no longer exists'
      }
    }

    // Remove original clip
    const originalIndex = track.clips.findIndex(c => c.id === this.clipId)
    if (originalIndex !== -1) {
      track.clips.splice(originalIndex, 1)
    }

    // Add split clips
    track.clips.push(this.leftClip, this.rightClip)
    
    // Sort clips by start time
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Update project
    project.modifiedAt = new Date().toISOString()

    // Select the left clip
    const store = this.context.getStore()
    store.selectClip(this.leftClip.id)

    return {
      success: true,
      data: {
        originalClipId: this.clipId,
        leftClipId: this.leftClip.id,
        rightClipId: this.rightClip.id
      }
    }
  }
}
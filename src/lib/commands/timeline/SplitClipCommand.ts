import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip, Effect } from '@/types/project'
import { timelineToClipRelative } from '@/lib/timeline/time-space-converter'

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
  private originalIndex?: number
  private originalEffects: Effect[] = []
  private splitEffects: Effect[] = []

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
    // Convert timeline position to clip-relative time properly
    const relativeTime = timelineToClipRelative(this.splitTime, clip)

    // Can only split within clip bounds
    return relativeTime > 0 && relativeTime < clip.duration
  }

  doExecute(): CommandResult<SplitClipResult> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    const result = this.context.findClip(this.clipId)

    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip, track } = result
    this.trackId = track.id
    this.originalIndex = track.clips.findIndex(c => c.id === this.clipId)

    // Store original clip
    this.originalClip = JSON.parse(JSON.stringify(clip))

    // Store original effects associated with this clip
    if (project?.timeline.effects) {
      this.originalEffects = project.timeline.effects
        .filter(e => e.id.includes(this.clipId))
        .map(e => JSON.parse(JSON.stringify(e)))
    }

    // Execute split using store method - this now handles everything internally
    store.splitClip(this.clipId, this.splitTime)

    // Get the actual created clips from the project after split
    if (project && this.trackId) {
      const track = project.timeline.tracks.find(t => t.id === this.trackId)
      if (track) {
        // The executeSplitClip now generates predictable IDs
        this.leftClip = track.clips.find(c => c.id.includes(`${this.clipId}-split1`))
        this.rightClip = track.clips.find(c => c.id.includes(`${this.clipId}-split2`))
      }

      // Store the new split effects  
      if (project.timeline.effects && this.leftClip && this.rightClip) {
        this.splitEffects = project.timeline.effects
          .filter(e => e.id.includes(this.leftClip!.id) || e.id.includes(this.rightClip!.id))
          .map(e => JSON.parse(JSON.stringify(e)))
      }
    }

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

    // Restore effects first
    if (project.timeline.effects) {
      // Remove split effects
      for (const splitEffect of this.splitEffects) {
        const index = project.timeline.effects.findIndex(e => e.id === splitEffect.id)
        if (index !== -1) {
          project.timeline.effects.splice(index, 1)
        }
      }

      // Restore original effects
      for (const originalEffect of this.originalEffects) {
        project.timeline.effects.push(originalEffect)
      }
    }

    // Determine the insertion index based on current left split clip position
    let insertIndex = this.originalIndex ?? 0
    if (this.leftClip) {
      const leftIndex = track.clips.findIndex(c => c.id === this.leftClip!.id)
      if (leftIndex !== -1) insertIndex = leftIndex
    }

    // Remove split clips via store to ensure state updates
    if (this.leftClip) {
      store.removeClip(this.leftClip.id)
    }
    if (this.rightClip) {
      store.removeClip(this.rightClip.id)
    }

    // Restore original clip at the original index via store API
    store.restoreClip(this.trackId, this.originalClip, insertIndex)

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

    const store = this.context.getStore()

    // Restore split effects first
    if (project.timeline.effects) {
      // Remove original effects
      for (const originalEffect of this.originalEffects) {
        const index = project.timeline.effects.findIndex(e => e.id === originalEffect.id)
        if (index !== -1) {
          project.timeline.effects.splice(index, 1)
        }
      }

      // Restore split effects
      for (const splitEffect of this.splitEffects) {
        project.timeline.effects.push(splitEffect)
      }
    }

    // Find where the original clip currently is and remove it
    const originalIndex = track.clips.findIndex(c => c.id === this.clipId)
    if (originalIndex !== -1) {
      store.removeClip(this.clipId)
    }

    // Re-insert split clips at the original position via store API
    const insertIndex = originalIndex === -1 ? (this.originalIndex ?? 0) : originalIndex
    store.restoreClip(this.trackId, this.leftClip, insertIndex)
    store.restoreClip(this.trackId, this.rightClip, insertIndex + 1)

    // Select the left clip
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
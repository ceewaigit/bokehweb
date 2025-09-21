import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { computeEffectiveDuration } from '@/lib/timeline/time-space-converter'

export class ChangePlaybackRateCommand extends Command<{ clipId: string; playbackRate: number }> {
  private originalClip?: Clip
  private originalPlaybackRate?: number
  private originalDuration?: number

  constructor(
    private context: CommandContext,
    private clipId: string,
    private playbackRate: number
  ) {
    super({
      name: 'ChangePlaybackRate',
      description: `Change playback rate to ${playbackRate}x`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false

    // Validate playback rate range (similar to Remotion's limits)
    return this.playbackRate > 0.0625 && this.playbackRate <= 16
  }

  doExecute(): CommandResult<{ clipId: string; playbackRate: number }> {
    const result = this.context.findClip(this.clipId)
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Store original state for undo
    this.originalClip = { ...result.clip }
    this.originalPlaybackRate = result.clip.playbackRate || 1.0
    this.originalDuration = result.clip.duration

    // Use utility to compute new effective duration
    const newDuration = computeEffectiveDuration(result.clip, this.playbackRate)

    const store = this.context.getStore()
    store.updateClip(this.clipId, { 
      playbackRate: this.playbackRate,
      duration: newDuration
    })

    return {
      success: true,
      data: { clipId: this.clipId, playbackRate: this.playbackRate }
    }
  }

  doUndo(): CommandResult<{ clipId: string; playbackRate: number }> {
    if (!this.originalClip || this.originalDuration === undefined) {
      return {
        success: false,
        error: 'No original clip state to restore'
      }
    }

    const store = this.context.getStore()
    store.updateClip(this.clipId, { 
      playbackRate: this.originalPlaybackRate,
      duration: this.originalDuration
    })

    return {
      success: true,
      data: { clipId: this.clipId, playbackRate: this.originalPlaybackRate || 1.0 }
    }
  }

  doRedo(): CommandResult<{ clipId: string; playbackRate: number }> {
    return this.doExecute()
  }
} 
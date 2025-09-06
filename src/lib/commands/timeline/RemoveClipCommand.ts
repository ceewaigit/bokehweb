import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class RemoveClipCommand extends Command<{ clipId: string }> {
  private clip?: Clip
  private clipIndex?: number
  private wasSelected: boolean = false
  private trackId?: string

  constructor(
    private context: CommandContext,
    private clipId: string
  ) {
    super({
      name: 'RemoveClip',
      description: `Remove clip ${clipId}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Store clip data for undo
    this.clip = { ...result.clip }
    this.trackId = result.track.id
    this.clipIndex = result.track.clips.indexOf(result.clip)
    this.wasSelected = this.context.getSelectedClips().includes(this.clipId)

    // Remove using store method
    store.removeClip(this.clipId)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.clip || !this.trackId || this.clipIndex === undefined) {
      return {
        success: false,
        error: 'Cannot undo: missing clip data'
      }
    }

    const store = this.context.getStore()

    // Delegate restoration to the store to keep state consistent
    store.restoreClip(this.trackId, this.clip, this.clipIndex)

    // Restore selection if it was selected
    if (this.wasSelected) {
      store.selectClip(this.clipId)
    }

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    store.removeClip(this.clipId)
    
    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}
import { Command, CommandResult } from '../base/Command'
import { CommandContext, findNextValidPosition } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class DuplicateClipCommand extends Command<{ newClipId: string }> {
  private newClip?: Clip
  private sourceClip?: Clip

  constructor(
    private context: CommandContext,
    private clipId: string
  ) {
    super({
      name: 'DuplicateClip',
      description: `Duplicate clip ${clipId}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  doExecute(): CommandResult<{ newClipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip, track } = result
    this.sourceClip = clip

    // Create duplicate with new ID - place it right after the original clip
    // Let the store handle overlap detection
    this.newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip-${Date.now()}`,
      startTime: clip.startTime + clip.duration + 100 // Small gap after original
    }

    // Use store's duplicateClip method
    const newClipId = store.duplicateClip(this.clipId)
    
    if (!newClipId) {
      return {
        success: false,
        error: 'Failed to duplicate clip'
      }
    }

    // Update our reference
    const newClipResult = this.context.findClip(newClipId)
    if (newClipResult) {
      this.newClip = newClipResult.clip
    }

    return {
      success: true,
      data: { newClipId }
    }
  }

  doUndo(): CommandResult<{ newClipId: string }> {
    if (!this.newClip) {
      return {
        success: false,
        error: 'No duplicated clip to remove'
      }
    }

    const store = this.context.getStore()
    store.removeClip(this.newClip.id)

    // Restore selection to original clip
    store.selectClip(this.clipId)

    return {
      success: true,
      data: { newClipId: this.newClip.id }
    }
  }

  doRedo(): CommandResult<{ newClipId: string }> {
    if (!this.newClip) {
      return {
        success: false,
        error: 'No clip data to re-duplicate'
      }
    }

    const store = this.context.getStore()
    store.addClip(this.newClip, this.newClip.startTime)

    return {
      success: true,
      data: { newClipId: this.newClip.id }
    }
  }
}
import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ClipEffects } from '@/types/project'

export class UpdateClipEffectsCommand extends Command<{ clipId: string }> {
  private originalEffects?: ClipEffects
  private clipId: string
  private effectUpdates: Partial<ClipEffects>

  constructor(
    private context: CommandContext,
    clipId: string,
    effectUpdates: Partial<ClipEffects>
  ) {
    super({
      name: 'UpdateClipEffects',
      description: `Update effects for clip ${clipId}`,
      category: 'effects'
    })
    this.clipId = clipId
    this.effectUpdates = effectUpdates
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

    const { clip } = result
    
    // Store original effects
    this.originalEffects = clip.effects ? JSON.parse(JSON.stringify(clip.effects)) : undefined

    // Update effects using store method
    store.updateClipEffects(this.clipId, this.effectUpdates)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Restore original effects
    if (this.originalEffects) {
      store.updateClip(this.clipId, { effects: this.originalEffects })
    } else {
      // Remove effects if there were none originally
      const { clip } = result
      const updatedClip = { ...clip, effects: undefined }
      store.updateClip(this.clipId, updatedClip)
    }

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    
    // Reapply effect updates
    store.updateClipEffects(this.clipId, this.effectUpdates)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}
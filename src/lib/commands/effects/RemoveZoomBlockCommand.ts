import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect } from '@/types/project'

export class RemoveZoomBlockCommand extends Command<{ blockId: string }> {
  private effect?: Effect
  private clipId: string
  private blockId: string

  constructor(
    private context: CommandContext,
    clipId: string,
    blockId: string
  ) {
    super({
      name: 'RemoveZoomBlock',
      description: `Remove zoom block ${blockId} from clip ${clipId}`,
      category: 'effects'
    })
    this.clipId = clipId
    this.blockId = blockId
  }

  canExecute(): boolean {
    const store = this.context.getStore()
    const effects = store.getEffectsForClip(this.clipId)
    const effect = effects.find((e: any) => e.id === this.blockId && e.type === 'zoom')
    return effect !== undefined
  }

  doExecute(): CommandResult<{ blockId: string }> {
    console.log('[RemoveZoomBlockCommand] Executing - clipId:', this.clipId, 'blockId:', this.blockId)
    
    const store = this.context.getStore()
    const effects = store.getEffectsForClip(this.clipId)
    const effect = effects.find((e: any) => e.id === this.blockId && e.type === 'zoom')
    
    if (!effect) {
      console.error('[RemoveZoomBlockCommand] Zoom effect not found:', this.blockId)
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    console.log('[RemoveZoomBlockCommand] Found zoom effect, removing...')
    
    // Store effect for undo
    this.effect = JSON.parse(JSON.stringify(effect))

    // Remove effect using store method
    store.removeEffect(this.blockId)
    console.log('[RemoveZoomBlockCommand] Effect removed successfully')

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    if (!this.effect) {
      return {
        success: false,
        error: 'No block data to restore'
      }
    }

    const store = this.context.getStore()
    
    // Re-add the effect
    store.addEffect(this.effect)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Re-remove the effect
    store.removeEffect(this.blockId)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}
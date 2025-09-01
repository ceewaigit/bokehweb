import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect } from '@/types/project'

export class RemoveZoomBlockCommand extends Command<{ blockId: string }> {
  private effect?: Effect
  private blockId: string

  constructor(
    private context: CommandContext,
    blockId: string
  ) {
    super({
      name: 'RemoveZoomBlock',
      description: `Remove zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
  }

  canExecute(): boolean {
    // Zoom effects are timeline-global, check project effects directly
    const project = this.context.getProject()
    const effect = project?.timeline.effects?.find(e => e.id === this.blockId && e.type === 'zoom')
    return effect !== undefined
  }

  doExecute(): CommandResult<{ blockId: string }> {
    console.log('[RemoveZoomBlockCommand] Executing - blockId:', this.blockId)
    
    const project = this.context.getProject()
    const effect = project?.timeline.effects?.find(e => e.id === this.blockId && e.type === 'zoom')
    
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
    const store = this.context.getStore()
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
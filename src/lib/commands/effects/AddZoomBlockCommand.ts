import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock } from '@/types/project'

export class AddZoomBlockCommand extends Command<{ blockId: string }> {
  private block: ZoomBlock
  private clipId: string

  constructor(
    private context: CommandContext,
    clipId: string,
    block: ZoomBlock
  ) {
    super({
      name: 'AddZoomBlock',
      description: `Add zoom block to clip ${clipId}`,
      category: 'effects'
    })
    this.clipId = clipId
    this.block = block
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-${Date.now()}`
    }

    // Add zoom block using store method
    store.addZoomBlock(this.clipId, this.block)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Remove the zoom block
    store.removeZoomBlock(this.clipId, this.block.id)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Re-add the zoom block
    store.addZoomBlock(this.clipId, this.block)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }
}
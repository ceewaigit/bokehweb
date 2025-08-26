import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock } from '@/types/project'

export class RemoveZoomBlockCommand extends Command<{ blockId: string }> {
  private block?: ZoomBlock
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
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    
    const { clip } = result
    const block = clip.effects?.zoom?.blocks?.find(b => b.id === this.blockId)
    return block !== undefined
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

    const { clip } = result
    const block = clip.effects?.zoom?.blocks?.find(b => b.id === this.blockId)
    
    if (!block) {
      return {
        success: false,
        error: `Zoom block ${this.blockId} not found`
      }
    }

    // Store block for undo
    this.block = JSON.parse(JSON.stringify(block))

    // Remove zoom block using store method
    store.removeZoomBlock(this.clipId, this.blockId)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    if (!this.block) {
      return {
        success: false,
        error: 'No block data to restore'
      }
    }

    const store = this.context.getStore()
    
    // Re-add the zoom block
    store.addZoomBlock(this.clipId, this.block)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Remove the zoom block again
    store.removeZoomBlock(this.clipId, this.blockId)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}
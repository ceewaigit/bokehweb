import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock } from '@/types/project'

export class UpdateZoomBlockCommand extends Command<{ blockId: string }> {
  private originalBlock?: ZoomBlock
  private clipId: string
  private blockId: string
  private updates: Partial<ZoomBlock>

  constructor(
    private context: CommandContext,
    clipId: string,
    blockId: string,
    updates: Partial<ZoomBlock>
  ) {
    super({
      name: 'UpdateZoomBlock',
      description: `Update zoom block ${blockId} in clip ${clipId}`,
      category: 'effects'
    })
    this.clipId = clipId
    this.blockId = blockId
    this.updates = updates
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

    // Store original state
    this.originalBlock = JSON.parse(JSON.stringify(block))

    // Update zoom block using store method
    store.updateZoomBlock(this.clipId, this.blockId, this.updates)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    if (!this.originalBlock) {
      return {
        success: false,
        error: 'No original block data to restore'
      }
    }

    const store = this.context.getStore()
    
    // Restore original block properties
    store.updateZoomBlock(this.clipId, this.blockId, this.originalBlock)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Reapply updates
    store.updateZoomBlock(this.clipId, this.blockId, this.updates)

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}
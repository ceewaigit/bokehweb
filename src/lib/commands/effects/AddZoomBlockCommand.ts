import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock, Effect, ZoomEffectData } from '@/types/project'

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
    // Zoom effects are timeline-global, don't require a clip
    return true
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-${Date.now()}`
    }

    // Create a new zoom effect from the block (with absolute timeline positions)
    const zoomEffect: Effect = {
      id: this.block.id,
      type: 'zoom',
      startTime: this.block.startTime,
      endTime: this.block.endTime,
      data: {
        scale: this.block.scale,
        targetX: this.block.targetX,
        targetY: this.block.targetY,
        introMs: this.block.introMs || 300,
        outroMs: this.block.outroMs || 300,
        smoothing: 0.1,
        followStrategy: 'mouse'
      } as ZoomEffectData,
      enabled: true
    }

    // Add zoom effect using store method
    store.addEffect(zoomEffect)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doUndo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Remove the zoom effect
    store.removeEffect(this.block.id)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    
    // Re-add the zoom effect (with absolute timeline positions)
    const zoomEffect: Effect = {
      id: this.block.id,
      type: 'zoom',
      startTime: this.block.startTime,
      endTime: this.block.endTime,
      data: {
        scale: this.block.scale,
        targetX: this.block.targetX,
        targetY: this.block.targetY,
        introMs: this.block.introMs || 300,
        outroMs: this.block.outroMs || 300,
        smoothing: 0.1,
        followStrategy: 'mouse'
      } as ZoomEffectData,
      enabled: true
    }
    store.addEffect(zoomEffect)

    return {
      success: true,
      data: { blockId: this.block.id }
    }
  }
}
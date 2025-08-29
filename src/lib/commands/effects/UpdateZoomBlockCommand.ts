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
    const store = this.context.getStore()
    const effects = store.getEffectsForClip(this.clipId)
    const effect = effects.find((e: any) => e.id === this.blockId && e.type === 'zoom')
    return effect !== undefined
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    const effects = store.getEffectsForClip(this.clipId)
    const effect = effects.find((e: any) => e.id === this.blockId && e.type === 'zoom')

    if (!effect) {
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    // Store original state
    const zoomData = effect.data as any
    this.originalBlock = {
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      scale: zoomData.scale,
      targetX: zoomData.targetX,
      targetY: zoomData.targetY,
      introMs: zoomData.introMs,
      outroMs: zoomData.outroMs
    }

    // Update the effect with new zoom data
    const updatedData = {
      ...zoomData,
      scale: this.updates.scale ?? zoomData.scale,
      targetX: this.updates.targetX ?? zoomData.targetX,
      targetY: this.updates.targetY ?? zoomData.targetY,
      introMs: this.updates.introMs ?? zoomData.introMs,
      outroMs: this.updates.outroMs ?? zoomData.outroMs
    }

    // Also update timing if provided
    const updatedEffect: any = {
      startTime: this.updates.startTime ?? effect.startTime,
      endTime: this.updates.endTime ?? effect.endTime,
      data: updatedData
    }

    store.updateEffect(this.blockId, updatedEffect)

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
    const updatedData = {
      scale: this.originalBlock.scale || 2,
      targetX: this.originalBlock.targetX,
      targetY: this.originalBlock.targetY,
      introMs: this.originalBlock.introMs || 300,
      outroMs: this.originalBlock.outroMs || 300,
      smoothing: 0.1
    }

    store.updateEffect(this.blockId, {
      startTime: this.originalBlock.startTime,
      endTime: this.originalBlock.endTime,
      data: updatedData
    })

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }

  doRedo(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()

    // Re-apply updates  
    const effects = store.getEffectsForClip(this.clipId)
    const effect = effects.find((e: any) => e.id === this.blockId && e.type === 'zoom')

    if (effect) {
      const zoomData = effect.data as any
      const updatedData = {
        ...zoomData,
        scale: this.updates.scale ?? zoomData.scale,
        targetX: this.updates.targetX ?? zoomData.targetX,
        targetY: this.updates.targetY ?? zoomData.targetY,
        introMs: this.updates.introMs ?? zoomData.introMs,
        outroMs: this.updates.outroMs ?? zoomData.outroMs
      }

      store.updateEffect(this.blockId, {
        startTime: this.updates.startTime ?? effect.startTime,
        endTime: this.updates.endTime ?? effect.endTime,
        data: updatedData
      })
    }

    return {
      success: true,
      data: { blockId: this.blockId }
    }
  }
}
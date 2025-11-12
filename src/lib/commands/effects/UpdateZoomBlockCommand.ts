import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect, Project, Recording, ZoomBlock } from '@/types/project'
import { EffectType } from '@/types/project'

interface LocatedZoomEffect {
  effect: Effect
  recording?: Recording
}

function findZoomEffect(project: Project | null, effectId: string): LocatedZoomEffect | null {
  if (!project) return null

  // Zoom effects are ONLY in recording.effects, never in timeline.effects
  for (const recording of project.recordings) {
    const effect = recording.effects?.find(e => e.id === effectId && e.type === EffectType.Zoom)
    if (effect) {
      return { effect, recording }
    }
  }

  return null
}

export class UpdateZoomBlockCommand extends Command<{ blockId: string }> {
  private originalBlock?: ZoomBlock
  private blockId: string
  private updates: Partial<ZoomBlock>

  constructor(
    private context: CommandContext,
    blockId: string,
    updates: Partial<ZoomBlock>
  ) {
    super({
      name: 'UpdateZoomBlock',
      description: `Update zoom block ${blockId}`,
      category: 'effects'
    })
    this.blockId = blockId
    this.updates = updates
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    return findZoomEffect(project, this.blockId) !== null
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const store = this.context.getStore()
    const project = this.context.getProject()
    const located = findZoomEffect(project, this.blockId)
    if (!located) {
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    const effect = located.effect

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
    const project = this.context.getProject()

    const located = findZoomEffect(project, this.blockId)
    const effect = located?.effect

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

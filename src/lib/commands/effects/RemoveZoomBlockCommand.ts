import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect, Project, Recording } from '@/types/project'
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
    const project = this.context.getProject()
    return findZoomEffect(project, this.blockId) !== null
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const project = this.context.getProject()
    const located = findZoomEffect(project, this.blockId)

    if (!located) {
      return {
        success: false,
        error: `Zoom effect ${this.blockId} not found`
      }
    }

    // Store effect for undo
    this.effect = JSON.parse(JSON.stringify(located.effect))

    // Remove effect using store method
    const store = this.context.getStore()
    store.removeEffect(this.blockId)

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
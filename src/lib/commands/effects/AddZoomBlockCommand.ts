import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock, Effect, ZoomEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import { useProjectStore } from '@/stores/project-store'

export class AddZoomBlockCommand extends Command<{ blockId: string }> {
  private block: ZoomBlock
  private recordingId: string

  constructor(
    private context: CommandContext,
    recordingId: string,  // Now takes recordingId directly, not clipId
    block: ZoomBlock
  ) {
    super({
      name: 'AddZoomBlock',
      description: `Add zoom block to recording ${recordingId}`,
      category: 'effects'
    })
    this.recordingId = recordingId
    this.block = block
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    // Check if the recording exists
    return project.recordings.some(r => r.id === this.recordingId)
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const project = this.context.getProject()
    console.log('[AddZoomBlockCommand] doExecute called, recordingId:', this.recordingId)

    if (!project) {
      return {
        success: false,
        error: 'No project found'
      }
    }

    const recording = project.recordings.find(r => r.id === this.recordingId)
    if (!recording) {
      console.error('[AddZoomBlockCommand] Recording not found:', this.recordingId)
      return {
        success: false,
        error: `Recording ${this.recordingId} not found`
      }
    }

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-${this.recordingId}-${Date.now()}`
    }

    console.log('[AddZoomBlockCommand] Block ID:', this.block.id)

    // Create a new zoom effect from the block
    const zoomEffect: Effect = {
      id: this.block.id,
      type: EffectType.Zoom,
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

    console.log('[AddZoomBlockCommand] Adding effect to recording.effects, current count:', recording.effects?.length || 0)

    // Use global store's setProject to work within Immer context
    useProjectStore.getState().setProject({
      ...project,
      recordings: project.recordings.map(r => {
        if (r.id === this.recordingId) {
          return {
            ...r,
            effects: [...(r.effects || []), zoomEffect]
          }
        }
        return r
      }),
      modifiedAt: new Date().toISOString()
    })

    console.log('[AddZoomBlockCommand] Effect added successfully')

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
    // Just re-execute
    return this.doExecute()
  }
}

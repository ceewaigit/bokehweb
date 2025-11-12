import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { ZoomBlock, Effect, ZoomEffectData, Clip } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { useProjectStore } from '@/stores/project-store'

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
    // Zoom effects are recording-scoped, must have a clip to find the recording
    const project = this.context.getProject()
    return !!this.findClipAndRecording(project).recording
  }

  private findClipAndRecording(project: any) {
    if (!project) return { clip: null, recording: null }

    let targetClip: Clip | null = null
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find((c: Clip) => c.id === this.clipId)
      if (clip) {
        targetClip = clip
        break
      }
    }

    if (!targetClip) return { clip: null, recording: null }

    const recording = project.recordings.find((r: any) => r.id === targetClip!.recordingId)
    return { clip: targetClip, recording }
  }

  doExecute(): CommandResult<{ blockId: string }> {
    const project = this.context.getProject()
    console.log('[AddZoomBlockCommand] doExecute called, clipId:', this.clipId)

    const { clip, recording } = this.findClipAndRecording(project)
    console.log('[AddZoomBlockCommand] Found clip:', !!clip, 'recording:', !!recording, 'recordingId:', recording?.id)

    if (!recording) {
      console.error('[AddZoomBlockCommand] Recording not found for clip:', this.clipId)
      return {
        success: false,
        error: 'Recording not found for clip'
      }
    }

    // Ensure block has an ID
    if (!this.block.id) {
      this.block.id = `zoom-${recording.id}-${Date.now()}`
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

    // Add zoom effect directly to recording.effects
    // We need to use the store to properly update because we're outside Immer context
    if (!project) {
      return {
        success: false,
        error: 'No project found'
      }
    }

    console.log('[AddZoomBlockCommand] Adding effect to recording.effects, current count:', recording.effects?.length || 0)

    // Use global store's setProject to work within Immer context
    useProjectStore.getState().setProject({
      ...project,
      recordings: project.recordings.map(r => {
        if (r.id === recording.id) {
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
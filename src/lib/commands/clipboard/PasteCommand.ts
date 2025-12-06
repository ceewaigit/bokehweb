import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { AddClipCommand } from '../timeline/AddClipCommand'
import { AddZoomBlockCommand } from '../effects/AddZoomBlockCommand'
import type { Clip, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types/project'
import { TimeConverter } from '@/lib/timeline/time-space-converter'

export interface PasteResult {
  type: 'clip' | 'effect'
  clipId?: string
  effectType?: EffectType.Zoom | EffectType.Cursor | EffectType.Background
  blockId?: string
}

export class PasteCommand extends Command<PasteResult> {
  private pastedCommand?: Command

  constructor(
    private context: CommandContext,
    private targetClipId?: string,  // Optional - for backwards compatibility
    private pasteTime?: number
  ) {
    super({
      name: 'Paste',
      description: 'Paste clipboard contents',
      category: 'clipboard'
    })
  }

  canExecute(): boolean {
    const clipboard = this.context.getClipboard()
    return !!(clipboard.clip || clipboard.effect)
  }

  async doExecute(): Promise<CommandResult<PasteResult>> {
    const clipboard = this.context.getClipboard()
    const project = this.context.getProject()

    // Paste effect if we have one
    if (clipboard.effect) {
      // Zoom effects are recording-scoped and playhead-based
      if (clipboard.effect.type === EffectType.Zoom) {
        console.log('[PasteCommand] Pasting zoom effect (playhead-based)')
        const zoomData = clipboard.effect.data as unknown as ZoomEffectData

        if (!project) {
          return { success: false, error: 'No project found' }
        }

        // Get current playhead position (this is what determines where the effect goes)
        const currentTimelineTime = this.pasteTime ?? this.context.getCurrentTime()
        console.log('[PasteCommand] Playhead position:', currentTimelineTime)

        // Find clip at playhead position - we need it for:
        // 1. Getting the recordingId (which recording to add the effect to)
        // 2. Converting timeline time to source time
        const allClips = project.timeline.tracks.flatMap(t => t.clips)
        const clipAtPlayhead = TimeConverter.findClipAtTimelinePosition(currentTimelineTime, allClips)

        if (!clipAtPlayhead) {
          // If playhead is not on a clip, find the nearest clip or first clip
          if (allClips.length === 0) {
            return { success: false, error: 'No clips in timeline. Create a clip first.' }
          }

          // Use first clip as fallback
          const firstClip = allClips.sort((a, b) => a.startTime - b.startTime)[0]
          console.log('[PasteCommand] Playhead not on clip, using first clip:', firstClip.id)

          // Convert timeline time to source time using the first clip
          const sourceTime = TimeConverter.timelineToSource(
            Math.max(firstClip.startTime, currentTimelineTime),
            firstClip
          )

          return this.createZoomBlock(zoomData, firstClip.recordingId, sourceTime, project)
        }

        console.log('[PasteCommand] Clip at playhead:', clipAtPlayhead.id, 'recordingId:', clipAtPlayhead.recordingId)

        // Convert timeline time to source time for storage
        const pasteStartTimeSource = TimeConverter.timelineToSource(currentTimelineTime, clipAtPlayhead)
        console.log('[PasteCommand] Timeline time:', currentTimelineTime, '-> Source time:', pasteStartTimeSource)

        return this.createZoomBlock(zoomData, clipAtPlayhead.recordingId, pasteStartTimeSource, project)
      } else {
        // For other effect types (cursor/background), use playhead-based approach too
        const currentTime = this.pasteTime ?? this.context.getCurrentTime()
        const allClips = project?.timeline.tracks.flatMap(t => t.clips) || []
        const clipAtPlayhead = TimeConverter.findClipAtTimelinePosition(currentTime, allClips)

        if (!clipAtPlayhead) {
          return { success: false, error: 'Position playhead on a clip to paste the effect' }
        }

        // Paste cursor/background settings
        const effectType = clipboard.effect.type
        const effectData = clipboard.effect.data
        const store = this.context.getStore()

        // Find existing effect of this type and update it
        const existingEffects = store.getEffectsAtTimeRange(clipAtPlayhead.id)
        const existingEffect = existingEffects.find(e => e.type === effectType)

        if (existingEffect) {
          store.updateEffect(existingEffect.id, { data: effectData })
        } else {
          store.addEffect({
            id: `${effectType}-global-${Date.now()}`,
            type: effectType as EffectType,
            startTime: clipAtPlayhead.startTime,
            endTime: clipAtPlayhead.startTime + clipAtPlayhead.duration,
            data: effectData,
            enabled: true
          })
        }

        return {
          success: true,
          data: { type: 'effect', effectType, clipId: clipAtPlayhead.id }
        }
      }
    }

    // Paste clip
    if (clipboard.clip) {
      const currentTime = this.pasteTime ?? this.context.getCurrentTime()

      const newClip: Clip = {
        ...clipboard.clip,
        id: `clip-${Date.now()}`,
        startTime: currentTime
      }

      this.pastedCommand = new AddClipCommand(this.context, newClip)
      const result = await this.pastedCommand.execute()

      if (result.success) {
        return {
          success: true,
          data: { type: 'clip', clipId: newClip.id }
        }
      }
      return result as CommandResult<PasteResult>
    }

    return { success: false, error: 'Nothing to paste' }
  }

  private async createZoomBlock(
    zoomData: ZoomEffectData,
    recordingId: string,
    pasteStartTimeSource: number,
    project: any
  ): Promise<CommandResult<PasteResult>> {
    // Default duration in SOURCE space
    const blockDurationSource = 5000 // 5 seconds

    // Find non-overlapping position - check ALL zoom effects in the target recording
    const recording = project.recordings.find((r: any) => r.id === recordingId)
    const existingZoomEffects: Effect[] = (recording?.effects || []).filter(
      (e: Effect) => e.type === EffectType.Zoom
    )
    existingZoomEffects.sort((a, b) => a.startTime - b.startTime)

    let finalStartTime = Math.max(0, pasteStartTimeSource)

    // Check for overlaps in SOURCE space
    for (const effect of existingZoomEffects) {
      if (finalStartTime < effect.endTime && (finalStartTime + blockDurationSource) > effect.startTime) {
        finalStartTime = effect.endTime + 100
      }
    }

    const newBlock: ZoomBlock = {
      ...zoomData,
      id: `zoom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: finalStartTime,
      endTime: finalStartTime + blockDurationSource,
      scale: zoomData.scale || 2
    }

    console.log('[PasteCommand] Creating zoom block:', {
      recordingId,
      blockId: newBlock.id,
      startTime: newBlock.startTime,
      endTime: newBlock.endTime,
      scale: newBlock.scale
    })

    // Add zoom effect directly to recording using recordingId
    this.pastedCommand = new AddZoomBlockCommand(this.context, recordingId, newBlock)
    const result = await this.pastedCommand.execute()

    console.log('[PasteCommand] AddZoomBlockCommand result:', result)

    if (result.success) {
      return {
        success: true,
        data: {
          type: 'effect',
          effectType: EffectType.Zoom,
          blockId: newBlock.id
        }
      }
    }
    return result as CommandResult<PasteResult>
  }

  async doUndo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return { success: false, error: 'No paste operation to undo' }
    }
    return await this.pastedCommand.undo() as CommandResult<PasteResult>
  }

  async doRedo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return { success: false, error: 'No paste operation to redo' }
    }
    return await this.pastedCommand.redo() as CommandResult<PasteResult>
  }
}

import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { AddClipCommand } from '../timeline/AddClipCommand'
import { AddZoomBlockCommand } from '../effects/AddZoomBlockCommand'
import type { Clip, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types/project'

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
    private targetClipId?: string,
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
    const store = this.context.getStore()

    // Paste effect if we have one
    if (clipboard.effect) {
      // Zoom effects are recording-scoped
      if (clipboard.effect.type === EffectType.Zoom) {
        console.log('[PasteCommand] Pasting zoom effect')
        const zoomData = clipboard.effect.data as unknown as ZoomEffectData

        // Determine target clip for the zoom effect
        // Priority: targetClipId > selected clip > playhead clip > first clip
        const project = this.context.getProject()
        let targetClipId = this.targetClipId

        console.log('[PasteCommand] Initial targetClipId:', targetClipId)

        if (!targetClipId) {
          const selectedClips = this.context.getSelectedClips()
          targetClipId = selectedClips[0]
          console.log('[PasteCommand] Selected clips:', selectedClips, 'using:', targetClipId)
        }

        if (!targetClipId && project) {
          // Fallback to first clip in timeline
          const firstClip = project.timeline.tracks[0]?.clips[0]
          targetClipId = firstClip?.id
          console.log('[PasteCommand] Using first clip:', targetClipId)
        }

        if (!targetClipId) {
          console.error('[PasteCommand] No clip found to paste zoom effect')
          return {
            success: false,
            error: 'No clip found to paste zoom effect. Create a clip first.'
          }
        }

        console.log('[PasteCommand] Final targetClipId:', targetClipId)

        // For pasting, we need to determine duration - use a default of 5 seconds
        const blockDuration = 5000 // 5 seconds default for zoom effect
        const currentTime = this.pasteTime ?? this.context.getCurrentTime()
        let pasteStartTime = Math.max(0, currentTime) // Use absolute timeline position

        // Find non-overlapping position - check ALL zoom effects in all recordings
        const existingZoomEffects: Effect[] = []
        for (const recording of project?.recordings || []) {
          const zoomEffects = (recording.effects || []).filter(e => e.type === EffectType.Zoom)
          existingZoomEffects.push(...zoomEffects)
        }
        existingZoomEffects.sort((a, b) => a.startTime - b.startTime)

        for (const effect of existingZoomEffects) {
          if (pasteStartTime < effect.endTime && (pasteStartTime + blockDuration) > effect.startTime) {
            pasteStartTime = effect.endTime + 100
          }
        }

        const newBlock: ZoomBlock = {
          ...zoomData,
          id: `zoom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          startTime: pasteStartTime,
          endTime: pasteStartTime + blockDuration,
          scale: zoomData.scale || 2
        }

        console.log('[PasteCommand] Creating AddZoomBlockCommand with:', {
          targetClipId,
          blockId: newBlock.id,
          startTime: newBlock.startTime,
          endTime: newBlock.endTime,
          scale: newBlock.scale
        })

        // Zoom effects stored in recording.effects
        this.pastedCommand = new AddZoomBlockCommand(this.context, targetClipId, newBlock)
        const result = await this.pastedCommand.execute()

        console.log('[PasteCommand] AddZoomBlockCommand result:', result)

        if (result.success) {
          return {
            success: true,
            data: {
              type: 'effect',
              effectType: EffectType.Zoom,
              blockId: newBlock.id,
              clipId: '' // Zoom effects are recording-scoped
            }
          }
        }
        return result as CommandResult<PasteResult>
      } else {
        // For other effect types (cursor/background), we may still need a clip context
        const targetClipId = this.targetClipId || this.context.getSelectedClips()[0]
        
        if (!targetClipId) {
          return {
            success: false,
            error: 'Select a clip to paste the effect'
          }
        }

        const targetResult = this.context.findClip(targetClipId)
        if (!targetResult) {
          return {
            success: false,
            error: `Target clip ${targetClipId} not found`
          }
        }

        const { clip: targetClip } = targetResult
        
        // Paste cursor/background settings
        const effectType = clipboard.effect.type
        const effectData = clipboard.effect.data
        const store = this.context.getStore()
        
        // Find existing effect of this type and update it
        const existingEffects = store.getEffectsAtTimeRange(targetClipId)
        const existingEffect = existingEffects.find(e => e.type === effectType)
        
        if (existingEffect) {
          // Update existing effect
          store.updateEffect(existingEffect.id, {
            data: effectData
          })
        } else {
          // Create new effect if none exists
          store.addEffect({
            id: `${effectType}-global-${Date.now()}`,
            type: effectType as EffectType,
            startTime: targetClip.startTime,
            endTime: targetClip.startTime + targetClip.duration,
            data: effectData,
            enabled: true
          })
        }
        
        return {
          success: true,
          data: {
            type: 'effect',
            effectType,
            clipId: targetClipId
          }
        }
      }
    }

    // Paste clip
    if (clipboard.clip) {
      const currentTime = this.pasteTime ?? this.context.getCurrentTime()
      
      // Copy clip (without effects since they're independent now)
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
          data: {
            type: 'clip',
            clipId: newClip.id
          }
        }
      }
      return result as CommandResult<PasteResult>
    }

    return {
      success: false,
      error: 'Nothing to paste'
    }
  }

  async doUndo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return {
        success: false,
        error: 'No paste operation to undo'
      }
    }

    return await this.pastedCommand.undo() as CommandResult<PasteResult>
  }

  async doRedo(): Promise<CommandResult<PasteResult>> {
    if (!this.pastedCommand) {
      return {
        success: false,
        error: 'No paste operation to redo'
      }
    }

    return await this.pastedCommand.redo() as CommandResult<PasteResult>
  }
}
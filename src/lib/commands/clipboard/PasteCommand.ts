import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { AddClipCommand } from '../timeline/AddClipCommand'
import { AddZoomBlockCommand } from '../effects/AddZoomBlockCommand'
import type { Clip, ZoomBlock } from '@/types/project'

export interface PasteResult {
  type: 'clip' | 'effect'
  clipId?: string
  effectType?: 'zoom' | 'cursor' | 'background'
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

    // Paste effect if we have one and a target clip
    if (clipboard.effect) {
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

      if (clipboard.effect.type === 'zoom') {
        const zoomBlock = clipboard.effect.data as ZoomBlock
        const blockDuration = zoomBlock.endTime - zoomBlock.startTime
        const currentTime = this.pasteTime ?? this.context.getCurrentTime()
        let pasteStartTime = Math.max(0, currentTime - targetClip.startTime)
        
        // Find non-overlapping position
        const store = this.context.getStore()
        const existingZoomEffects = store.getEffectsForClip(targetClipId)
          .filter(e => e.type === 'zoom')
          .sort((a, b) => a.startTime - b.startTime)
        
        for (const effect of existingZoomEffects) {
          if (pasteStartTime < effect.endTime && (pasteStartTime + blockDuration) > effect.startTime) {
            pasteStartTime = effect.endTime + 100
          }
        }
        
        const newBlock: ZoomBlock = {
          ...zoomBlock,
          id: `zoom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          startTime: pasteStartTime,
          endTime: pasteStartTime + blockDuration
        }
        
        this.pastedCommand = new AddZoomBlockCommand(this.context, targetClipId, newBlock)
        const result = await this.pastedCommand.execute()
        
        if (result.success) {
          return {
            success: true,
            data: {
              type: 'effect',
              effectType: 'zoom',
              blockId: newBlock.id,
              clipId: targetClipId
            }
          }
        }
        return result as CommandResult<PasteResult>
      } else {
        // Paste cursor/background settings
        const effectType = clipboard.effect.type
        const effectData = clipboard.effect.data
        const store = this.context.getStore()
        
        // Find existing effect of this type and update it
        const existingEffects = store.getEffectsForClip(targetClipId)
        const existingEffect = existingEffects.find(e => e.type === effectType)
        
        if (existingEffect) {
          // Update existing effect
          store.updateEffect(existingEffect.id, {
            data: effectData
          })
        } else {
          // Create new effect if none exists
          store.addEffect({
            id: `${effectType}-${targetClipId}`,
            type: effectType as 'cursor' | 'background',
            clipId: targetClipId,
            startTime: 0,
            endTime: targetClip.duration,
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
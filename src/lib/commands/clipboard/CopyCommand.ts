import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export interface CopyResult {
  type: 'clip' | 'effect'
  clipId?: string
  effectType?: 'zoom' | 'cursor' | 'background'
  blockId?: string
}

export class CopyCommand extends Command<CopyResult> {
  constructor(
    private context: CommandContext,
    private clipId?: string
  ) {
    super({
      name: 'Copy',
      description: 'Copy selected clip or effect',
      category: 'clipboard'
    })
  }

  canExecute(): boolean {
    // Use provided clipId or get from selection
    const clipId = this.clipId || this.context.getSelectedClips()[0]
    if (!clipId) return false
    
    const result = this.context.findClip(clipId)
    return result !== null
  }

  doExecute(): CommandResult<CopyResult> {
    const store = this.context.getStore()
    const clipId = this.clipId || this.context.getSelectedClips()[0]
    
    if (!clipId) {
      return {
        success: false,
        error: 'No clip selected'
      }
    }

    const result = this.context.findClip(clipId)
    if (!result) {
      return {
        success: false,
        error: `Clip ${clipId} not found`
      }
    }

    const { clip } = result
    const selectedEffectLayer = this.context.getSelectedEffectLayer()

    // Copy effect if one is selected
    if (selectedEffectLayer) {
      const effects = store.getEffectsForClip(clipId)
      
      if (selectedEffectLayer.type === 'zoom' && selectedEffectLayer.id) {
        const zoomEffect = effects.find((e: any) => e.id === selectedEffectLayer.id && e.type === 'zoom')
        if (zoomEffect) {
          store.copyEffect('zoom', { ...zoomEffect.data }, clipId)
          return {
            success: true,
            data: {
              type: 'effect',
              effectType: 'zoom',
              blockId: selectedEffectLayer.id,
              clipId
            }
          }
        }
      } else {
        // Copy cursor or background settings
        const effect = effects.find((e: any) => e.type === selectedEffectLayer.type)
        if (effect) {
          store.copyEffect(selectedEffectLayer.type, { ...effect.data }, clipId)
          return {
            success: true,
            data: {
              type: 'effect',
              effectType: selectedEffectLayer.type,
              clipId
            }
          }
        }
      }
    }

    // Copy entire clip
    store.copyClip(clip)
    
    return {
      success: true,
      data: {
        type: 'clip',
        clipId
      }
    }
  }

  doUndo(): CommandResult<CopyResult> {
    // Copy is non-destructive, so undo just clears clipboard
    const store = this.context.getStore()
    store.clearClipboard()
    
    return {
      success: true,
      data: {
        type: 'clip'
      }
    }
  }

  doRedo(): CommandResult<CopyResult> {
    // Re-execute the copy
    return this.doExecute()
  }
}
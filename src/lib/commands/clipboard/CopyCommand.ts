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
    const selectedEffectLayer = this.context.getSelectedEffectLayer()
    
    // If a zoom effect is selected (timeline-global), we can copy it without a clip
    if (selectedEffectLayer?.type === 'zoom' && selectedEffectLayer.id) {
      return true
    }
    
    // Otherwise, check for clip selection
    const clipId = this.clipId || this.context.getSelectedClips()[0]
    if (!clipId) return false
    
    const result = this.context.findClip(clipId)
    return result !== null
  }

  doExecute(): CommandResult<CopyResult> {
    const store = this.context.getStore()
    const selectedEffectLayer = this.context.getSelectedEffectLayer()
    
    // Handle zoom effect copy (timeline-global, no clip needed)
    if (selectedEffectLayer?.type === 'zoom' && selectedEffectLayer.id) {
      const project = this.context.getProject()
      const zoomEffect = project?.timeline.effects?.find(e => e.id === selectedEffectLayer.id && e.type === 'zoom')
      
      if (zoomEffect) {
        // Copy the full zoom effect with timing information
        store.copyEffect('zoom', { 
          ...zoomEffect.data,
          startTime: zoomEffect.startTime,
          endTime: zoomEffect.endTime
        }, '') // Empty clipId since zoom is timeline-global
        
        return {
          success: true,
          data: {
            type: 'effect',
            effectType: 'zoom',
            blockId: selectedEffectLayer.id,
            clipId: ''
          }
        }
      }
    }
    
    // Handle clip-based copying
    const clipId = this.clipId || this.context.getSelectedClips()[0]
    
    if (!clipId) {
      return {
        success: false,
        error: 'No clip or effect selected'
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

    // Copy other effect types that might still be clip-based
    if (selectedEffectLayer && selectedEffectLayer.type !== 'zoom') {
      const effects = store.getEffectsAtTimeRange(clipId)
      
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
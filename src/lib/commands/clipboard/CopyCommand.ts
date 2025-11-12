import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import { EffectLayerType } from '@/types/effects'
import { EffectType } from '@/types'

export interface CopyResult {
  type: 'clip' | 'effect'
  clipId?: string
  effectType?: EffectType.Zoom | EffectType.Cursor | EffectType.Background
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
    
    // If a zoom effect is selected (recording-scoped), we can copy it without needing a specific clip
    if (selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer.id) {
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

    // Handle zoom effect copy (recording-scoped)
    if (selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer.id) {
      console.log('[CopyCommand] Copying zoom effect:', selectedEffectLayer.id)
      const project = this.context.getProject()

      // Find zoom effect in recording.effects
      let zoomEffect = null
      for (const recording of project?.recordings || []) {
        zoomEffect = recording.effects?.find(e => e.id === selectedEffectLayer.id && e.type === EffectType.Zoom)
        if (zoomEffect) {
          console.log('[CopyCommand] Found zoom effect in recording:', recording.id)
          break
        }
      }

      if (zoomEffect) {
        console.log('[CopyCommand] Zoom effect data:', zoomEffect.data)
        // Copy just the zoom effect data
        store.copyEffect(EffectType.Zoom, zoomEffect.data as any, '')
        
        return {
          success: true,
          data: {
            type: 'effect',
            effectType: EffectType.Zoom,
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
    if (selectedEffectLayer && selectedEffectLayer.type !== EffectLayerType.Zoom) {
      const effects = store.getEffectsAtTimeRange(clipId)
      
      // Copy cursor or background settings
      const effect = effects.find((e: any) => e.type === selectedEffectLayer.type)
      if (effect) {
        const effectTypeMap = {
          [EffectLayerType.Cursor]: EffectType.Cursor,
          [EffectLayerType.Background]: EffectType.Background,
          [EffectLayerType.Zoom]: EffectType.Zoom
        }
        const mappedType = effectTypeMap[selectedEffectLayer.type as keyof typeof effectTypeMap]
        if (mappedType) {
          store.copyEffect(mappedType as EffectType.Zoom | EffectType.Cursor | EffectType.Background, effect.data as any, clipId)
        }
        return {
          success: true,
          data: {
            type: 'effect',
            effectType: selectedEffectLayer.type === EffectLayerType.Cursor ? EffectType.Cursor : 
                       selectedEffectLayer.type === EffectLayerType.Background ? EffectType.Background : 
                       EffectType.Zoom,
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
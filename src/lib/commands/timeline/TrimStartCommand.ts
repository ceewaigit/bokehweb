import { Command, CommandResult } from '../base/Command'
import { CommandContext, calculateTimelineDuration } from '../base/CommandContext'
import type { Clip } from '@/types/project'

export class TrimStartCommand extends Command<{ clipId: string }> {
  private originalClip?: Clip
  private trimTime: number

  constructor(
    private context: CommandContext,
    private clipId: string,
    trimTime: number
  ) {
    super({
      name: 'TrimStart',
      description: `Trim start of clip ${clipId}`,
      category: 'timeline'
    })
    this.trimTime = trimTime
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    if (!result) return false
    
    const { clip } = result
    // Can't trim beyond clip bounds
    return this.trimTime > clip.startTime && this.trimTime < clip.startTime + clip.duration
  }

  doExecute(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    const result = this.context.findClip(this.clipId)
    
    if (!result) {
      return {
        success: false,
        error: `Clip ${this.clipId} not found`
      }
    }

    const { clip } = result
    
    // Validate trim position
    if (this.trimTime <= clip.startTime || this.trimTime >= clip.startTime + clip.duration) {
      return {
        success: false,
        error: 'Invalid trim position'
      }
    }
    
    // Store original state for undo
    this.originalClip = JSON.parse(JSON.stringify(clip))
    
    // Calculate trim amount
    const trimAmount = this.trimTime - clip.startTime
    
    // Apply trim using store method
    store.trimClipStart(this.clipId, this.trimTime)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.originalClip) {
      return {
        success: false,
        error: 'No original clip data to restore'
      }
    }

    const store = this.context.getStore()
    
    // Restore original clip properties
    store.updateClip(this.clipId, {
      startTime: this.originalClip.startTime,
      duration: this.originalClip.duration,
      sourceIn: this.originalClip.sourceIn,
      sourceOut: this.originalClip.sourceOut
    })

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    
    // Re-apply the trim
    store.trimClipStart(this.clipId, this.trimTime)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}
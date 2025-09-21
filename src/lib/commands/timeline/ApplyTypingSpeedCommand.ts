import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip } from '@/types/project'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'

/**
 * Command to apply typing speed suggestions to clips.
 * Uses the store's applyTypingSpeedToClip method for atomic operations.
 */
export class ApplyTypingSpeedCommand extends Command<{ 
  applied: number // number of clips affected
}> {
  private originalClips: Clip[] = []
  private affectedClips: string[] = []
  private trackId: string = ''

  constructor(
    private context: CommandContext,
    private sourceClipId: string,
    private periods: TypingPeriod[]
  ) {
    super({
      name: 'ApplyTypingSpeed',
      description: `Apply typing speed suggestions`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.sourceClipId)
    return !!result && this.periods.length > 0
  }

  doExecute(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    
    // Find and save track ID for undo
    const sourceResult = this.context.findClip(this.sourceClipId)
    if (!sourceResult) {
      return { success: false, error: `Clip ${this.sourceClipId} not found` }
    }
    this.trackId = sourceResult.track.id

    try {
      // Use the new atomic store method
      const result = store.applyTypingSpeedToClip(this.sourceClipId, this.periods)
      
      // Save state for undo
      this.originalClips = result.originalClips
      this.affectedClips = result.affectedClips

      console.log('[ApplyTypingSpeedCommand] Applied typing speed:', {
        clipId: this.sourceClipId,
        periods: this.periods.length,
        affectedClips: this.affectedClips.length
      })

      return {
        success: true,
        data: { applied: this.affectedClips.length }
      }
    } catch (error) {
      console.error('[ApplyTypingSpeedCommand] Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply typing speed'
      }
    }
  }

  doUndo(): CommandResult<{ applied: number }> {
    const store = this.context.getStore()
    const project = store.currentProject
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const track = project.timeline.tracks.find(t => t.id === this.trackId)
    if (!track || this.originalClips.length === 0) {
      return { success: false, error: 'Cannot undo: missing track or original state' }
    }

    // Find the modified clip
    const modifiedClipIndex = track.clips.findIndex(c => 
      this.affectedClips.includes(c.id)
    )

    if (modifiedClipIndex === -1) {
      return { success: false, error: 'Cannot undo: modified clip not found' }
    }

    // Restore the original clip (without time remap periods)
    track.clips[modifiedClipIndex] = this.originalClips[0]

    // Trigger reflow to update timeline
    const reflowClips = require('../../timeline/timeline-operations').reflowClips
    reflowClips(track, 0, project)

    return {
      success: true,
      data: { applied: 0 }
    }
  }

  doRedo(): CommandResult<{ applied: number }> {
    // Re-execute with the same parameters
    return this.doExecute()
  }
}
import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Clip, Track } from '@/types/project'

export class RemoveClipCommand extends Command<{ clipId: string }> {
  private clip?: Clip
  private track?: Track
  private clipIndex?: number
  private wasSelected: boolean = false

  constructor(
    private context: CommandContext,
    private clipId: string
  ) {
    super({
      name: 'RemoveClip',
      description: `Remove clip ${clipId}`,
      category: 'timeline'
    })
  }

  canExecute(): boolean {
    const result = this.context.findClip(this.clipId)
    return result !== null
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

    // Store clip data for undo
    this.clip = { ...result.clip }
    this.track = result.track
    this.clipIndex = result.track.clips.indexOf(result.clip)
    this.wasSelected = this.context.getSelectedClips().includes(this.clipId)

    // Remove using store method
    store.removeClip(this.clipId)

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doUndo(): CommandResult<{ clipId: string }> {
    if (!this.clip || !this.track || this.clipIndex === undefined) {
      return {
        success: false,
        error: 'Cannot undo: missing clip data'
      }
    }

    const store = this.context.getStore()
    const project = this.context.getProject()
    
    if (!project) {
      return {
        success: false,
        error: 'No active project'
      }
    }

    // Find the track in current project
    const currentTrack = project.timeline.tracks.find(t => t.id === this.track!.id)
    if (!currentTrack) {
      return {
        success: false,
        error: 'Track no longer exists'
      }
    }

    // Re-insert clip at original position
    currentTrack.clips.splice(this.clipIndex, 0, this.clip)

    // Update timeline duration
    const maxEndTime = Math.max(
      project.timeline.duration,
      this.clip.startTime + this.clip.duration
    )
    project.timeline.duration = maxEndTime

    // Restore selection if it was selected
    if (this.wasSelected) {
      store.selectClip(this.clipId)
    }

    // Mark project as modified
    project.modifiedAt = new Date().toISOString()

    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }

  doRedo(): CommandResult<{ clipId: string }> {
    const store = this.context.getStore()
    store.removeClip(this.clipId)
    
    return {
      success: true,
      data: { clipId: this.clipId }
    }
  }
}
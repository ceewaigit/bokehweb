/**
 * Command to apply typing speed-up to all clips in the timeline that have detected typing
 * This is a composite command that groups multiple ApplyTypingSpeedCommand operations
 */

import { Command } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Project, Clip, Track } from '@/types/project'
import { TypingDetector } from '@/lib/timeline/typing-detector'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'
import { ApplyTypingSpeedCommand } from './ApplyTypingSpeedCommand'

export class ApplyTypingSpeedToAllClipsCommand extends Command<{ affectedClips: string[] }> {
  private subCommands: ApplyTypingSpeedCommand[] = []
  private clipsProcessed: number = 0

  constructor(
    private context: CommandContext,
    description: string = 'Apply typing speed-up to all clips'
  ) {
    super({
      name: 'ApplyTypingSpeedToAllClips',
      description,
      category: 'typing-speedup'
    })
  }

  canExecute(): boolean {
    const project = this.context.getProject()
    if (!project) return false

    // Check if there are any clips that could have typing suggestions
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        // Skip clips that already have typing speed applied
        if (clip.typingSpeedApplied) continue

        const recording = project.recordings.find(r => r.id === clip.recordingId)
        if (recording?.metadata?.keyboardEvents?.length) {
          return true // At least one clip has potential typing data
        }
      }
    }
    return false
  }

  async doExecute(): Promise<{ success: boolean; data?: { affectedClips: string[] }; error?: string }> {
    const project = this.context.getProject()
    if (!project) {
      return { success: false, error: 'No project found' }
    }

    const allAffectedClips: string[] = []

    // Process each track
    for (const track of project.timeline.tracks) {
      // Process clips in reverse order to avoid index shifting issues
      // This ensures that when we split a clip, it doesn't affect the indices of clips we haven't processed yet
      const clipsToProcess = [...track.clips].reverse()

      for (const clip of clipsToProcess) {
        const recording = project.recordings.find(r => r.id === clip.recordingId)
        if (!recording || !recording.metadata) {
          continue
        }

        // Use cached typing detection
        const suggestions = TypingDetector.analyzeTyping(recording)

        // Cache results if not already cached (through store to handle Immer frozen objects)
        if (suggestions.periods.length > 0 && !recording.metadata?.detectedTypingPeriods) {
          this.context.getStore().cacheTypingPeriods(recording.id, suggestions.periods)
        }

        // Filter periods to only those within this clip's source range
        const clipSourceIn = clip.sourceIn || 0
        const clipSourceOut = clip.sourceOut || (clipSourceIn + clip.duration * (clip.playbackRate || 1))

        const clipTypingPeriods = suggestions.periods.filter(
          period => period.endTime > clipSourceIn && period.startTime < clipSourceOut
        )

        if (clipTypingPeriods.length === 0) {
          continue
        }

        // Create and execute a command for this clip
        const command = new ApplyTypingSpeedCommand(
          this.context,
          clip.id,
          clipTypingPeriods
        )

        const result = await command.execute()
        if (result.success) {
          allAffectedClips.push(...command.getAffectedClips())
          this.subCommands.push(command)
          this.clipsProcessed++
        }
      }
    }

    return {
      success: true,
      data: { affectedClips: allAffectedClips }
    }
  }

  async doUndo(): Promise<{ success: boolean; error?: string }> {
    // Undo in reverse order (LIFO) for proper state restoration
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      const result = await this.subCommands[i].undo()
      if (!result.success) {
        return {
          success: false,
          error: `Failed to undo sub-command ${i}: ${result.error}`
        }
      }
    }

    return { success: true }
  }

  async doRedo(): Promise<{ success: boolean; error?: string }> {
    // Redo in original order
    for (let i = 0; i < this.subCommands.length; i++) {
      const result = await this.subCommands[i].redo()
      if (!result.success) {
        return {
          success: false,
          error: `Failed to redo sub-command ${i}: ${result.error}`
        }
      }
    }

    return { success: true }
  }

  getClipsProcessed(): number {
    return this.clipsProcessed
  }
}

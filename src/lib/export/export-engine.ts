/**
 * Export Engine
 * Handles video export with effects
 */

import { ClientExportEngine } from './client-export'
import type { ExportSettings } from '@/types'
import type { Project } from '@/types/project'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
}

export class ExportEngine {
  private exporter: ClientExportEngine

  constructor() {
    this.exporter = new ClientExportEngine()
  }

  /**
   * Export project with all effects applied
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const videoClips = project.timeline.tracks
      .filter(track => track.type === 'video')
      .flatMap(track => track.clips)

    if (videoClips.length === 0) {
      throw new Error('No video clips to export')
    }

    return this.exporter.exportProject(project, settings, onProgress)
  }
}
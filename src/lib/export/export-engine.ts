/**
 * Export Engine - Simplified to use Remotion
 * All rendering is now handled by RemotionExportEngine
 */

import { RemotionExportEngine } from './remotion-export'
import type { ExportSettings } from '@/types'
import type { Project } from '@/types/project'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
}

export interface ExportOptions {
  format?: 'mp4' | 'webm' | 'gif' | 'mov'
  quality?: 'low' | 'medium' | 'high' | 'ultra'
  framerate?: number
  resolution?: { width: number; height: number }
  enableCursor?: boolean
  enableZoom?: boolean
  enableEffects?: boolean
  enableBackground?: boolean
  enableKeystrokes?: boolean
  background?: {
    type: 'solid' | 'gradient' | 'blur'
    color?: string
    gradient?: {
      colors: string[]
      angle?: number
    }
    padding?: number
    borderRadius?: number
    shadow?: boolean
  }
}

export class ExportEngine {
  private remotionExporter: RemotionExportEngine

  constructor() {
    this.remotionExporter = new RemotionExportEngine()
  }

  /**
   * Export project using Remotion
   * All effects and rendering handled by Remotion compositions
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const videoClips = project.timeline.tracks
      .filter(track => track.type === 'video')
      .flatMap(track => track.clips)

    if (videoClips.length === 0) {
      throw new Error('No video clips to export')
    }

    // Use Remotion export for all exports
    return this.remotionExporter.exportProject(project, settings, onProgress)
  }
}
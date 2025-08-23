/**
 * Export Engine
 * Handles video export with effects using FFmpeg
 */

import type { ExportSettings } from '@/types'
import type { Project } from '@/types/project'
import { globalBlobManager } from '../security/blob-url-manager'
import { RecordingStorage } from '../storage/recording-storage'
import { FFmpegExportEngine } from './ffmpeg-export'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
}

export class ExportEngine {
  private ffmpegEngine: FFmpegExportEngine

  constructor() {
    this.ffmpegEngine = new FFmpegExportEngine()
  }

  /**
   * Export project with effects using FFmpeg
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    try {
      onProgress?.({
        progress: 0,
        stage: 'preparing',
        message: 'Preparing export...'
      })

      const videoClips = project.timeline.tracks
        .filter(track => track.type === 'video')
        .flatMap(track => track.clips)

      if (videoClips.length === 0) {
        throw new Error('No video clips to export')
      }

      const firstClip = videoClips[0]
      const recording = project.recordings.find(r => r.id === firstClip.recordingId)
      
      if (!recording) {
        throw new Error('Recording not found')
      }

      // Get the video blob
      let videoBlob: Blob
      const blobUrl = RecordingStorage.getBlobUrl(recording.id)
      
      if (blobUrl) {
        const response = await fetch(blobUrl)
        videoBlob = await response.blob()
      } else {
        // Try to load it
        const videoUrl = await globalBlobManager.ensureVideoLoaded(
          recording.id,
          recording.filePath
        )
        if (!videoUrl) {
          throw new Error('Video not loaded')
        }
        const response = await fetch(videoUrl)
        videoBlob = await response.blob()
      }

      // Check if clip has effects to apply or needs cropping
      const captureArea = recording.metadata?.captureArea
      const needsCropping = captureArea && (
        captureArea.sourceType === 'window' || 
        captureArea.sourceId?.startsWith('area:')
      )
      
      const hasEffects = firstClip.effects && (
        firstClip.effects.zoom?.enabled ||
        firstClip.effects.background?.padding ||
        firstClip.effects.video?.cornerRadius
      )

      if (hasEffects || needsCropping) {
        // Export with effects and/or cropping using FFmpeg
        onProgress?.({
          progress: 5,
          stage: 'processing',
          message: needsCropping ? 'Preparing to crop and apply effects...' : 'Preparing to apply effects...'
        })

        return await this.ffmpegEngine.exportWithEffects(
          videoBlob,
          firstClip,
          settings,
          onProgress,
          captureArea?.fullBounds
        )
      } else {
        // No effects, return original video
        onProgress?.({
          progress: 100,
          stage: 'complete',
          message: 'Export complete!'
        })

        return videoBlob
      }
    } catch (error) {
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    }
  }
}
/**
 * Export Engine
 * Handles video export with effects using FFmpeg
 */

import type { ExportSettings } from '@/types'
import type { Project, Clip } from '@/types/project'
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
   * Handles multiple clips with gaps by filling with black frames
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
        .sort((a, b) => a.startTime - b.startTime) // Sort by start time

      if (videoClips.length === 0) {
        throw new Error('No video clips to export')
      }

      // Handle single clip or first clip of multiple
      const firstClip = videoClips[0]
      const recording = project.recordings.find(r => r.id === firstClip.recordingId)

      if (!recording) {
        throw new Error('Recording not found')
      }
      
      // Warn if there are multiple clips with gaps
      if (videoClips.length > 1) {
        // Check for gaps
        let hasGaps = false
        for (let i = 1; i < videoClips.length; i++) {
          const prevClip = videoClips[i - 1]
          const currClip = videoClips[i]
          const gap = currClip.startTime - (prevClip.startTime + prevClip.duration)
          if (gap > 10) { // More than 10ms gap
            hasGaps = true
            break
          }
        }
        
        if (hasGaps) {
          onProgress?.({
            progress: 5,
            stage: 'processing',
            message: '⚠️ Timeline has gaps. Exporting first clip only.'
          })
        }
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

        // Transform MouseEvent format to match FFmpeg's expected format
        const transformedMouseEvents = (recording.metadata?.mouseEvents || []).map(event => ({
          timestamp: event.timestamp,
          mouseX: event.x,
          mouseY: event.y,
          captureWidth: event.captureWidth,
          captureHeight: event.captureHeight
        }))

        return await this.ffmpegEngine.exportWithEffects(
          videoBlob,
          firstClip,
          settings,
          onProgress,
          captureArea?.fullBounds,
          transformedMouseEvents
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
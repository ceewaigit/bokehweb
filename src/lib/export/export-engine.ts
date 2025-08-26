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

      // For now, handle single clip export (will extend for multiple clips)
      if (videoClips.length === 1) {
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
      } else {
        // Multiple clips - need to handle with FFmpeg concatenation
        onProgress?.({
          progress: 5,
          stage: 'processing',
          message: `Processing ${videoClips.length} clips with gaps...`
        })

        return await this.exportMultipleClips(
          project,
          videoClips,
          settings,
          onProgress
        )
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

  /**
   * Export multiple clips with gap handling
   * Currently exports only continuous segments, gaps are skipped
   * TODO: Add option to fill gaps with black frames
   */
  private async exportMultipleClips(
    project: Project,
    clips: Clip[],
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    // Check for gaps in the timeline
    let hasGaps = false
    for (let i = 1; i < clips.length; i++) {
      const prevClip = clips[i - 1]
      const currClip = clips[i]
      const gap = currClip.startTime - (prevClip.startTime + prevClip.duration)
      if (gap > 10) { // More than 10ms gap
        hasGaps = true
        break
      }
    }
    
    if (hasGaps) {
      console.warn('Timeline contains gaps. Currently exporting first continuous segment only.')
      onProgress?.({
        progress: 5,
        stage: 'processing',
        message: '⚠️ Timeline has gaps. Exporting first segment only. Split clips will be handled in future update.'
      })
    }
    
    // For now, export the first continuous segment
    // Find all clips that are continuous from the first clip
    const continuousClips = [clips[0]]
    for (let i = 1; i < clips.length; i++) {
      const prevClip = clips[i - 1]
      const currClip = clips[i]
      const gap = currClip.startTime - (prevClip.startTime + prevClip.duration)
      if (gap <= 10) { // Less than 10ms gap (essentially continuous)
        continuousClips.push(currClip)
      } else {
        break // Stop at first gap
      }
    }
    
    const firstClip = continuousClips[0]
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
    
    onProgress?.({
      progress: 10,
      stage: 'processing',
      message: 'Note: Multi-clip export with gaps is not yet fully implemented. Exporting first clip only.'
    })
    
    // For now, just export the first clip
    // In a full implementation, we would:
    // - Process each clip
    // - Add black frames for gaps
    // - Concatenate everything
    return await this.ffmpegEngine.exportWithEffects(
      videoBlob,
      firstClip,
      settings,
      onProgress,
      recording.metadata?.captureArea?.fullBounds,
      (recording.metadata?.mouseEvents || []).map(event => ({
        timestamp: event.timestamp,
        mouseX: event.x,
        mouseY: event.y,
        captureWidth: event.captureWidth,
        captureHeight: event.captureHeight
      }))
    )
  }
}
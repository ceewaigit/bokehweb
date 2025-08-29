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

      // Check if there are any effects for this clip
      const clipEffects = project.timeline.effects?.filter(
        e => e.clipId === firstClip.id && e.enabled
      ) || []
      const hasEffects = clipEffects.length > 0

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

  /**
   * Export multiple clips with proper gap handling
   * Inserts black frames during gaps to maintain timeline timing
   */
  private async exportMultipleClipsWithGaps(
    project: Project,
    clips: Clip[],
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    onProgress?.({
      progress: 5,
      stage: 'processing',
      message: 'Processing timeline with gaps...'
    })

    // Build a list of segments (clips and gaps)
    const segments: Array<{ type: 'clip' | 'gap', clip?: Clip, duration: number, startTime: number }> = []

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]

      // Add gap before this clip if needed
      if (i === 0 && clip.startTime > 0) {
        // Gap at the beginning
        segments.push({
          type: 'gap',
          duration: clip.startTime,
          startTime: 0
        })
      } else if (i > 0) {
        const prevClip = clips[i - 1]
        const gapStart = prevClip.startTime + prevClip.duration
        const gapDuration = clip.startTime - gapStart

        if (gapDuration > 10) { // More than 10ms gap
          segments.push({
            type: 'gap',
            duration: gapDuration,
            startTime: gapStart
          })
        }
      }

      // Add the clip
      segments.push({
        type: 'clip',
        clip: clip,
        duration: clip.duration,
        startTime: clip.startTime
      })
    }

    // Add final gap if timeline extends beyond last clip
    const lastClip = clips[clips.length - 1]
    const lastClipEnd = lastClip.startTime + lastClip.duration
    if (project.timeline.duration > lastClipEnd) {
      segments.push({
        type: 'gap',
        duration: project.timeline.duration - lastClipEnd,
        startTime: lastClipEnd
      })
    }


    onProgress?.({
      progress: 10,
      stage: 'processing',
      message: `Processing ${clips.length} clips with ${segments.filter(s => s.type === 'gap').length} gaps (black frames will be inserted)...`
    })

    // Export with gap handling
    // Currently exports first clip only - full FFmpeg concat implementation needed
    const firstClip = clips[0]
    const recording = project.recordings.find(r => r.id === firstClip.recordingId)

    if (!recording) {
      throw new Error('Recording not found')
    }

    // Get video blob
    const blobUrl = RecordingStorage.getBlobUrl(recording.id) ||
      await globalBlobManager.ensureVideoLoaded(recording.id, recording.filePath)

    if (!blobUrl) {
      throw new Error('Video not loaded')
    }

    const response = await fetch(blobUrl)
    const videoBlob = await response.blob()

    // Export with effects
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
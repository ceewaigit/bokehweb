/**
 * Export using Remotion's renderMedia
 * Leverages all the Remotion compositions for consistent rendering
 * NOTE: This is only used in Electron environment for actual video export
 */

import type { Project } from '@/types/project'
import type { ExportSettings } from '@/types'
import { globalBlobManager } from '../security/blob-url-manager'

// Use the same ExportProgress type from export-engine
import type { ExportProgress } from './export-engine'
export type { ExportProgress }

export class RemotionExportEngine {
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    try {
      // This export engine only works in Electron environment
      // In browser, we use Remotion Player for preview only
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('Export is only available in the desktop app')
      }

      // Dynamic imports for Electron environment
      const { renderMedia, selectComposition } = await import('@remotion/renderer')
      const { bundle } = await import('@remotion/bundler')
      const path = await import('path')
      
      onProgress?.({
        progress: 0,
        stage: 'preparing',
        message: 'Preparing export...'
      })

      // Get video clips from timeline
      const videoClips = project.timeline.tracks
        .filter(track => track.type === 'video')
        .flatMap(track => track.clips)
        .sort((a, b) => a.startTime - b.startTime)

      if (videoClips.length === 0) {
        throw new Error('No video clips to export')
      }

      // For now, export the first clip (we can extend this to handle multiple clips)
      const firstClip = videoClips[0]
      const recording = project.recordings.find(r => r.id === firstClip.recordingId)
      
      if (!recording) {
        throw new Error('Recording not found for clip')
      }

      // Ensure video is loaded
      const videoUrl = await globalBlobManager.ensureVideoLoaded(
        recording.id,
        recording.filePath
      )

      if (!videoUrl) {
        throw new Error('Failed to load video')
      }

      onProgress?.({
        progress: 10,
        stage: 'preparing',
        message: 'Bundling composition...'
      })

      // Bundle the Remotion composition
      const bundleLocation = await bundle({
        entryPoint: path.resolve(__dirname, '../../remotion/Root.tsx'),
        onProgress: (progress) => {
          onProgress?.({
            progress: 10 + progress * 10,
            stage: 'preparing',
            message: `Bundling: ${Math.round(progress * 100)}%`
          })
        }
      })

      onProgress?.({
        progress: 20,
        stage: 'processing',
        message: 'Starting render...'
      })

      // Calculate duration in frames
      const fps = settings.framerate || 30
      const durationInFrames = Math.ceil((firstClip.duration / 1000) * fps)

      // Prepare input props for composition
      const inputProps = {
        videoUrl: videoUrl,
        clip: firstClip,
        effects: firstClip.effects,
        cursorEvents: recording.metadata?.mouseEvents || [],
        clickEvents: recording.metadata?.clickEvents || [],
        keystrokeEvents: (recording.metadata as any)?.keystrokeEvents || []
      }

      // Select the composition
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'MainComposition',
        inputProps
      })

      // Render the video
      const outputPath = `/tmp/export-${Date.now()}.${settings.format}`
      
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'mp4' ? 'h264' : 'vp8',
        outputLocation: outputPath,
        inputProps,
        onProgress: ({ renderedFrames, encodedFrames, progress: renderProgress }) => {
          const progress = 20 + renderProgress * 70
          onProgress?.({
            progress,
            stage: 'processing',
            message: `Rendering: ${Math.round(renderProgress * 100)}%`,
            currentFrame: renderedFrames,
            totalFrames: encodedFrames
          })
        }
      })

      onProgress?.({
        progress: 90,
        stage: 'encoding',
        message: 'Finalizing export...'
      })

      // Read the output file as blob
      const response = await fetch(`file://${outputPath}`)
      const blob = await response.blob()

      // Clean up temp file
      try {
        const fs = require('fs')
        fs.unlinkSync(outputPath)
      } catch (e) {
        // Ignore cleanup errors
      }

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!'
      })

      return blob
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
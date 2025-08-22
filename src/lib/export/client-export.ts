/**
 * Client-side export handler
 * Delegates actual export to Electron main process
 */

import type { Project } from '@/types/project'
import type { ExportSettings } from '@/types'
import { globalBlobManager } from '../security/blob-url-manager'
import type { ExportProgress } from './export-engine'

export class ClientExportEngine {
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    try {
      // In browser/client environment, we can only return the original video
      // Actual export with effects happens in Electron main process
      
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

      // Check if we're in Electron
      if (typeof window !== 'undefined' && window.electronAPI?.exportVideo) {
        // Use Electron API for export with effects
        onProgress?.({
          progress: 10,
          stage: 'processing',
          message: 'Processing video with effects...'
        })
        
        // Send export request to main process
        const result = await window.electronAPI.exportVideo({
          project,
          settings,
          videoPath: recording.filePath,
          effects: firstClip.effects
        })
        
        onProgress?.({
          progress: 100,
          stage: 'complete',
          message: 'Export complete!'
        })
        
        return new Blob([result], { type: `video/${settings.format}` })
      }

      // Fallback: return original video without effects
      const blobUrl = globalBlobManager.getBlobUrl(recording.id)
      if (!blobUrl) {
        throw new Error('Video not loaded')
      }

      onProgress?.({
        progress: 50,
        stage: 'processing',
        message: 'Loading video...'
      })

      const response = await fetch(blobUrl)
      const blob = await response.blob()

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete (without effects)'
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
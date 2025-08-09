import { create } from 'zustand'
import { ExportEngine, type ExportProgress, type ExportOptions } from '@/lib/export'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import type { ExportSettings, Project } from '@/types'

interface ExportStore {
  engine: ExportEngine | null
  isExporting: boolean
  progress: ExportProgress | null
  lastExport: Blob | null

  // Settings
  exportSettings: ExportSettings

  // Actions
  getEngine: () => ExportEngine
  updateSettings: (settings: Partial<ExportSettings>) => void
  exportProject: (project: Project) => Promise<void>
  exportAsGIF: (project: Project) => Promise<void>
  saveLastExport: (filename: string) => Promise<void>
  setPreset: (preset: string) => void
  reset: () => void
}

const defaultSettings: ExportSettings = {
  format: 'mp4',
  quality: 'high',
  resolution: { width: 1920, height: 1080 },
  framerate: 60,
  outputPath: ''
}

export const useExportStore = create<ExportStore>((set, get) => {
  let engine: ExportEngine | null = null

  const getEngine = () => {
    if (!engine && typeof window !== 'undefined') {
      engine = new ExportEngine()
    }
    if (!engine) {
      throw new Error('ExportEngine not available in SSR context')
    }
    return engine
  }

  return {
    engine: null,
    isExporting: false,
    progress: null,
    lastExport: null,
    exportSettings: defaultSettings,

    getEngine,

    updateSettings: (newSettings) => {
      set((state) => ({
        exportSettings: { ...state.exportSettings, ...newSettings }
      }))
    },

    exportProject: async (project) => {
      const { exportSettings } = get()

      set({ isExporting: true, progress: null, lastExport: null })

      try {
        // Get the first video clip from all tracks
        const videoClip = project.timeline.tracks
          .filter(track => track.type === 'video')
          .flatMap(track => track.clips)[0]

        if (!videoClip) {
          throw new Error('No video clips found in project')
        }

        // Check if we should use effects export by checking for metadata
        const metadata = typeof window !== 'undefined' ?
          RecordingStorage.getMetadata(videoClip.recordingId) : null
        const hasMetadata = !!metadata

        // Use unified export engine with appropriate options
        const engine = getEngine()

        const exportOptions: ExportOptions = {
          format: exportSettings.format as 'mp4' | 'webm' | 'gif' | 'mov',
          quality: exportSettings.quality as 'low' | 'medium' | 'high' | 'ultra',
          framerate: exportSettings.framerate,
          resolution: exportSettings.resolution,
          enableCursor: hasMetadata,
          enableZoom: hasMetadata,
          enableEffects: hasMetadata
        }

        const blob = await engine.exportProject(
          project,
          exportSettings,
          exportOptions,
          (progress) => set({
            progress: {
              ...progress,
              progress: Math.max(0, Math.min(100, progress.progress))
            }
          })
        )

        set({
          isExporting: false,
          lastExport: blob,
          progress: {
            progress: 100,
            stage: 'complete',
            message: 'Export complete!'
          }
        })

      } catch (error) {
        set({
          isExporting: false,
          progress: {
            progress: 0,
            stage: 'error',
            message: `Export failed: ${error}`
          }
        })
      }
    },

    exportAsGIF: async (project) => {
      const { exportSettings } = get()
      const engine = getEngine()

      set({ isExporting: true, progress: null, lastExport: null })

      try {
        // Get first video clip
        const videoClip = project.timeline.tracks
          .filter(track => track.type === 'video')
          .flatMap(track => track.clips)[0]

        if (!videoClip) {
          throw new Error('No video clips found')
        }

        const recording = project.recordings.find(r => r.id === videoClip.recordingId)
        if (!recording) {
          throw new Error('Recording not found')
        }

        // Get video blob
        let videoBlob: Blob
        const blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (blobUrl) {
          const response = await fetch(blobUrl)
          videoBlob = await response.blob()
        } else {
          throw new Error('No video source found')
        }

        const blob = await engine.exportAsGIF(
          videoBlob,
          {
            width: exportSettings.resolution.width,
            height: exportSettings.resolution.height,
            fps: 10
          },
          (progress) => set({
            progress: {
              ...progress,
              progress: Math.max(0, Math.min(100, progress.progress))
            }
          })
        )

        set({
          isExporting: false,
          lastExport: blob,
          progress: {
            progress: 100,
            stage: 'complete',
            message: 'GIF export complete!'
          }
        })

      } catch (error) {
        set({
          isExporting: false,
          progress: {
            progress: 0,
            stage: 'error',
            message: `GIF export failed: ${error}`
          }
        })
      }
    },

    saveLastExport: async (filename) => {
      const { lastExport } = get()
      if (lastExport && window.electronAPI?.saveRecording) {
        // Use Electron API to save file
        const buffer = await lastExport.arrayBuffer()
        await window.electronAPI.saveRecording(filename, buffer)
      } else if (lastExport) {
        // Browser download
        const url = URL.createObjectURL(lastExport)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
    },

    setPreset: (preset) => {
      // Define preset settings
      const presets: Record<string, Partial<ExportSettings>> = {
        'youtube-1080p': {
          format: 'mp4',
          quality: 'high',
          resolution: { width: 1920, height: 1080 },
          framerate: 60
        },
        'youtube-720p': {
          format: 'mp4',
          quality: 'medium',
          resolution: { width: 1280, height: 720 },
          framerate: 60
        },
        'twitter': {
          format: 'mp4',
          quality: 'medium',
          resolution: { width: 1280, height: 720 },
          framerate: 30
        },
        'instagram': {
          format: 'mp4',
          quality: 'medium',
          resolution: { width: 1080, height: 1080 },
          framerate: 30
        },
        'gif': {
          format: 'gif',
          quality: 'low',
          resolution: { width: 640, height: 360 },
          framerate: 10
        }
      }

      const presetSettings = presets[preset]
      if (presetSettings) {
        get().updateSettings(presetSettings)
      }
    },

    reset: () => {
      set({
        isExporting: false,
        progress: null,
        lastExport: null
      })
    }
  }
})
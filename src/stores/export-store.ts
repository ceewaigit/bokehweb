import { create } from 'zustand'
import { ExportEngine, type ExportProgress } from '@/lib/export'
import { EffectsExportEngine, type ExportOptions } from '@/lib/export/effects-export-engine'
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
  let effectsEngine: EffectsExportEngine | null = null

  const getEngine = () => {
    if (!engine && typeof window !== 'undefined') {
      engine = new ExportEngine()
    }
    if (!engine) {
      throw new Error('ExportEngine not available in SSR context')
    }
    return engine
  }

  const getEffectsEngine = () => {
    if (!effectsEngine && typeof window !== 'undefined') {
      effectsEngine = new EffectsExportEngine()
    }
    if (!effectsEngine) {
      throw new Error('EffectsExportEngine not available in SSR context')
    }
    return effectsEngine
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
        // Get the first video clip
        const videoClip = project.clips.find(c => c.type === 'video')

        if (!videoClip) {
          throw new Error('No video clips found in project')
        }

        // Check if we should use effects export
        const hasMetadata = typeof window !== 'undefined' &&
          localStorage.getItem(`clip-metadata-${videoClip.id}`)

        if (hasMetadata) {
          // Use effects export engine
          const effectsEngine = getEffectsEngine()
          const metadata = JSON.parse(localStorage.getItem(`clip-metadata-${videoClip.id}`) || '[]')

          // Fetch video blob
          const videoResponse = await fetch(videoClip.source)
          const videoBlob = await videoResponse.blob()

          const exportOptions: ExportOptions = {
            format: exportSettings.format as 'mp4' | 'webm' | 'gif',
            quality: exportSettings.quality as 'low' | 'medium' | 'high' | 'ultra',
            framerate: exportSettings.framerate,
            resolution: exportSettings.resolution,
            enableCursor: true,
            enableZoom: true,
            enableEffects: true
          }

          const blob = await effectsEngine.exportWithEffects(
            videoBlob,
            metadata,
            exportOptions,
            (progress) => set({
              progress: {
                progress: Math.max(0, Math.min(100, progress.progress)),
                stage: progress.phase as any, // Map phase to stage
                message: progress.message || ''
              }
            })
          )

          set({
            isExporting: false,
            lastExport: blob,
            progress: {
              progress: 100,
              stage: 'complete',
              message: 'Export complete with effects!'
            }
          })
        } else {
          // Fallback to basic export
          const engine = getEngine()
          const blob = await engine.exportProject(
            project,
            exportSettings,
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
        }

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
        const blob = await engine.exportAsGIF(
          project,
          { ...exportSettings, format: 'gif' },
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
      const engine = getEngine()
      if (lastExport) {
        await engine.saveFile(lastExport, filename)
      }
    },

    setPreset: (preset) => {
      const engine = getEngine()
      const presetSettings = engine.getPresetSettings(preset)
      get().updateSettings(presetSettings)
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
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RecordingEnhancementSettings } from '@/types/effects'

interface ConfigStore {
  // Recording Enhancement Settings
  enhancementSettings: RecordingEnhancementSettings
  updateEnhancementSettings: (settings: Partial<RecordingEnhancementSettings>) => void
  resetEnhancementSettings: () => void

  // UI Preferences
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void

  // Recording Defaults
  defaultCountdown: number
  setDefaultCountdown: (seconds: number) => void

  // Export Defaults
  defaultExportFormat: 'mp4' | 'mov' | 'webm' | 'gif'
  defaultExportQuality: 'low' | 'medium' | 'high' | 'lossless'
  setDefaultExportFormat: (format: 'mp4' | 'mov' | 'webm' | 'gif') => void
  setDefaultExportQuality: (quality: 'low' | 'medium' | 'high' | 'lossless') => void
}

const defaultEnhancementSettings: RecordingEnhancementSettings = {
  enableAutoZoom: true,
  zoomSensitivity: 1.0,
  maxZoom: 2.5,
  zoomSpeed: 1.0,
  showCursor: true,
  cursorSize: 1.5,
  cursorColor: '#ffffff',
  showClickEffects: true,
  clickEffectSize: 1.0,
  clickEffectColor: '#3b82f6',
  showCursorHighlight: false,
  highlightColor: '#3b82f6',
  motionSensitivity: 1.0,
  enableSmartPanning: true,
  panSpeed: 1.0,
  enableSmoothAnimations: true,
  animationQuality: 'balanced',
  showKeystrokes: false,
  keystrokePosition: 'bottom-right',
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      // Enhancement Settings
      enhancementSettings: defaultEnhancementSettings,

      updateEnhancementSettings: (settings) =>
        set((state) => ({
          enhancementSettings: {
            ...state.enhancementSettings,
            ...settings,
          },
        })),

      resetEnhancementSettings: () =>
        set({ enhancementSettings: defaultEnhancementSettings }),

      // UI Preferences
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Recording Defaults
      defaultCountdown: 3,
      setDefaultCountdown: (seconds) =>
        set({ defaultCountdown: Math.max(0, Math.min(10, seconds)) }),

      // Export Defaults
      defaultExportFormat: 'mp4',
      defaultExportQuality: 'high',
      setDefaultExportFormat: (format) => set({ defaultExportFormat: format }),
      setDefaultExportQuality: (quality) => set({ defaultExportQuality: quality }),
    }),
    {
      name: 'screen-studio-config',
      partialize: (state) => ({
        enhancementSettings: state.enhancementSettings,
        theme: state.theme,
        defaultCountdown: state.defaultCountdown,
        defaultExportFormat: state.defaultExportFormat,
        defaultExportQuality: state.defaultExportQuality,
      }),
    }
  )
)
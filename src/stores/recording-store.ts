import { create } from 'zustand'
import type { RecordingState, RecordingSettings } from '@/types'
import { logger } from '@/lib/utils/logger'

interface RecordingStore extends RecordingState {
  settings: RecordingSettings
  processingProgress: number | null
  countdownActive: boolean
  selectedDisplayId?: number

  // Core state setters
  setRecording: (isRecording: boolean) => void
  setPaused: (isPaused: boolean) => void
  setDuration: (duration: number) => void
  setStatus: (status: RecordingState['status']) => void
  setProcessingProgress: (progress: number | null) => void

  // Settings management
  updateSettings: (settings: Partial<RecordingSettings>) => void

  // Countdown management
  startCountdown: (onComplete: () => void, displayId?: number) => void

  // Recording workflow
  prepareRecording: (sourceId: string, displayId?: number) => void

  // Reset
  reset: () => void
}

const defaultSettings: RecordingSettings = {
  area: 'fullscreen',
  audioInput: 'system',
  quality: 'high',
  framerate: 60,
  format: 'webm',
  sourceId: undefined
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  status: 'idle',
  settings: defaultSettings,
  processingProgress: null,
  countdownActive: false,
  selectedDisplayId: undefined,

  setRecording: (isRecording) =>
    set((state) => ({
      isRecording,
      status: isRecording ? 'recording' : state.isPaused ? 'paused' : 'idle'
    })),

  setPaused: (isPaused) =>
    set((state) => ({
      isPaused,
      status: isPaused ? 'paused' : state.isRecording ? 'recording' : 'idle'
    })),

  setDuration: (duration) => set({ duration }),

  setStatus: (status) => set({ status }),

  setProcessingProgress: (progress) => set({ processingProgress: progress }),

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    })),


  startCountdown: (onComplete, displayId) => {
    set({ countdownActive: true })
    let count = 3

    // Hide the dock during countdown for cleaner experience
    window.electronAPI?.minimizeRecordButton?.()
    // Pass displayId to show countdown on the correct monitor
    window.electronAPI?.showCountdown?.(count, displayId)

    const countdownInterval = setInterval(() => {
      count--

      if (count <= 0) {
        clearInterval(countdownInterval)
        set({ countdownActive: false })

        // Hide countdown and show dock again
        window.electronAPI?.hideCountdown?.()
        window.electronAPI?.showRecordButton?.()

        // Execute callback
        onComplete()
      } else {
        // Update countdown display on the correct monitor
        window.electronAPI?.showCountdown?.(count, displayId)
      }
    }, 1000)
  },

  prepareRecording: (sourceId, displayId) => {
    const { updateSettings } = get()

    // Store the selected display ID
    set({ selectedDisplayId: displayId })

    // Determine recording area based on source ID
    if (sourceId.startsWith('area:')) {
      updateSettings({ area: 'region', sourceId })
    } else if (sourceId.startsWith('screen:')) {
      updateSettings({ area: 'fullscreen', sourceId })
    } else {
      updateSettings({ area: 'window', sourceId })
    }

    logger.debug('Recording prepared with source:', sourceId, 'displayId:', displayId)
  },

  reset: () => set({
    isRecording: false,
    isPaused: false,
    duration: 0,
    status: 'idle',
    settings: defaultSettings,
    processingProgress: null,
    countdownActive: false,
    selectedDisplayId: undefined
  })
}))
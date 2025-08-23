import { create } from 'zustand'
import type { RecordingState, RecordingSettings } from '@/types'

interface RecordingStore extends RecordingState {
  settings: RecordingSettings
  setRecording: (isRecording: boolean) => void
  setPaused: (isPaused: boolean) => void
  setDuration: (duration: number) => void
  setStatus: (status: RecordingState['status']) => void
  updateSettings: (settings: Partial<RecordingSettings>) => void
  reset: () => void
}

const defaultSettings: RecordingSettings = {
  area: 'fullscreen',
  audioInput: 'system',
  quality: 'high',
  framerate: 60,
  format: 'webm',
  sourceId: undefined  // Explicitly include sourceId
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  status: 'idle',
  settings: defaultSettings,

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

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    })),

  reset: () => set({
    isRecording: false,
    isPaused: false,
    duration: 0,
    status: 'idle',
    settings: defaultSettings
  })
}))
import { create } from 'zustand'
import type { Project } from '@/types/project'

export interface LibraryRecording {
  name: string
  path: string
  timestamp: Date
  project?: Project
  size?: number
  // NOTE: Thumbnails are intentionally treated as volatile UI state to avoid
  // retaining large data URLs for the entire library in memory.
  thumbnailUrl?: string
}

interface RecordingsStore {
  // Cached data
  recordings: LibraryRecording[]
  allRecordings: LibraryRecording[]
  currentPage: number
  isHydrated: boolean
  
  // Actions
  setRecordings: (recordings: LibraryRecording[]) => void
  setAllRecordings: (recordings: LibraryRecording[]) => void
  setCurrentPage: (page: number) => void
  updateRecording: (path: string, updates: Partial<LibraryRecording>) => void
  updateRecordingOnPage: (path: string, updates: Partial<LibraryRecording>) => void
  removeRecording: (path: string) => void
  setHydrated: (hydrated: boolean) => void
  reset: () => void
}

export const useRecordingsLibraryStore = create<RecordingsStore>((set) => ({
  recordings: [],
  allRecordings: [],
  currentPage: 1,
  isHydrated: false,
  
  setRecordings: (recordings) => set({ recordings }),
  setAllRecordings: (recordings) => set({ allRecordings: recordings }),
  setCurrentPage: (page) => set({ currentPage: page }),
  
  updateRecording: (path, updates) => set((state) => ({
    recordings: state.recordings.map(r => 
      r.path === path ? { ...r, ...updates } : r
    ),
    allRecordings: state.allRecordings.map(r =>
      r.path === path ? { ...r, ...updates } : r
    )
  })),

  updateRecordingOnPage: (path, updates) => set((state) => ({
    recordings: state.recordings.map(r =>
      r.path === path ? { ...r, ...updates } : r
    )
  })),

  removeRecording: (path) => set((state) => ({
    recordings: state.recordings.filter(r => r.path !== path),
    allRecordings: state.allRecordings.filter(r => r.path !== path)
  })),
  
  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  
  reset: () => set({
    recordings: [],
    allRecordings: [],
    currentPage: 1,
    isHydrated: false
  })
}))

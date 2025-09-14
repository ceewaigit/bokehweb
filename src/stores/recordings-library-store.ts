import { create } from 'zustand'
import type { Project } from '@/types/project'

export interface LibraryRecording {
  name: string
  path: string
  timestamp: Date
  project?: Project
  size?: number
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
  
  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  
  reset: () => set({
    recordings: [],
    allRecordings: [],
    currentPage: 1,
    isHydrated: false
  })
}))
import { create } from 'zustand'
import type { TimelineClip, Project, ProjectSettings } from '@/types'
import { parseProjectData, sanitizeProjectName } from '@/lib/security'

interface TimelineStore {
  project: Project | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  selectedClips: string[]
  
  // Actions
  setProject: (project: Project) => void
  setCurrentTime: (time: number) => void
  setPlaying: (isPlaying: boolean) => void
  setZoom: (zoom: number) => void
  addClip: (clip: TimelineClip) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void
  selectClip: (clipId: string, multi?: boolean) => void
  clearSelection: () => void
  createNewProject: (name: string) => void
}

const defaultProjectSettings: ProjectSettings = {
  resolution: { width: 1920, height: 1080 },
  framerate: 60,
  duration: 0,
  audioSampleRate: 48000
}

export const useTimelineStore = create<TimelineStore>((set, get) => {
  let playbackInterval: NodeJS.Timeout | null = null

  return {
    project: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 1,
    selectedClips: [],
    
    setProject: (project) => set({ project }),
    
    setCurrentTime: (currentTime) => set({ currentTime }),
    
    setPlaying: (isPlaying) => {
      set({ isPlaying })
      
      if (isPlaying) {
        // Start playback timer
        playbackInterval = setInterval(() => {
          const state = get()
          const project = state.project
          if (!project || !state.isPlaying) {
            return
          }
          
          const newTime = state.currentTime + 0.1 // 100ms increments
          const maxDuration = Math.max(
            project.settings.duration,
            ...project.clips.map(clip => clip.startTime + clip.duration)
          )
          
          if (newTime >= maxDuration) {
            // Stop at end
            set({ isPlaying: false, currentTime: maxDuration })
            if (playbackInterval) {
              clearInterval(playbackInterval)
              playbackInterval = null
            }
          } else {
            set({ currentTime: newTime })
          }
        }, 100)
      } else {
        // Stop playback timer
        if (playbackInterval) {
          clearInterval(playbackInterval)
          playbackInterval = null
        }
      }
    },
  
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  
  addClip: (clip) => set((state) => {
    if (!state.project) return state
    const updatedProject = {
      ...state.project,
      clips: [...state.project.clips, clip],
      updatedAt: new Date()
    }
    
    // Auto-save project to localStorage with validation
    if (typeof window !== 'undefined') {
      const existingProjects = parseProjectData(localStorage.getItem('screenstudio-projects') || '[]')
      const projectIndex = existingProjects.findIndex((p: Project) => p.id === updatedProject.id)
      if (projectIndex >= 0) {
        existingProjects[projectIndex] = updatedProject
      } else {
        existingProjects.unshift(updatedProject)
      }
      localStorage.setItem('screenstudio-projects', JSON.stringify(existingProjects))
    }
    
    return { project: updatedProject }
  }),
  
  removeClip: (clipId) => set((state) => {
    if (!state.project) return state
    const updatedProject = {
      ...state.project,
      clips: state.project.clips.filter(clip => clip.id !== clipId),
      updatedAt: new Date()
    }
    
    // Auto-save project to localStorage
    if (typeof window !== 'undefined') {
      const existingProjects = parseProjectData(localStorage.getItem('screenstudio-projects') || '[]')
      const projectIndex = existingProjects.findIndex((p: Project) => p.id === updatedProject.id)
      if (projectIndex >= 0) {
        existingProjects[projectIndex] = updatedProject
        localStorage.setItem('screenstudio-projects', JSON.stringify(existingProjects))
      }
    }
    
    return {
      project: updatedProject,
      selectedClips: state.selectedClips.filter(id => id !== clipId)
    }
  }),
  
  updateClip: (clipId, updates) => set((state) => {
    if (!state.project) return state
    const updatedProject = {
      ...state.project,
      clips: state.project.clips.map(clip => 
        clip.id === clipId ? { ...clip, ...updates } : clip
      ),
      updatedAt: new Date()
    }
    
    // Auto-save project to localStorage
    if (typeof window !== 'undefined') {
      const existingProjects = parseProjectData(localStorage.getItem('screenstudio-projects') || '[]')
      const projectIndex = existingProjects.findIndex((p: Project) => p.id === updatedProject.id)
      if (projectIndex >= 0) {
        existingProjects[projectIndex] = updatedProject
        localStorage.setItem('screenstudio-projects', JSON.stringify(existingProjects))
      }
    }
    
    return { project: updatedProject }
  }),
  
  selectClip: (clipId, multi = false) => set((state) => {
    if (multi) {
      const isSelected = state.selectedClips.includes(clipId)
      return {
        selectedClips: isSelected 
          ? state.selectedClips.filter(id => id !== clipId)
          : [...state.selectedClips, clipId]
      }
    }
    return { selectedClips: [clipId] }
  }),
  
  clearSelection: () => set({ selectedClips: [] }),
  
  createNewProject: (name) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: sanitizeProjectName(name),
      createdAt: new Date(),
      updatedAt: new Date(),
      clips: [],
      animations: [],
      settings: defaultProjectSettings
    }
    
    // Save to current project
    set({ project, selectedClips: [], currentTime: 0 })
    
    // Save to projects list in localStorage
    if (typeof window !== 'undefined') {
      const existingProjects = parseProjectData(localStorage.getItem('screenstudio-projects') || '[]')
      const updatedProjects = [project, ...existingProjects]
      localStorage.setItem('screenstudio-projects', JSON.stringify(updatedProjects))
    }
  }
  }
})
import { create } from 'zustand'

interface WorkspaceStore {
  // UI Layout State
  isPropertiesOpen: boolean
  isTimelineOpen: boolean
  isExportOpen: boolean

  // Modal State
  showProjectManager: boolean
  showWelcomeScreen: boolean

  // Panel Sizes
  propertiesPanelWidth: number
  timelineHeight: number

  // Workspace Actions
  toggleProperties: () => void
  toggleTimeline: () => void
  setExportOpen: (open: boolean) => void
  setShowProjectManager: (show: boolean) => void
  setShowWelcomeScreen: (show: boolean) => void
  setPropertiesPanelWidth: (width: number) => void
  setTimelineHeight: (height: number) => void

  // Workspace Presets
  loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => void
  resetWorkspace: () => void
}

const defaultWorkspaceState = {
  isPropertiesOpen: true,
  isTimelineOpen: true,
  isExportOpen: false,
  showProjectManager: false,
  showWelcomeScreen: false,
  propertiesPanelWidth: 400,
  timelineHeight: 200,
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  ...defaultWorkspaceState,

  toggleProperties: () => {
    set((state) => ({ isPropertiesOpen: !state.isPropertiesOpen }))
  },

  toggleTimeline: () => {
    set((state) => ({ isTimelineOpen: !state.isTimelineOpen }))
  },

  setExportOpen: (open: boolean) => {
    set({ isExportOpen: open })
  },

  setShowProjectManager: (show: boolean) => {
    set({ showProjectManager: show })
  },

  setShowWelcomeScreen: (show: boolean) => {
    set({ showWelcomeScreen: show })
  },

  setPropertiesPanelWidth: (width: number) => {
    set({ propertiesPanelWidth: Math.max(300, Math.min(600, width)) })
  },

  setTimelineHeight: (height: number) => {
    set({ timelineHeight: Math.max(150, Math.min(400, height)) })
  },

  loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => {
    switch (preset) {
      case 'minimal':
        set({
          isPropertiesOpen: false,
          isTimelineOpen: true,
          propertiesPanelWidth: 360,
          timelineHeight: 150,
        })
        break
      case 'standard':
        set({
          isPropertiesOpen: true,
          isTimelineOpen: true,
          propertiesPanelWidth: 400,
          timelineHeight: 200,
        })
        break
      case 'advanced':
        set({
          isPropertiesOpen: true,
          isTimelineOpen: true,
          propertiesPanelWidth: 400,
          timelineHeight: 300,
        })
        break
    }
  },

  resetWorkspace: () => {
    set(defaultWorkspaceState)
  },
}))
import { create } from 'zustand'
import { 
  type Project, 
  type Clip, 
  type Recording,
  type ClipEffects,
  type Track,
  createProject, 
  saveProject, 
  loadProject 
} from '@/types/project'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { logger } from '@/lib/utils/logger'

interface ProjectStore {
  // Current project
  currentProject: Project | null
  project: Project | null // Alias for backward compatibility
  
  // Playback state
  currentTime: number
  isPlaying: boolean
  zoom: number
  
  // Selection
  selectedClipId: string | null
  selectedClips: string[] // For multi-selection
  
  // Actions - Core
  newProject: (name: string) => void
  createNewProject: (name: string) => void // Alias for backward compatibility
  openProject: (projectPath: string) => Promise<void>
  saveCurrentProject: () => Promise<void>
  setProject: (project: Project) => void
  
  // Recording management
  addRecording: (recording: Recording, videoBlob: Blob) => void
  
  // Clip management - Enhanced
  addClip: (clip: Clip | string, startTime?: number) => void // Accept both Clip object or recordingId
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>) => void
  updateClipEffects: (clipId: string, effects: Partial<ClipEffects>) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  clearSelection: () => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null
  
  // Playback controls
  play: () => void
  pause: () => void
  setPlaying: (isPlaying: boolean) => void // Alias
  seek: (time: number) => void
  setCurrentTime: (time: number) => void // Alias
  setZoom: (zoom: number) => void
  
  // Get current clip and recording
  getCurrentClip: () => Clip | null
  getCurrentRecording: () => Recording | null
  getClipMetadata: (clipId: string) => any | null
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  currentProject: null,
  project: null, // Alias
  currentTime: 0,
  isPlaying: false,
  zoom: 1,
  selectedClipId: null,
  selectedClips: [],
  
  newProject: (name) => {
    const project = createProject(name)
    set({ 
      currentProject: project, 
      project: project, // Keep in sync
      selectedClipId: null,
      selectedClips: []
    })
    logger.info(`Created new project: ${name}`)
  },
  
  // Alias for backward compatibility
  createNewProject: (name) => {
    get().newProject(name)
  },
  
  setProject: (project) => {
    set({ 
      currentProject: project,
      project: project, // Keep in sync
      selectedClipId: null,
      selectedClips: []
    })
  },
  
  openProject: async (projectPath) => {
    try {
      const project = await loadProject(projectPath)
      set({ currentProject: project, selectedClipId: null })
      logger.info(`Opened project: ${project.name}`)
    } catch (error) {
      logger.error('Failed to open project:', error)
      throw error
    }
  },
  
  saveCurrentProject: async () => {
    const { currentProject } = get()
    if (!currentProject) return
    
    try {
      currentProject.modifiedAt = new Date().toISOString()
      await saveProject(currentProject)
      
      // Also save as .ssproj file if we have Electron
      if (window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()
        const fileName = `${currentProject.id}.ssproj`
        const filePath = `${recordingsDir}/${fileName}`
        const projectData = JSON.stringify(currentProject, null, 2)
        
        await window.electronAPI.saveRecording(
          filePath,
          new TextEncoder().encode(projectData).buffer
        )
        logger.info(`Project saved to: ${filePath}`)
      }
    } catch (error) {
      logger.error('Failed to save project:', error)
      throw error
    }
  },
  
  addRecording: (recording, videoBlob) => {
    set((state) => {
      if (!state.currentProject) return state
      
      const project = { ...state.currentProject }
      project.recordings.push(recording)
      
      // Automatically add a clip for the new recording
      const clip: Clip = {
        id: `clip-${Date.now()}`,
        recordingId: recording.id,
        startTime: project.timeline.duration,
        duration: recording.duration,
        sourceIn: 0,
        sourceOut: recording.duration,
        effects: {
          zoom: {
            enabled: true,
            keyframes: [],
            sensitivity: 1.0,
            maxZoom: 2.0,
            smoothing: 0.1
          },
          cursor: {
            visible: true,
            style: 'macOS',
            size: 1.2,
            color: '#ffffff',
            clickEffects: true,
            motionBlur: true
          },
          background: {
            type: 'gradient',
            gradient: {
              colors: ['#1a1a2e', '#0f0f1e'],
              angle: 135
            },
            padding: 40
          },
          video: {
            cornerRadius: 12,
            shadow: {
              enabled: true,
              blur: 40,
              color: '#000000',
              offset: { x: 0, y: 20 }
            }
          },
          annotations: []
        }
      }
      
      // Add to video track (first track should be video)
      const videoTrack = project.timeline.tracks.find(t => t.type === 'video')
      if (videoTrack) {
        videoTrack.clips.push(clip)
      } else {
        console.error('No video track found in project')
      }
      project.timeline.duration = Math.max(
        project.timeline.duration,
        clip.startTime + clip.duration
      )
      
      // Store video blob URL for preview
      const blobUrl = globalBlobManager.create(videoBlob, `recording-${recording.id}`)
      localStorage.setItem(`recording-blob-${recording.id}`, blobUrl)
      
      // Store metadata for effects rendering
      if (recording.metadata) {
        localStorage.setItem(
          `recording-metadata-${recording.id}`, 
          JSON.stringify(recording.metadata)
        )
      }
      
      project.modifiedAt = new Date().toISOString()
      
      return { 
        currentProject: project,
        selectedClipId: clip.id
      }
    })
  },
  
  addClip: (clipOrRecordingId, startTime) => {
    set((state) => {
      if (!state.currentProject) return state
      
      // Handle both Clip object and recordingId string
      if (typeof clipOrRecordingId === 'object') {
        // It's a Clip object, add it directly
        const clip = clipOrRecordingId as Clip
        const project = { ...state.currentProject }
        
        // Find the right track (default to first video track)
        const track = project.timeline.tracks.find(t => t.type === 'video') || project.timeline.tracks[0]
        if (track) {
          track.clips.push(clip)
          project.timeline.duration = Math.max(
            project.timeline.duration,
            clip.startTime + clip.duration
          )
          project.modifiedAt = new Date().toISOString()
        }
        
        return {
          currentProject: project,
          project: project,
          selectedClipId: clip.id,
          selectedClips: [clip.id]
        }
      }
      
      // It's a recordingId string, create a new clip
      const recordingId = clipOrRecordingId as string
      const recording = state.currentProject.recordings.find(r => r.id === recordingId)
      if (!recording) return state
      
      const project = { ...state.currentProject }
      const clip: Clip = {
        id: `clip-${Date.now()}`,
        recordingId,
        startTime: startTime ?? project.timeline.duration,
        duration: recording.duration,
        sourceIn: 0,
        sourceOut: recording.duration,
        effects: {
          zoom: {
            enabled: false,
            keyframes: [],
            sensitivity: 1.0,
            maxZoom: 2.0,
            smoothing: 0.1
          },
          cursor: {
            visible: true,
            style: 'default',
            size: 1.0,
            color: '#ffffff',
            clickEffects: false,
            motionBlur: false
          },
          background: {
            type: 'none',
            padding: 0
          },
          video: {
            cornerRadius: 0,
            shadow: {
              enabled: false,
              blur: 0,
              color: '#000000',
              offset: { x: 0, y: 0 }
            }
          },
          annotations: []
        }
      }
      
      // Add to video track (first track should be video)
      const videoTrack = project.timeline.tracks.find(t => t.type === 'video')
      if (videoTrack) {
        videoTrack.clips.push(clip)
      } else {
        console.error('No video track found in project')
      }
      project.timeline.duration = Math.max(
        project.timeline.duration,
        clip.startTime + clip.duration
      )
      project.modifiedAt = new Date().toISOString()
      
      return { 
        currentProject: project,
        selectedClipId: clip.id
      }
    })
  },
  
  removeClip: (clipId) => {
    set((state) => {
      if (!state.currentProject) return state
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.filter(clip => clip.id !== clipId)
      }))
      
      // Recalculate timeline duration
      let maxEndTime = 0
      project.timeline.tracks.forEach(track => {
        track.clips.forEach(clip => {
          maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
        })
      })
      project.timeline.duration = maxEndTime
      project.modifiedAt = new Date().toISOString()
      
      return { 
        currentProject: project,
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId
      }
    })
  },
  
  updateClipEffects: (clipId, effects) => {
    set((state) => {
      if (!state.currentProject) return state
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id === clipId) {
            return {
              ...clip,
              effects: {
                ...clip.effects,
                ...effects
              }
            }
          }
          return clip
        })
      }))
      project.modifiedAt = new Date().toISOString()
      
      return { currentProject: project }
    })
  },
  
  selectClip: (clipId, multi = false) => {
    set((state) => {
      if (!clipId) {
        return { selectedClipId: null, selectedClips: [] }
      }
      
      if (multi) {
        const isSelected = state.selectedClips.includes(clipId)
        const newSelection = isSelected
          ? state.selectedClips.filter(id => id !== clipId)
          : [...state.selectedClips, clipId]
        
        return {
          selectedClipId: newSelection[newSelection.length - 1] || null,
          selectedClips: newSelection
        }
      }
      
      return {
        selectedClipId: clipId,
        selectedClips: [clipId]
      }
    })
  },
  
  clearSelection: () => {
    set({ selectedClipId: null, selectedClips: [] })
  },
  
  updateClip: (clipId, updates) => {
    set((state) => {
      if (!state.currentProject) return state
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === clipId ? { ...clip, ...updates } : clip
        )
      }))
      project.modifiedAt = new Date().toISOString()
      
      return { currentProject: project, project: project }
    })
  },
  
  splitClip: (clipId, splitTime) => {
    set((state) => {
      if (!state.currentProject) return state
      
      let targetClip: Clip | undefined
      let targetTrack: Track | undefined
      
      for (const track of state.currentProject.timeline.tracks) {
        const clip = track.clips.find(c => c.id === clipId)
        if (clip) {
          targetClip = clip
          targetTrack = track
          break
        }
      }
      
      if (!targetClip || !targetTrack) return state
      
      // Ensure split time is within clip bounds
      if (splitTime <= targetClip.startTime || splitTime >= targetClip.startTime + targetClip.duration) {
        return state
      }
      
      const splitPoint = splitTime - targetClip.startTime
      
      // Create two new clips
      const firstClip: Clip = {
        ...targetClip,
        id: `${targetClip.id}-split1-${Date.now()}`,
        duration: splitPoint,
        sourceOut: targetClip.sourceIn + splitPoint
      }
      
      const secondClip: Clip = {
        ...targetClip,
        id: `${targetClip.id}-split2-${Date.now()}`,
        startTime: splitTime,
        duration: targetClip.duration - splitPoint,
        sourceIn: targetClip.sourceIn + splitPoint
      }
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => {
        if (track.id === targetTrack.id) {
          return {
            ...track,
            clips: track.clips
              .filter(c => c.id !== clipId)
              .concat([firstClip, secondClip])
              .sort((a, b) => a.startTime - b.startTime)
          }
        }
        return track
      })
      
      project.modifiedAt = new Date().toISOString()
      
      return {
        currentProject: project,
        project: project,
        selectedClipId: secondClip.id,
        selectedClips: [secondClip.id]
      }
    })
  },
  
  trimClipStart: (clipId, newStartTime) => {
    set((state) => {
      if (!state.currentProject) return state
      
      let targetClip: Clip | undefined
      for (const track of state.currentProject.timeline.tracks) {
        targetClip = track.clips.find(c => c.id === clipId)
        if (targetClip) break
      }
      
      if (!targetClip) return state
      
      // Ensure new start time is valid
      if (newStartTime >= targetClip.startTime + targetClip.duration || newStartTime < 0) {
        return state
      }
      
      const trimAmount = newStartTime - targetClip.startTime
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(c =>
          c.id === clipId
            ? {
                ...c,
                startTime: newStartTime,
                duration: c.duration - trimAmount,
                sourceIn: c.sourceIn + trimAmount
              }
            : c
        )
      }))
      
      project.modifiedAt = new Date().toISOString()
      return { currentProject: project, project: project }
    })
  },
  
  trimClipEnd: (clipId, newEndTime) => {
    set((state) => {
      if (!state.currentProject) return state
      
      let targetClip: Clip | undefined
      for (const track of state.currentProject.timeline.tracks) {
        targetClip = track.clips.find(c => c.id === clipId)
        if (targetClip) break
      }
      
      if (!targetClip) return state
      
      // Ensure new end time is valid
      if (newEndTime <= targetClip.startTime || newEndTime < 0) {
        return state
      }
      
      const newDuration = newEndTime - targetClip.startTime
      
      const project = { ...state.currentProject }
      project.timeline.tracks = project.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(c =>
          c.id === clipId
            ? {
                ...c,
                duration: newDuration,
                sourceOut: c.sourceIn + newDuration
              }
            : c
        )
      }))
      
      project.modifiedAt = new Date().toISOString()
      return { currentProject: project, project: project }
    })
  },
  
  duplicateClip: (clipId) => {
    const state = get()
    if (!state.currentProject) return null
    
    let targetClip: Clip | undefined
    let targetTrack: Track | undefined
    
    for (const track of state.currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        targetClip = clip
        targetTrack = track
        break
      }
    }
    
    if (!targetClip || !targetTrack) return null
    
    const newClip: Clip = {
      ...targetClip,
      id: `${targetClip.id}-copy-${Date.now()}`,
      startTime: targetClip.startTime + targetClip.duration + 0.1 // Add small gap
    }
    
    // Add the duplicated clip
    state.addClip(newClip)
    return newClip.id
  },
  
  play: () => {
    set({ isPlaying: true })
  },
  
  pause: () => {
    set({ isPlaying: false })
  },
  
  // Aliases for backward compatibility
  setPlaying: (isPlaying) => {
    set({ isPlaying })
  },
  
  seek: (time) => {
    set({ currentTime: Math.max(0, time) })
  },
  
  setCurrentTime: (time) => {
    set({ currentTime: Math.max(0, time) })
  },
  
  setZoom: (zoom) => {
    set({ zoom: Math.max(0.1, Math.min(10, zoom)) })
  },
  
  getCurrentClip: () => {
    const { currentProject, selectedClipId } = get()
    if (!currentProject || !selectedClipId) return null
    
    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId)
      if (clip) return clip
    }
    return null
  },
  
  getCurrentRecording: () => {
    const { currentProject } = get()
    const clip = get().getCurrentClip()
    if (!currentProject || !clip) return null
    
    return currentProject.recordings.find(r => r.id === clip.recordingId) || null
  },
  
  getClipMetadata: (clipId) => {
    const { currentProject } = get()
    if (!currentProject) return null
    
    // Find the clip
    let targetClip: Clip | null = null
    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        targetClip = clip
        break
      }
    }
    
    if (!targetClip) return null
    
    // Find the recording
    const recording = currentProject.recordings.find(r => r.id === targetClip.recordingId)
    if (!recording) return null
    
    // Return the metadata
    return recording.metadata
  }
}))
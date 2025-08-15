import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
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
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { SCREEN_STUDIO_CLIP_EFFECTS, DEFAULT_CLIP_EFFECTS } from '@/lib/constants/clip-defaults'
import { EffectsEngine } from '@/lib/effects/effects-engine'

interface ProjectStore {
  // State
  currentProject: Project | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  selectedClipId: string | null
  selectedClips: string[]

  // Core Actions
  newProject: (name: string) => void
  openProject: (projectPath: string) => Promise<void>
  saveCurrentProject: () => Promise<void>
  setProject: (project: Project) => void

  // Recording
  addRecording: (recording: Recording, videoBlob: Blob) => void

  // Clip Management
  addClip: (clip: Clip | string, startTime?: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>) => void
  updateClipEffects: (clipId: string, effects: Partial<ClipEffects>) => void
  updateZoomKeyframe: (clipId: string, keyframeIndex: number, newTime: number) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  clearSelection: () => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null

  // Playback
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setZoom: (zoom: number) => void

  // Getters
  getCurrentClip: () => Clip | null
  getCurrentRecording: () => Recording | null
}

// Inline helper functions
const findClipById = (project: Project, clipId: string): { clip: Clip; track: Track } | null => {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) return { clip, track }
  }
  return null
}

const calculateTimelineDuration = (project: Project): number => {
  let maxEndTime = 0
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
    }
  }
  return maxEndTime
}

const hasClipOverlap = (track: Track, clipId: string, startTime: number, duration: number): boolean => {
  return track.clips.some(clip => {
    if (clip.id === clipId) return false
    const clipEnd = clip.startTime + clip.duration
    return startTime < clipEnd && (startTime + duration) > clip.startTime
  })
}

const findNextValidPosition = (track: Track, clipId: string, desiredStart: number, duration: number): number => {
  const otherClips = track.clips
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime)

  for (const clip of otherClips) {
    const clipEnd = clip.startTime + clip.duration
    if (desiredStart < clipEnd && (desiredStart + duration) > clip.startTime) {
      return clipEnd + 1
    }
  }
  return desiredStart
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    currentProject: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 1.0,
    selectedClipId: null,
    selectedClips: [],

    newProject: (name) => {
      set((state) => {
        state.currentProject = createProject(name)
        state.selectedClipId = null
        state.selectedClips = []
      })
    },

    setProject: (project) => {
      set((state) => {
        state.currentProject = project
        state.selectedClipId = null
        state.selectedClips = []
      })
    },

    openProject: async (projectPath) => {
      try {
        const project = await loadProject(projectPath)

        // Load video files for preview
        for (const recording of project.recordings) {
          if (recording.filePath && window.electronAPI?.readLocalFile) {
            try {
              const result = await window.electronAPI.readLocalFile(recording.filePath)
              if (result?.success && result.data) {
                const videoBlob = new Blob([result.data], { type: 'video/webm' })
                const blobUrl = globalBlobManager.create(videoBlob, `recording-${recording.id}`)
                RecordingStorage.setBlobUrl(recording.id, blobUrl)
              }
            } catch (error) {
              console.error(`Failed to load video: ${recording.id}`, error)
            }
          }
          if (recording.metadata) {
            RecordingStorage.setMetadata(recording.id, recording.metadata)
          }
        }

        set((state) => {
          state.currentProject = project
          state.selectedClipId = null
        })
      } catch (error) {
        console.error('Failed to open project:', error)
        throw error
      }
    },

    saveCurrentProject: async () => {
      const { currentProject } = get()
      if (!currentProject) return

      try {
        currentProject.modifiedAt = new Date().toISOString()
        await saveProject(currentProject)
      } catch (error) {
        console.error('Failed to save project:', error)
        throw error
      }
    },

    addRecording: (recording, videoBlob) => {
      set((state) => {
        if (!state.currentProject) return

        // Ensure complete recording
        const completeRecording = {
          ...recording,
          metadata: recording.metadata || {
            mouseEvents: [],
            keyboardEvents: [],
            clickEvents: [],
            screenEvents: []
          }
        }

        state.currentProject.recordings.push(completeRecording)

        // Generate effects
        const effectsEngine = new EffectsEngine()
        const clipEffects = {
          ...SCREEN_STUDIO_CLIP_EFFECTS,
          zoom: {
            ...SCREEN_STUDIO_CLIP_EFFECTS.zoom,
            keyframes: effectsEngine.getZoomKeyframes(completeRecording)
          }
        }

        // Create and add clip
        const clip: Clip = {
          id: `clip-${Date.now()}`,
          recordingId: completeRecording.id,
          startTime: state.currentProject.timeline.duration,
          duration: recording.duration,
          sourceIn: 0,
          sourceOut: recording.duration,
          effects: clipEffects
        }

        const videoTrack = state.currentProject.timeline.tracks.find(t => t.type === 'video')
        if (videoTrack) {
          videoTrack.clips.push(clip)
        }

        state.currentProject.timeline.duration = Math.max(
          state.currentProject.timeline.duration,
          clip.startTime + clip.duration
        )

        // Store blob and metadata
        const blobUrl = globalBlobManager.create(videoBlob, `recording-${completeRecording.id}`)
        RecordingStorage.setBlobUrl(completeRecording.id, blobUrl)
        if (completeRecording.metadata) {
          RecordingStorage.setMetadata(completeRecording.id, completeRecording.metadata)
        }

        state.currentProject.modifiedAt = new Date().toISOString()
        state.selectedClipId = clip.id
        state.selectedClips = [clip.id]
      })
    },

    addClip: (clipOrRecordingId, startTime) => {
      set((state) => {
        if (!state.currentProject) return

        let clip: Clip
        
        if (typeof clipOrRecordingId === 'object') {
          clip = clipOrRecordingId
        } else {
          const recording = state.currentProject.recordings.find(r => r.id === clipOrRecordingId)
          if (!recording) return

          clip = {
            id: `clip-${Date.now()}`,
            recordingId: clipOrRecordingId,
            startTime: startTime ?? state.currentProject.timeline.duration,
            duration: recording.duration,
            sourceIn: 0,
            sourceOut: recording.duration,
            effects: DEFAULT_CLIP_EFFECTS
          }
        }

        const videoTrack = state.currentProject.timeline.tracks.find(t => t.type === 'video')
        if (videoTrack) {
          videoTrack.clips.push(clip)
        }

        state.currentProject.timeline.duration = Math.max(
          state.currentProject.timeline.duration,
          clip.startTime + clip.duration
        )
        state.currentProject.modifiedAt = new Date().toISOString()
        state.selectedClipId = clip.id
        state.selectedClips = [clip.id]
      })
    },

    removeClip: (clipId) => {
      set((state) => {
        if (!state.currentProject) return

        for (const track of state.currentProject.timeline.tracks) {
          const index = track.clips.findIndex(c => c.id === clipId)
          if (index !== -1) {
            track.clips.splice(index, 1)
            break
          }
        }

        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        if (state.selectedClipId === clipId) {
          state.selectedClipId = null
        }
        state.selectedClips = state.selectedClips.filter(id => id !== clipId)
      })
    },

    updateClip: (clipId, updates) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip, track } = result

        // Check for overlaps if position is changing
        if (updates.startTime !== undefined) {
          const duration = updates.duration || clip.duration
          if (hasClipOverlap(track, clipId, updates.startTime, duration)) {
            updates.startTime = findNextValidPosition(track, clipId, updates.startTime, duration)
          }
        }

        Object.assign(clip, updates)
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
      })
      
      // Auto-save after clip update (like when dragging)
      const { currentProject } = get()
      if (currentProject) {
        saveProject(currentProject).catch(err => 
          console.error('Failed to auto-save after clip update:', err)
        )
      }
    },

    updateClipEffects: (clipId, effects) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        // Deep merge the effects to preserve nested properties
        result.clip.effects = {
          ...result.clip.effects,
          ...effects
        }
        state.currentProject.modifiedAt = new Date().toISOString()
      })
      
      // Auto-save after effects update
      const { currentProject } = get()
      if (currentProject) {
        // Save asynchronously without blocking UI
        saveProject(currentProject).catch(err => 
          console.error('Failed to auto-save after effects update:', err)
        )
      }
    },
    
    updateZoomKeyframe: (clipId, keyframeIndex, newTime) => {
      set((state) => {
        if (!state.currentProject) return
        const result = findClipById(state.currentProject, clipId)
        if (!result) return
        
        const clip = result.clip
        if (!clip.effects?.zoom?.keyframes?.[keyframeIndex]) return
        
        // Update the keyframe time
        clip.effects.zoom.keyframes[keyframeIndex].time = newTime
        
        // Sort keyframes by time to maintain chronological order
        clip.effects.zoom.keyframes.sort((a, b) => a.time - b.time)
        
        state.currentProject.modifiedAt = new Date().toISOString()
      })
      
      // Auto-save after keyframe update
      const { currentProject } = get()
      if (currentProject) {
        saveProject(currentProject).catch(err => 
          console.error('Failed to auto-save after keyframe update:', err)
        )
      }
    },

    selectClip: (clipId, multi = false) => {
      set((state) => {
        if (!clipId) {
          state.selectedClipId = null
          state.selectedClips = []
          return
        }

        if (multi) {
          const index = state.selectedClips.indexOf(clipId)
          if (index !== -1) {
            state.selectedClips.splice(index, 1)
          } else {
            state.selectedClips.push(clipId)
          }
          state.selectedClipId = state.selectedClips[state.selectedClips.length - 1] || null
        } else {
          state.selectedClipId = clipId
          state.selectedClips = [clipId]
        }
      })
    },

    clearSelection: () => {
      set((state) => {
        state.selectedClipId = null
        state.selectedClips = []
      })
    },

    splitClip: (clipId, splitTime) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip, track } = result

        if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return

        const splitPoint = splitTime - clip.startTime

        const firstClip: Clip = {
          ...clip,
          id: `${clip.id}-split1-${Date.now()}`,
          duration: splitPoint,
          sourceOut: clip.sourceIn + splitPoint
        }

        const secondClip: Clip = {
          ...clip,
          id: `${clip.id}-split2-${Date.now()}`,
          startTime: splitTime,
          duration: clip.duration - splitPoint,
          sourceIn: clip.sourceIn + splitPoint
        }

        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        track.clips.splice(clipIndex, 1, firstClip, secondClip)

        state.currentProject.modifiedAt = new Date().toISOString()
        state.selectedClipId = secondClip.id
        state.selectedClips = [secondClip.id]
      })
    },

    trimClipStart: (clipId, newStartTime) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip } = result

        if (newStartTime >= clip.startTime + clip.duration || newStartTime < 0) return

        const trimAmount = newStartTime - clip.startTime
        clip.startTime = newStartTime
        clip.duration -= trimAmount
        clip.sourceIn += trimAmount

        state.currentProject.modifiedAt = new Date().toISOString()
      })
    },

    trimClipEnd: (clipId, newEndTime) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip } = result

        if (newEndTime <= clip.startTime || newEndTime < 0) return

        clip.duration = newEndTime - clip.startTime
        clip.sourceOut = clip.sourceIn + clip.duration

        state.currentProject.modifiedAt = new Date().toISOString()
      })
    },

    duplicateClip: (clipId) => {
      const state = get()
      if (!state.currentProject) return null

      const result = findClipById(state.currentProject, clipId)
      if (!result) return null

      const { clip } = result
      const newClip: Clip = {
        ...clip,
        id: `${clip.id}-copy-${Date.now()}`,
        startTime: clip.startTime + clip.duration + 0.1
      }

      state.addClip(newClip)
      return newClip.id
    },

    play: () => {
      const state = get()
      
      // If we're not on a clip, jump to the first clip or start of timeline
      if (!state.getCurrentClip() && state.currentProject) {
        const firstClip = state.currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .sort((a, b) => a.startTime - b.startTime)[0]
        
        if (firstClip) {
          // Jump to the start of the first clip
          state.seek(firstClip.startTime)
        } else if (state.currentTime >= state.currentProject.timeline.duration) {
          // If at the end, restart from beginning
          state.seek(0)
        }
      }
      
      set({ isPlaying: true })
    },
    pause: () => set({ isPlaying: false }),

    seek: (time) => {
      set((state) => {
        const maxTime = state.currentProject?.timeline?.duration || 0
        state.currentTime = Math.max(0, Math.min(maxTime, time))
      })
    },

    setZoom: (zoom) => {
      set((state) => {
        state.zoom = Math.max(0.1, Math.min(10, zoom))
      })
    },

    getCurrentClip: () => {
      const { currentProject, currentTime } = get()
      if (!currentProject) return null
      
      for (const track of currentProject.timeline.tracks) {
        const clip = track.clips.find(c =>
          currentTime >= c.startTime && currentTime < c.startTime + c.duration
        )
        if (clip) return clip
      }
      return null
    },

    getCurrentRecording: () => {
      const { currentProject } = get()
      const clip = get().getCurrentClip()
      if (!currentProject || !clip) return null
      return currentProject.recordings.find(r => r.id === clip.recordingId) || null
    }
  }))
)
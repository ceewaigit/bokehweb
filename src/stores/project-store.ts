import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  type Project,
  type Clip,
  type Recording,
  type Track,
  type ZoomBlock,
  type Effect,
  type ZoomEffectData,
  type BackgroundEffectData,
  type CursorEffectData
} from '@/types/project'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ZoomDetector } from '@/lib/effects/utils/zoom-detector'
import { RecordingStorage } from '@/lib/storage/recording-storage'

// Helper functions moved to top for better organization
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
  const GAP_BETWEEN_CLIPS = 100 // 100ms gap for better visual separation
  const otherClips = track.clips
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime)

  let currentPosition = desiredStart
  let foundOverlap = true

  // Keep checking until we find a position with no overlaps
  while (foundOverlap) {
    foundOverlap = false

    for (const clip of otherClips) {
      const clipEnd = clip.startTime + clip.duration
      // Check if current position would overlap with this clip
      if (currentPosition < clipEnd && (currentPosition + duration) > clip.startTime) {
        // Move to after this clip with a gap
        currentPosition = clipEnd + GAP_BETWEEN_CLIPS
        foundOverlap = true
        break // Start checking from beginning with new position
      }
    }
  }

  return currentPosition
}

// Store the animation frame ID outside the store to avoid serialization issues
let animationFrameId: number | null = null
let lastTimestamp: number | null = null

interface ProjectStore {
  // State
  currentProject: Project | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  zoomManuallyAdjusted: boolean
  
  // Playhead State (reactive - auto-updates with currentTime)
  playheadClip: Clip | null
  playheadRecording: Recording | null
  playheadEffects: Effect[]
  
  // Selection State
  selectedClipId: string | null
  selectedClips: string[]
  selectedEffectLayer: { type: 'zoom' | 'cursor' | 'background'; id?: string } | null
  clipboard: {
    clip?: Clip
    effect?: { type: 'zoom' | 'cursor' | 'background'; data: any; sourceClipId: string }
  }

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
  selectClip: (clipId: string | null, multi?: boolean) => void
  selectEffectLayer: (type: 'zoom' | 'cursor' | 'background', id?: string) => void
  clearEffectSelection: () => void
  clearSelection: () => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null

  // Clipboard
  copyClip: (clip: Clip) => void
  copyEffect: (type: 'zoom' | 'cursor' | 'background', data: any, sourceClipId: string) => void
  clearClipboard: () => void

  // Playback
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setZoom: (zoom: number, isManual?: boolean) => void
  setAutoZoom: (zoom: number) => void

  // Cleanup
  cleanupProject: () => void

  // Effects Management (timeline-global)
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsForClip: (clipId: string) => Effect[]
}

// Helper to update playhead state based on current time
const updatePlayheadState = (state: any) => {
  state.playheadClip = null
  state.playheadRecording = null
  state.playheadEffects = []
  
  if (state.currentProject && state.currentTime !== undefined) {
    console.log('updatePlayheadState: currentTime =', state.currentTime)
    
    // Find clip at current time
    for (const track of state.currentProject.timeline.tracks) {
      // Log all clips for debugging
      console.log('Checking track clips:', track.clips.map((c: Clip) => ({
        id: c.id,
        startTime: c.startTime,
        endTime: c.startTime + c.duration,
        duration: c.duration
      })))
      
      const clip = track.clips.find((c: Clip) =>
        state.currentTime >= c.startTime && state.currentTime < c.startTime + c.duration
      )
      
      if (clip) {
        console.log('Found clip at currentTime:', {
          clipId: clip.id,
          clipStart: clip.startTime,
          clipEnd: clip.startTime + clip.duration,
          currentTime: state.currentTime
        })
        state.playheadClip = clip
        state.playheadRecording = state.currentProject.recordings.find(
          (r: Recording) => r.id === clip.recordingId
        ) || null
        break
      }
    }
    
    if (!state.playheadClip) {
      console.log('No clip found at currentTime:', state.currentTime, '- should show black screen')
    }
    
    // Find effects active at current time (timeline-based, not clip-based)
    if (state.currentProject.timeline.effects) {
      const allEffects = state.currentProject.timeline.effects
      const filteredEffects = allEffects.filter(
        (e: Effect) => state.currentTime >= e.startTime && state.currentTime <= e.endTime && e.enabled
      )
      
      state.playheadEffects = filteredEffects
    }
  }
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    currentProject: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 0.5,
    zoomManuallyAdjusted: false,
    
    // Playhead State
    playheadClip: null,
    playheadRecording: null,
    playheadEffects: [],
    
    // Selection State
    selectedClipId: null,
    selectedClips: [],
    selectedEffectLayer: null,
    clipboard: {},

    newProject: (name) => {
      set((state) => {
        state.currentProject = RecordingStorage.createProject(name)
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
        state.zoomManuallyAdjusted = false
        state.currentTime = 0
        // Update playhead state
        updatePlayheadState(state)
      })
    },

    setProject: (project) => {
      set((state) => {
        state.currentProject = project
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
        state.zoomManuallyAdjusted = false
        state.currentTime = 0
        // Update playhead state based on current time
        updatePlayheadState(state)
      })
    },

    openProject: async (projectPath) => {
      try {
        // Load project from storage
        const data = RecordingStorage.getProject(projectPath)
        if (!data) throw new Error('Project not found')
        const project: Project = typeof data === 'string' ? JSON.parse(data) : data

        // Load all videos and metadata in one call
        await globalBlobManager.loadVideos(
          project.recordings.map((r: Recording) => ({
            id: r.id,
            filePath: r.filePath,
            metadata: r.metadata
          }))
        )

        set((state) => {
          state.currentProject = project
          state.selectedClipId = null
          state.zoomManuallyAdjusted = false
          state.currentTime = 0
          // Update playhead state
          updatePlayheadState(state)
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
        // Update modifiedAt through Immer's set function
        set((state) => {
          if (state.currentProject) {
            state.currentProject.modifiedAt = new Date().toISOString()
          }
        })

        // Get the updated project after the state change
        const updatedProject = get().currentProject
        if (updatedProject) {
          await RecordingStorage.saveProject(updatedProject)
        }
      } catch (error) {
        console.error('Failed to save project:', error)
        throw error
      }
    },

    addRecording: (recording, videoBlob) => {
      set((state) => {
        if (!state.currentProject) return

        // Recording must have proper metadata structure
        const completeRecording = recording

        state.currentProject.recordings.push(completeRecording)

        // Create and add clip (without effects)
        const clipId = `clip-${Date.now()}`
        const clip: Clip = {
          id: clipId,
          recordingId: completeRecording.id,
          startTime: state.currentProject.timeline.duration,
          duration: recording.duration,
          sourceIn: 0,
          sourceOut: recording.duration
        }

        // Generate and add zoom effects as separate entities
        const zoomDetector = new ZoomDetector()
        const zoomBlocks = zoomDetector.detectZoomBlocks(
          completeRecording.metadata?.mouseEvents || [],
          completeRecording.width || 1920,
          completeRecording.height || 1080,
          completeRecording.duration
        )

        // Initialize effects array if needed
        if (!state.currentProject.timeline.effects) {
          state.currentProject.timeline.effects = []
        }

        // Add zoom effects with absolute timeline positions
        zoomBlocks.forEach((block, index) => {
          const zoomEffect: Effect = {
            id: `zoom-${clipId}-${index}`,
            type: 'zoom',
            // Use absolute timeline positions
            startTime: clip.startTime + block.startTime,
            endTime: clip.startTime + block.endTime,
            data: {
              scale: block.scale,
              targetX: block.targetX,
              targetY: block.targetY,
              introMs: block.introMs || 300,
              outroMs: block.outroMs || 300,
              smoothing: 0.1
            } as ZoomEffectData,
            enabled: true
          }
          state.currentProject!.timeline.effects.push(zoomEffect)
        })

        // Check if global background effect exists, if not create one
        const existingBackground = state.currentProject.timeline.effects.find(e => e.type === 'background')
        if (!existingBackground) {
          const { getDefaultWallpaper } = require('@/lib/constants/default-effects')
          const defaultWallpaper = getDefaultWallpaper()
          
          console.log('Creating background effect in project store:', {
            hasWallpaper: !!defaultWallpaper,
            wallpaperLength: defaultWallpaper?.length || 0
          })

          const backgroundEffect: Effect = {
            id: `background-global`,
            type: 'background',
            // Cover entire timeline
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER, // Always cover entire timeline
            data: {
              type: 'wallpaper',
              gradient: {
                colors: ['#2D3748', '#1A202C'],
                angle: 135
              },
              wallpaper: defaultWallpaper,
              padding: 80,
              cornerRadius: 25,
              shadowIntensity: 85
            } as BackgroundEffectData,
            enabled: true
          }
          state.currentProject.timeline.effects.push(backgroundEffect)
        } else {
          const bgData = existingBackground.data as BackgroundEffectData;
          console.log('Background effect already exists:', {
            type: bgData?.type,
            hasWallpaper: !!bgData?.wallpaper,
            wallpaperLength: bgData?.wallpaper?.length || 0
          })
        }

        // Check if global cursor effect exists, if not create one
        const existingCursor = state.currentProject.timeline.effects.find(e => e.type === 'cursor')
        if (!existingCursor) {
          const cursorEffect: Effect = {
            id: `cursor-global`,
            type: 'cursor',
            // Cover entire timeline
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER, // Always cover entire timeline
            data: {
              style: 'macOS',
              size: 4.0,
              color: '#ffffff',
              clickEffects: true,
              motionBlur: true,
              hideOnIdle: true,
              idleTimeout: 3000
            } as CursorEffectData,
            enabled: true
          }
          state.currentProject.timeline.effects.push(cursorEffect)
        }

        const videoTrack = state.currentProject.timeline.tracks.find(t => t.type === 'video')
        if (videoTrack) {
          videoTrack.clips.push(clip)
        }

        state.currentProject.timeline.duration = Math.max(
          state.currentProject.timeline.duration,
          clip.startTime + clip.duration
        )

        // Create blob URL (automatically cached by the manager)
        globalBlobManager.create(videoBlob, `recording-${completeRecording.id}`)
        if (completeRecording.metadata) {
          globalBlobManager.storeMetadata(completeRecording.id, completeRecording.metadata)
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
            sourceOut: recording.duration
          }
        }

        const videoTrack = state.currentProject.timeline.tracks.find(t => t.type === 'video')
        if (videoTrack) {
          // Check for overlaps and find valid position if needed
          if (hasClipOverlap(videoTrack, '', clip.startTime, clip.duration)) {
            clip.startTime = findNextValidPosition(videoTrack, '', clip.startTime, clip.duration)
          }

          videoTrack.clips.push(clip)
        }

        state.currentProject.timeline.duration = Math.max(
          state.currentProject.timeline.duration,
          clip.startTime + clip.duration
        )
        state.currentProject.modifiedAt = new Date().toISOString()
        state.selectedClipId = clip.id
        state.selectedClips = [clip.id]
        
        // Update playhead state in case the new clip is at current time
        updatePlayheadState(state)
      })
    },

    removeClip: (clipId) => {
      set((state) => {
        if (!state.currentProject) return

        // Remove the clip from tracks
        for (const track of state.currentProject.timeline.tracks) {
          const index = track.clips.findIndex(c => c.id === clipId)
          if (index !== -1) {
            track.clips.splice(index, 1)
            break
          }
        }

        // Don't remove effects - they're timeline-global now
        // Effects persist independently of clips

        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        if (state.selectedClipId === clipId) {
          state.selectedClipId = null
        }
        state.selectedClips = state.selectedClips.filter(id => id !== clipId)
        
        // Update playhead state in case removed clip was at current time
        updatePlayheadState(state)
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
        
        // Update playhead state in case the updated clip affects current time
        updatePlayheadState(state)
      })

      // Removed auto-save - now requires explicit save action
    },


    selectClip: (clipId, multi = false) => {
      set((state) => {
        if (!clipId) {
          state.selectedClipId = null
          state.selectedClips = []
          state.selectedEffectLayer = null  // Clear effect selection when clearing clip
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
          state.selectedEffectLayer = null  // Clear effect selection when selecting new clip
        }
      })
    },

    selectEffectLayer: (type, id) => {
      set((state) => {
        state.selectedEffectLayer = { type, id }
      })
    },

    clearEffectSelection: () => {
      set((state) => {
        state.selectedEffectLayer = null
      })
    },

    clearSelection: () => {
      set((state) => {
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
      })
    },

    splitClip: (clipId, splitTime) => {
      set((state) => {
        if (!state.currentProject) {
          console.error('splitClip: No current project')
          return
        }

        const result = findClipById(state.currentProject, clipId)
        if (!result) {
          console.error('splitClip: Clip not found:', clipId)
          return
        }

        const { clip, track } = result

        if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
          console.error('splitClip: Invalid split time', {
            splitTime,
            clipStart: clip.startTime,
            clipEnd: clip.startTime + clip.duration
          })
          return
        }

        const splitPoint = splitTime - clip.startTime
        const timestamp = Date.now()

        // Create first clip - simple and clean
        const firstClip: Clip = {
          id: `${clip.id}-split1-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: clip.startTime,
          duration: splitPoint,
          sourceIn: clip.sourceIn,
          sourceOut: clip.sourceIn + splitPoint
        }

        // Create second clip
        const secondClip: Clip = {
          id: `${clip.id}-split2-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: splitTime,
          duration: clip.duration - splitPoint,
          sourceIn: clip.sourceIn + splitPoint,
          sourceOut: clip.sourceOut
        }

        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        track.clips.splice(clipIndex, 1, firstClip, secondClip)

        // Recalculate timeline duration after split
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
        // Select the left clip to keep focus at the split point
        // This ensures the preview shows the end of the left clip (at the split point)
        state.selectedClipId = firstClip.id
        state.selectedClips = [firstClip.id]
        
        // Update playhead state in case split affects current time
        updatePlayheadState(state)
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

        // Update clip timing
        clip.startTime = newStartTime
        clip.duration -= trimAmount
        clip.sourceIn += trimAmount

        // Recalculate timeline duration after trim
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
        
        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    trimClipEnd: (clipId, newEndTime) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip } = result

        if (newEndTime <= clip.startTime || newEndTime < 0) return

        const newDuration = newEndTime - clip.startTime

        // Update clip timing
        clip.duration = newDuration
        clip.sourceOut = clip.sourceIn + clip.duration

        // Recalculate timeline duration after trim
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
        
        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    duplicateClip: (clipId) => {
      const state = get()
      if (!state.currentProject) return null

      const result = findClipById(state.currentProject, clipId)
      if (!result) return null

      const { clip, track } = result

      // Start with position right after the original clip with proper gap
      let desiredStartTime = clip.startTime + clip.duration + 100 // 100ms gap

      // Check for overlaps and find next valid position
      if (hasClipOverlap(track, '', desiredStartTime, clip.duration)) {
        desiredStartTime = findNextValidPosition(track, '', desiredStartTime, clip.duration)
      }

      const newClip: Clip = {
        ...clip,
        id: `${clip.id}-copy-${Date.now()}`,
        startTime: desiredStartTime
      }

      state.addClip(newClip)
      
      // Don't duplicate effects - they're timeline-global now
      
      return newClip.id
    },

    copyClip: (clip) => {
      set((state) => {
        state.clipboard = { clip }
      })
    },

    copyEffect: (type, data, sourceClipId) => {
      set((state) => {
        state.clipboard = { effect: { type, data, sourceClipId } }
      })
    },

    clearClipboard: () => {
      set((state) => {
        state.clipboard = {}
      })
    },

    play: () => {
      const state = get()

      // If at the end of timeline, restart from beginning
      if (state.currentProject && state.currentTime >= state.currentProject.timeline.duration) {
        state.seek(0)
      }

      // Timeline should always play regardless of clip availability
      set({ isPlaying: true })

      // Start the unified playback loop
      lastTimestamp = null
      const animate = (timestamp: number) => {
        const state = get()
        if (!state.isPlaying || !state.currentProject) {
          animationFrameId = null
          return
        }

        if (lastTimestamp === null) {
          lastTimestamp = timestamp
        }

        const deltaTime = timestamp - lastTimestamp
        lastTimestamp = timestamp

        // Update current time
        const newTime = state.currentTime + deltaTime

        // Check if we've reached the end
        if (newTime >= state.currentProject.timeline.duration) {
          state.pause()
          state.seek(state.currentProject.timeline.duration)
        } else {
          // Update time - timeline continues regardless of clips
          state.seek(newTime)
          animationFrameId = requestAnimationFrame(animate)
        }
      }

      animationFrameId = requestAnimationFrame(animate)
    },

    pause: () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
        lastTimestamp = null
      }
      set({ isPlaying: false })
    },

    seek: (time) => {
      set((state) => {
        const maxTime = state.currentProject?.timeline?.duration || 0
        const clampedTime = Math.max(0, Math.min(maxTime, time))
        state.currentTime = clampedTime
        
        // Update playhead state using helper
        updatePlayheadState(state)
      })
    },

    setZoom: (zoom, isManual = true) => {
      set((state) => {
        state.zoom = Math.max(0.1, Math.min(10, zoom))
        if (isManual) {
          state.zoomManuallyAdjusted = true
        }
      })
    },

    setAutoZoom: (zoom) => {
      set((state) => {
        // Only set auto zoom if user hasn't manually adjusted
        if (!state.zoomManuallyAdjusted) {
          state.zoom = Math.max(0.1, Math.min(10, zoom))
        }
      })
    },



    cleanupProject: () => {
      // Clean up any playing state
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      lastTimestamp = null

      // Clean up blob resources
      globalBlobManager.cleanupByType('video')
      globalBlobManager.cleanupByType('export')
      globalBlobManager.cleanupByType('thumbnail')

      // Reset store state
      set((state) => {
        state.currentProject = null
        state.currentTime = 0
        state.isPlaying = false
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
        // Clear playhead state
        state.playheadClip = null
        state.playheadRecording = null
        state.playheadEffects = []
      })
    },

    // New: Independent Effects Management
    addEffect: (effect) => {
      set((state) => {
        if (!state.currentProject) return

        // Initialize effects array if it doesn't exist
        if (!state.currentProject.timeline.effects) {
          state.currentProject.timeline.effects = []
        }

        state.currentProject.timeline.effects.push(effect)
        state.currentProject.modifiedAt = new Date().toISOString()
      })
    },

    removeEffect: (effectId) => {
      set((state) => {
        if (!state.currentProject || !state.currentProject.timeline.effects) return

        const index = state.currentProject.timeline.effects.findIndex(e => e.id === effectId)
        if (index !== -1) {
          state.currentProject.timeline.effects.splice(index, 1)
          state.currentProject.modifiedAt = new Date().toISOString()
        }
      })
    },

    updateEffect: (effectId, updates) => {
      set((state) => {
        if (!state.currentProject || !state.currentProject.timeline.effects) return

        const effect = state.currentProject.timeline.effects.find(e => e.id === effectId)
        if (effect) {
          Object.assign(effect, updates)
          state.currentProject.modifiedAt = new Date().toISOString()
        }
      })
    },

    getEffectsForClip: (clipId) => {
      // No longer filtering by clipId - effects are timeline-global
      const { currentProject } = get()
      if (!currentProject?.timeline.effects) return []
      
      // Find the clip to get its time range
      let clip = null
      for (const track of currentProject.timeline.tracks) {
        clip = track.clips.find(c => c.id === clipId)
        if (clip) break
      }
      
      if (!clip) return []
      
      // Return effects that overlap with this clip's time range
      return currentProject.timeline.effects.filter(e => 
        e.startTime < clip.startTime + clip.duration && 
        e.endTime > clip.startTime
      )
    }
  }))
)
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

  // Getters
  getCurrentClip: () => Clip | null
  getCurrentRecording: () => Recording | null

  // Cleanup
  cleanupProject: () => void

  // New: Independent Effects Management
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsForClip: (clipId: string) => Effect[]
  duplicateEffectsForClip: (sourceClipId: string, targetClipId: string) => void
  adjustEffectsForClipChange: (clipId: string, changeType: 'split' | 'trim', params: any) => void
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    currentProject: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 0.5,
    zoomManuallyAdjusted: false,
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
      })
    },

    setProject: (project) => {
      set((state) => {
        state.currentProject = project
        state.selectedClipId = null
        state.selectedClips = []
        state.selectedEffectLayer = null
        state.zoomManuallyAdjusted = false
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

        // Add zoom effects as separate entities
        zoomBlocks.forEach((block, index) => {
          const zoomEffect: Effect = {
            id: `zoom-${clipId}-${index}`,
            type: 'zoom',
            clipId: clipId,
            startTime: block.startTime,
            endTime: block.endTime,
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

        // Add default background and cursor effects
        // Import default wallpaper if available
        const { getDefaultWallpaper } = require('@/lib/constants/default-effects')
        const defaultWallpaper = getDefaultWallpaper()
        
        const backgroundEffect: Effect = {
          id: `background-${clipId}`,
          type: 'background',
          clipId: clipId,
          startTime: 0,
          endTime: recording.duration,
          data: {
            type: 'wallpaper',
            gradient: {
              colors: ['#2D3748', '#1A202C'],
              angle: 135
            },
            wallpaper: defaultWallpaper,
            padding: 80
          } as BackgroundEffectData,
          enabled: true
        }
        state.currentProject.timeline.effects.push(backgroundEffect)

        const cursorEffect: Effect = {
          id: `cursor-${clipId}`,
          type: 'cursor',
          clipId: clipId,
          startTime: 0,
          endTime: recording.duration,
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

        // Remove all effects associated with this clip
        if (state.currentProject.timeline.effects) {
          state.currentProject.timeline.effects = state.currentProject.timeline.effects.filter(
            e => e.clipId !== clipId
          )
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

      // If we're not on a clip, jump to the first clip or start of timeline
      if (!state.getCurrentClip() && state.currentProject) {
        const firstClip = state.currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .sort((a, b) => a.startTime - b.startTime)[0]

        if (firstClip) {
          // Jump to the start of the first clip and select it
          state.seek(firstClip.startTime)
          state.selectClip(firstClip.id)
        } else if (state.currentTime >= state.currentProject.timeline.duration) {
          // If at the end, restart from beginning
          state.seek(0)
        }
      }

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
          // Update time and check for clip boundaries
          state.seek(newTime)

          // Check if we need to switch clips
          const currentClip = state.getCurrentClip()
          if (!currentClip && state.selectedClipId) {
            // We've moved past the current clip, find the next one
            const nextClip = state.currentProject.timeline.tracks
              .flatMap(t => t.clips)
              .filter(c => c.startTime >= newTime)
              .sort((a, b) => a.startTime - b.startTime)[0]

            if (nextClip) {
              state.selectClip(nextClip.id)
            }
          } else if (currentClip && currentClip.id !== state.selectedClipId) {
            // We've entered a new clip
            state.selectClip(currentClip.id)
          }

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

        // Auto-select clip at this time if not playing
        if (!state.isPlaying && state.currentProject) {
          const clipAtTime = state.currentProject.timeline.tracks
            .flatMap(t => t.clips)
            .find(c => clampedTime >= c.startTime && clampedTime < c.startTime + c.duration)

          if (clipAtTime && clipAtTime.id !== state.selectedClipId) {
            state.selectedClipId = clipAtTime.id
            state.selectedClips = [clipAtTime.id]
          }
        }
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
      const { currentProject } = get()
      if (!currentProject?.timeline.effects) return []

      return currentProject.timeline.effects.filter(e => e.clipId === clipId)
    },

    duplicateEffectsForClip: (sourceClipId, targetClipId) => {
      set((state) => {
        if (!state.currentProject) return

        // Initialize effects array if needed
        if (!state.currentProject.timeline.effects) {
          state.currentProject.timeline.effects = []
        }

        const sourceEffects = state.currentProject.timeline.effects.filter(
          e => e.clipId === sourceClipId
        )

        const duplicatedEffects = sourceEffects.map(effect => ({
          ...JSON.parse(JSON.stringify(effect)),
          id: `${effect.id}-copy-${Date.now()}`,
          clipId: targetClipId
        }))

        state.currentProject.timeline.effects.push(...duplicatedEffects)
        state.currentProject.modifiedAt = new Date().toISOString()
      })
    },

    adjustEffectsForClipChange: (clipId, changeType, params) => {
      set((state) => {
        if (!state.currentProject || !state.currentProject.timeline.effects) return

        const clipEffects = state.currentProject.timeline.effects.filter(
          e => e.clipId === clipId
        )

        if (changeType === 'split') {
          const { splitPoint, leftClipId, rightClipId } = params

          clipEffects.forEach(effect => {
            if (effect.endTime <= splitPoint) {
              // Effect stays with left clip
              effect.clipId = leftClipId
            } else if (effect.startTime >= splitPoint) {
              // Effect moves to right clip with adjusted timing
              effect.clipId = rightClipId
              effect.startTime -= splitPoint
              effect.endTime -= splitPoint
            } else {
              // Effect spans the split point - duplicate and adjust
              const leftEffect = JSON.parse(JSON.stringify(effect))
              leftEffect.id = `${effect.id}-left`
              leftEffect.clipId = leftClipId
              leftEffect.endTime = splitPoint

              const rightEffect = JSON.parse(JSON.stringify(effect))
              rightEffect.id = `${effect.id}-right`
              rightEffect.clipId = rightClipId
              rightEffect.startTime = 0
              rightEffect.endTime -= splitPoint

              // Remove original and add split versions
              const effects = state.currentProject!.timeline.effects!
              const index = effects.findIndex(e => e.id === effect.id)
              if (index !== -1) {
                effects.splice(index, 1, leftEffect, rightEffect)
              }
            }
          })
        } else if (changeType === 'trim') {
          const { side, trimAmount } = params

          if (side === 'start') {
            // Remove effects that are completely trimmed out
            // and adjust remaining effects
            clipEffects.forEach(effect => {
              if (effect.endTime <= trimAmount) {
                // Remove effect
                const index = state.currentProject!.timeline.effects!.findIndex(
                  e => e.id === effect.id
                )
                if (index !== -1) {
                  state.currentProject!.timeline.effects!.splice(index, 1)
                }
              } else {
                // Adjust timing
                effect.startTime = Math.max(0, effect.startTime - trimAmount)
                effect.endTime -= trimAmount
              }
            })
          } else {
            // Trim end - remove effects that start after new duration
            const { newDuration } = params

            clipEffects.forEach(effect => {
              if (effect.startTime >= newDuration) {
                // Remove effect
                const index = state.currentProject!.timeline.effects!.findIndex(
                  e => e.id === effect.id
                )
                if (index !== -1) {
                  state.currentProject!.timeline.effects!.splice(index, 1)
                }
              } else if (effect.endTime > newDuration) {
                // Trim effect end time
                effect.endTime = newDuration
              }
            })
          }
        }

        state.currentProject.modifiedAt = new Date().toISOString()
      })
    }
  }))
)
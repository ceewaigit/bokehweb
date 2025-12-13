import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip, Effect, Project, Recording, Track } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'
import type { ClipboardEffect } from '@/types/stores'
import type { SelectedEffectLayer, EffectLayerType } from '@/types/effects'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

// Import new services
import {
  findClipById,
  executeSplitClip,
  executeTrimClipStart,
  executeTrimClipEnd,
  updateClipInTrack,
  addClipToTrack,
  removeClipFromTrack,
  duplicateClipInTrack,
  addRecordingToProject,
  restoreClipToTrack,
  calculateTimelineDuration,
  reflowClips
} from '@/lib/timeline/timeline-operations'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { TypingSpeedApplicationService } from '@/lib/timeline/typing-speed-application'
import { PlayheadService, type PlayheadState } from '@/lib/timeline/playhead-service'
import { ProjectIOService } from '@/lib/storage/project-io-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { playbackService } from '@/lib/timeline/playback-service'

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
  nextClip: Clip | null
  nextRecording: Recording | null

  // Selection State
  selectedClipId: string | null
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: ClipboardEffect
  }

  // Settings
  settings: {
    showTypingSuggestions: boolean
  }

  // Core Actions
  newProject: (name: string) => void
  openProject: (projectPath: string) => Promise<void>
  saveCurrentProject: () => Promise<void>
  setProject: (project: Project) => void
  updateProjectData: (updater: (project: Project) => Project) => void

  // Recording
  addRecording: (recording: Recording, videoBlob: Blob) => Promise<void>

  // Clip Management
  addClip: (clip: Clip | string, startTime?: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean }) => void
  // New: Restore a removed clip back into a specific track and index
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  selectEffectLayer: (type: EffectLayerType, id?: string) => void
  clearEffectSelection: () => void
  clearSelection: () => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null
  reorderClip: (clipId: string, newIndex: number) => void

  // Clipboard
  copyClip: (clip: Clip) => void
  copyEffect: (type: EffectType.Zoom | EffectType.Cursor | EffectType.Background, data: any, sourceClipId: string) => void
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
  getEffectsAtTimeRange: (clipId: string) => Effect[]  // Gets effects overlapping with clip's time range

  // Settings
  updateSettings: (updates: Partial<ProjectStore['settings']>) => void

  // Typing Speed
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
  cacheTypingPeriods: (recordingId: string, periods: Array<{
    startTime: number
    endTime: number
    keyCount: number
    averageWpm: number
    suggestedSpeedMultiplier: number
  }>) => void

  // Atomic undo for typing speed - restores clips without intermediate reflows
  restoreClipsFromUndo: (trackId: string, clipIdsToRemove: string[], clipsToRestore: Clip[]) => void
}

// Helper to update playhead state using the new PlayheadService
const updatePlayheadState = (state: any) => {
  const prevState: PlayheadState = {
    playheadClip: state.playheadClip,
    playheadRecording: state.playheadRecording,
    nextClip: state.nextClip,
    nextRecording: state.nextRecording
  }

  const newState = PlayheadService.updatePlayheadState(
    state.currentProject,
    state.currentTime,
    prevState
  )

  state.playheadClip = newState.playheadClip
  state.playheadRecording = newState.playheadRecording
  state.nextClip = newState.nextClip
  state.nextRecording = newState.nextRecording
}

export const useProjectStore = create<ProjectStore>()(
  immer<ProjectStore>((set, get) => ({
    currentProject: null,
    currentTime: 0,
    isPlaying: false,
    zoom: 0.5,
    zoomManuallyAdjusted: false,

    // Playhead State
    playheadClip: null,
    playheadRecording: null,
    nextClip: null,
    nextRecording: null,

    // Selection State
    selectedClipId: null,
    selectedClips: [],
    selectedEffectLayer: null,
    clipboard: {},

    // Settings
    settings: {
      showTypingSuggestions: true
    },

    newProject: (name) => {
      set((state) => {
        state.currentProject = ProjectIOService.createNewProject(name)
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

      // Cache video URLs for all recordings to prevent repeated video-stream requests
      if (project.recordings && window.electronAPI?.getVideoUrl) {
        const electronAPI = window.electronAPI // capture reference
        project.recordings.forEach(async (recording) => {
          // Skip if already cached
          if (RecordingStorage.getBlobUrl(recording.id)) return

          try {
            const videoUrl = await electronAPI.getVideoUrl!(recording.filePath)
            if (videoUrl) {
              RecordingStorage.setBlobUrl(recording.id, videoUrl)
            }
          } catch (e) {
            console.warn('Failed to cache video URL for recording:', recording.id)
          }
        })
      }
    },

    updateProjectData: (updater) => {
      set((state) => {
        if (state.currentProject) {
          state.currentProject = updater(state.currentProject)
          state.currentProject.modifiedAt = new Date().toISOString()
        }
      })
    },

    openProject: async (projectPath) => {
      try {
        // Use ProjectIOService to load the project
        const project = await ProjectIOService.loadProject(projectPath)

        // Cache video URLs for all recordings BEFORE setting project
        // This prevents multiple video-stream requests during initial render
        if (project.recordings && window.electronAPI?.getVideoUrl) {
          const electronAPI = window.electronAPI // capture reference
          await Promise.all(project.recordings.map(async (recording) => {
            // Skip if already cached
            if (RecordingStorage.getBlobUrl(recording.id)) return

            try {
              const videoUrl = await electronAPI.getVideoUrl!(recording.filePath)
              if (videoUrl) {
                RecordingStorage.setBlobUrl(recording.id, videoUrl)
              }
            } catch (e) {
              console.warn('Failed to cache video URL for recording:', recording.id)
            }
          }))
        }

        set((state) => {
          state.currentProject = project
          state.selectedClipId = null
          state.selectedClips = []
          state.selectedEffectLayer = null
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
        // Use ProjectIOService to save the project
        await ProjectIOService.saveProject(currentProject)
      } catch (error) {
        console.error('Failed to save project:', error)
        throw error
      }
    },

    addRecording: async (recording, videoBlob) => {
      // Load metadata from chunks if needed
      if (recording.folderPath && recording.metadataChunks && (!recording.metadata || Object.keys(recording.metadata).length === 0)) {
        recording.metadata = await RecordingStorage.loadMetadataChunks(
          recording.folderPath,
          recording.metadataChunks
        )
        // Cache the loaded metadata
        RecordingStorage.setMetadata(recording.id, recording.metadata)
      }

      set((state) => {
        if (!state.currentProject) return

        // Use the service to add recording and create clip with effects
        const clip = addRecordingToProject(
          state.currentProject,
          recording,
          EffectsFactory.createInitialEffectsForRecording
        )

        if (clip) {
          // Create blob URL (automatically cached by the manager)
          globalBlobManager.create(videoBlob, `recording-${recording.id}`, 'video')

          state.selectedClipId = clip.id
          state.selectedClips = [clip.id]
        }
      })
    },

    addClip: (clipOrRecordingId, startTime) => {
      set((state) => {
        if (!state.currentProject) return

        const clip = addClipToTrack(state.currentProject, clipOrRecordingId, startTime)

        if (clip) {
          state.selectedClipId = clip.id
          state.selectedClips = [clip.id]

          // Update playhead state in case the new clip is at current time
          updatePlayheadState(state)
        }
      })
    },

    removeClip: (clipId) => {
      set((state) => {
        if (!state.currentProject) return

        if (removeClipFromTrack(state.currentProject, clipId)) {
          // Clear selection if removed clip was selected
          if (state.selectedClipId === clipId) {
            state.selectedClipId = null
          }
          state.selectedClips = state.selectedClips.filter(id => id !== clipId)

          // Update playhead state in case removed clip was at current time
          updatePlayheadState(state)
        }
      })
    },

    updateClip: (clipId, updates, options) => {
      set((state) => {
        if (!state.currentProject) return

        // Get clip info before update for playhead tracking
        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        // Use the service to update the clip
        if (!updateClipInTrack(state.currentProject, clipId, updates, options)) {
          console.error('updateClip: Failed to update clip')
          return
        }

        // Maintain playhead relative position inside the edited clip
        const updatedResult = findClipById(state.currentProject, clipId)
        if (updatedResult) {
          const newTime = PlayheadService.trackPlayheadDuringClipEdit(
            state.currentTime,
            result.clip,
            updatedResult.clip
          )
          if (newTime !== null) {
            state.currentTime = newTime
          }
        }

        // Clamp current time inside new timeline bounds to keep preview stable
        state.currentTime = PlayheadService.clampToTimelineBounds(
          state.currentTime,
          state.currentProject.timeline.duration
        )

        // Update playhead state in case the updated clip affects current time
        updatePlayheadState(state)
      })
    },

    // New: Restore a removed clip at a specific index within a track
    restoreClip: (trackId, clip, index) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to restore the clip
        if (!restoreClipToTrack(state.currentProject, trackId, clip, index)) {
          return
        }

        // Update playhead state
        updatePlayheadState(state)
      })
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

        // Note: splitTime is in timeline space (what user sees on UI)
        // executeSplitClip expects timeline-relative position, not clip-relative
        // The conversion to clip-relative happens inside executeSplitClip
        const result = executeSplitClip(state.currentProject, clipId, splitTime)
        if (!result) {
          return
        }

        const { firstClip } = result

        // Select the left clip to keep focus at the split point
        state.selectedClipId = firstClip.id
        state.selectedClips = [firstClip.id]

        // Move playhead to just before the split point to ensure we're in the first clip
        if (state.currentTime >= splitTime) {
          state.currentTime = splitTime - 1
        }

        // Update playhead state to reflect the current clip
        updatePlayheadState(state)
      })
    },

    trimClipStart: (clipId, newStartTime) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to execute the trim
        if (!executeTrimClipStart(state.currentProject, clipId, newStartTime)) {
          return
        }

        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    trimClipEnd: (clipId, newEndTime) => {
      set((state) => {
        if (!state.currentProject) return

        // Use the service to execute the trim
        if (!executeTrimClipEnd(state.currentProject, clipId, newEndTime)) {
          return
        }

        // Update playhead state in case trim affects current time
        updatePlayheadState(state)
      })
    },

    duplicateClip: (clipId) => {
      let newClipId: string | null = null

      set((state) => {
        if (!state.currentProject) return

        const newClip = duplicateClipInTrack(state.currentProject, clipId)
        if (!newClip) return

        newClipId = newClip.id

        // Select the duplicated clip
        state.selectedClipId = newClip.id
        state.selectedClips = [newClip.id]

        // Update playhead state in case duplication affects current time context
        updatePlayheadState(state)
      })

      return newClipId
    },

    reorderClip: (clipId, newIndex) => {
      set((state) => {
        if (!state.currentProject) return

        for (const track of state.currentProject.timeline.tracks) {
          const clipIndex = track.clips.findIndex(c => c.id === clipId)
          if (clipIndex !== -1 && clipIndex !== newIndex) {
            // Remove clip from current position
            const [clip] = track.clips.splice(clipIndex, 1)
            // No index adjustment needed - newIndex is already the absolute insertion point
            const adjustedIndex = newIndex
            // Insert at new position
            track.clips.splice(adjustedIndex, 0, clip)

            // Reflow all clips to ensure contiguity from time 0
            // Use skipSort: true to preserve the manual reorder we just performed
            reflowClips(track, 0, { skipSort: true })

            // Force new array reference to ensure all consumers get fresh data
            // This breaks any stale references in memoized contexts
            track.clips = [...track.clips]

            // Update timeline duration
            state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
            state.currentProject.modifiedAt = new Date().toISOString()

            // Update playhead state to reflect new clip positions
            updatePlayheadState(state)
            break
          }
        }
      })
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
      if (!state.currentProject) return

      set({ isPlaying: true })

      playbackService.play(
        state.currentTime,
        state.currentProject.timeline.duration,
        (newTime) => {
          set((state) => {
            state.currentTime = newTime
            updatePlayheadState(state)
          })
        },
        () => {
          set({ isPlaying: false })
        }
      )
    },

    pause: () => {
      playbackService.pause()
      set({ isPlaying: false })
    },

    seek: (time) => {
      set((state) => {
        const duration = state.currentProject?.timeline?.duration || 0
        state.currentTime = playbackService.seek(time, duration)

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
      // Clean up playback
      playbackService.cleanup()

      // Reset store state first so components unmount before we revoke blob URLs
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
      })

      // Use ProjectIOService to clean up resources
      ProjectIOService.cleanupProjectResources()
    },

    // New: Independent Effects Management
    addEffect: (effect) => {
      set((state) => {
        if (!state.currentProject) return
        EffectsFactory.addEffectToProject(state.currentProject, effect)
        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    removeEffect: (effectId) => {
      set((state) => {
        if (!state.currentProject) return
        EffectsFactory.removeEffectFromProject(state.currentProject, effectId)
        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    updateEffect: (effectId, updates) => {
      set((state) => {
        if (!state.currentProject) return

        // With Immer middleware, we can directly mutate the draft state
        // Immer will handle creating the immutable copy for us
        EffectsFactory.updateEffectInProject(state.currentProject, effectId, updates)

        // Update playhead state to refresh recording references
        updatePlayheadState(state)
      })
    },

    // Gets all effects that overlap with a clip's time range
    // Note: Effects are timeline-global, not clip-owned
    getEffectsAtTimeRange: (clipId) => {
      const { currentProject } = get()
      if (!currentProject) return []
      return EffectsFactory.getEffectsForClip(currentProject, clipId)
    },

    // Settings
    updateSettings: (updates) => {
      set((state) => {
        Object.assign(state.settings, updates)
      })
    },

    // Typing Speed - Apply typing speed suggestions to a clip
    applyTypingSpeedToClip: (clipId, periods) => {
      let result = { affectedClips: [] as string[], originalClips: [] as Clip[] }
      let clipBefore: { clip: Clip; track: Track } | null = null

      set((state) => {
        if (!state.currentProject) {
          console.error('applyTypingSpeedToClip: No current project')
          return
        }

        // Get clip before applying speed changes for playhead tracking
        clipBefore = findClipById(state.currentProject, clipId)
        if (!clipBefore) {
          console.error('applyTypingSpeedToClip: Clip not found:', clipId)
          return
        }

        // Apply typing speed within the mutable state
        result = TypingSpeedApplicationService.applyTypingSpeedToClip(
          state.currentProject,
          clipId,
          periods
        )

        // Update modified timestamp to trigger save button
        state.currentProject.modifiedAt = new Date().toISOString()

        // After typing speed application, ensure playhead is within valid range
        // The original clip was replaced with new clips (different IDs), so we can't use findClipById
        const newTimelineDuration = calculateTimelineDuration(state.currentProject)

        // If playhead is past the new timeline end, move it to the last valid position
        if (state.currentTime >= newTimelineDuration) {
          state.currentTime = Math.max(0, newTimelineDuration - 1)
        }

        // Always update playhead state to find the clip at current position
        updatePlayheadState(state)
      })

      return result
    },

    // Cache typing periods for a recording
    cacheTypingPeriods: (recordingId, periods) => {
      set((state) => {
        if (!state.currentProject) return

        // Find the recording in the project
        const recording = state.currentProject.recordings.find(r => r.id === recordingId)
        if (!recording) {
          console.warn('[ProjectStore] cacheTypingPeriods: Recording not found:', recordingId)
          return
        }

        // Ensure metadata exists
        if (!recording.metadata) {
          recording.metadata = {
            mouseEvents: [],
            keyboardEvents: [],
            clickEvents: [],
            screenEvents: []
          }
        }

        // Cache the typing periods (convert from TypingPeriod to ProjectTypingPeriod format)
        recording.metadata.detectedTypingPeriods = periods.map(p => ({
          startTime: p.startTime,
          endTime: p.endTime,
          keyCount: p.keyCount,
          averageWPM: p.averageWpm,
          suggestedSpeedMultiplier: p.suggestedSpeedMultiplier
        }))
      })
    },

    // Atomic undo for typing speed - removes affected clips and restores originals in ONE update
    // This prevents intermediate reflows that cause incorrect clip positions
    restoreClipsFromUndo: (trackId, clipIdsToRemove, clipsToRestore) => {
      set((state) => {
        if (!state.currentProject) return

        const track = state.currentProject.timeline.tracks.find(t => t.id === trackId)
        if (!track) return

        // Step 1: Remove all affected clips (the split/sped-up ones) in one pass
        track.clips = track.clips.filter(c => !clipIdsToRemove.includes(c.id))

        // Step 2: Add back original clips
        for (const clip of clipsToRestore) {
          track.clips.push({ ...clip })
        }

        // Step 3: Sort by startTime
        track.clips.sort((a, b) => a.startTime - b.startTime)

        // Step 4: Single reflow at the end
        reflowClips(track, 0)

        // Step 5: Update timeline duration
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Step 6: Update playhead state
        updatePlayheadState(state)
      })
    }
  }))
)

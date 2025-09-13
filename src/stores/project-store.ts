import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip, Effect, Project, Recording, Track, ZoomEffectData, BackgroundEffectData, CursorEffectData } from '@/types/project'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import type { SelectedEffectLayer, EffectLayerType } from '@/types/effects'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ZoomDetector } from '@/lib/effects/utils/zoom-detector'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'

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

// Shift effects fully contained in a time window by a delta (ms)
// Skip background (timeline-global) effects; keep others (zoom/cursor/keystroke/screen/annotation)
function shiftEffectsInWindow(project: Project, windowStart: number, windowEnd: number, delta: number) {
  if (!project.timeline.effects || delta === 0) return
  for (const effect of project.timeline.effects) {
    if (effect.type === 'background') continue
    if (effect.startTime >= windowStart && effect.endTime <= windowEnd) {
      effect.startTime += delta
      effect.endTime += delta
    }
  }
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

  // Selection State
  selectedClipId: string | null
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: { type: 'zoom' | 'cursor' | 'background'; data: any; sourceClipId: string }
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

  // Recording
  addRecording: (recording: Recording, videoBlob: Blob) => void

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
  getEffectsAtTimeRange: (clipId: string) => Effect[]  // Gets effects overlapping with clip's time range

  // Settings
  updateSettings: (updates: Partial<ProjectStore['settings']>) => void

  // Typing Speed
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
}

// Helper to update playhead state based on current time
const updatePlayheadState = (state: any) => {
  state.playheadClip = null
  state.playheadRecording = null

  if (state.currentProject && state.currentTime !== undefined) {
    // Find clip at current time
    for (const track of state.currentProject.timeline.tracks) {
      const clip = track.clips.find((c: Clip) =>
        state.currentTime >= c.startTime && state.currentTime < c.startTime + c.duration
      )
      if (clip) {
        state.playheadClip = clip
        state.playheadRecording = state.currentProject.recordings.find(
          (r: Recording) => r.id === clip.recordingId
        ) || null
        break
      }
    }

    // Find effects active at current time (timeline-based, not clip-based)
    if (state.currentProject.timeline.effects) {
      // No-op: preview derives effects per-clip in components
      const _allEffects = state.currentProject.timeline.effects
      void _allEffects
    }
  }
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

        // Add mouse-derived zoom blocks first
        zoomBlocks.forEach((block, index) => {
          const zoomEffect: Effect = {
            id: `zoom-${clipId}-${index}`,
            type: 'zoom',
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
              padding: 40,
              cornerRadius: 15,
              shadowIntensity: 85
            } as BackgroundEffectData,
            enabled: true
          }
          state.currentProject.timeline.effects.push(backgroundEffect)
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
          // Keep clips sorted by start time for proper rendering
          videoTrack.clips.sort((a, b) => a.startTime - b.startTime)
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
          // Force new clips to be positioned right after the last clip (no gaps)
          if (videoTrack.clips.length > 0) {
            // Find the end of the last clip in the timeline
            const sortedClips = [...videoTrack.clips].sort((a, b) =>
              (a.startTime + a.duration) - (b.startTime + b.duration)
            )
            const lastClip = sortedClips[sortedClips.length - 1]
            clip.startTime = lastClip.startTime + lastClip.duration
          } else {
            // First clip starts at 0
            clip.startTime = 0
          }

          videoTrack.clips.push(clip)
          // Keep clips sorted by start time for proper rendering
          videoTrack.clips.sort((a, b) => a.startTime - b.startTime)
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

    updateClip: (clipId, updates, options) => {
      set((state) => {
        if (!state.currentProject) return

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip, track } = result

        // Check for overlaps when position changes (unless exact mode is requested)
        if (!options?.exact && updates.startTime !== undefined) {
          // Check if the new position would cause overlaps
          const overlapCheck = ClipPositioning.checkOverlap(
            updates.startTime,
            updates.duration || clip.duration,
            track.clips,
            clipId
          )
          
          // If there's an overlap, find the next valid position
          if (overlapCheck.hasOverlap) {
            updates.startTime = ClipPositioning.findNextValidPosition(
              updates.startTime,
              updates.duration || clip.duration,
              track.clips,
              clipId
            )
          }
        }

        const prevEndBeforeUpdate = clip.startTime + clip.duration
        const prevStartBeforeUpdate = clip.startTime
        const prevDuration = clip.duration
        const wasPlayheadInside = state.currentTime >= prevStartBeforeUpdate && state.currentTime < prevEndBeforeUpdate
        const prevProgress = wasPlayheadInside && prevDuration > 0 ? (state.currentTime - prevStartBeforeUpdate) / prevDuration : 0

        Object.assign(clip, updates)

        // Only shift clips if the update would cause overlaps
        const endAfterUpdate = clip.startTime + clip.duration
        const durationChanged = updates.duration !== undefined || updates.playbackRate !== undefined
        const startChanged = updates.startTime !== undefined && updates.startTime !== prevStartBeforeUpdate
        
        if (durationChanged || startChanged) {
          // Check if this clip now overlaps with any following clips
          const clipIndex = track.clips.findIndex(c => c.id === clipId)
          
          for (let i = clipIndex + 1; i < track.clips.length; i++) {
            const following = track.clips[i]
            
            // If this clip now overlaps with a following clip, shift the following clips
            if (endAfterUpdate > following.startTime) {
              const shiftAmount = endAfterUpdate - following.startTime
              
              // Shift this clip and all subsequent clips
              for (let j = i; j < track.clips.length; j++) {
                const clipToShift = track.clips[j]
                const oldStart = clipToShift.startTime
                const oldEnd = clipToShift.startTime + clipToShift.duration
                
                clipToShift.startTime += shiftAmount
                
                // Update effects that were in this clip's time range
                if (state.currentProject) {
                  shiftEffectsInWindow(state.currentProject, oldStart, oldEnd, shiftAmount)
                }
              }
              
              break // Only need to fix once
            }
          }
        }

        // Maintain playhead relative position inside the edited clip
        if (wasPlayheadInside) {
          const newTime = clip.startTime + prevProgress * clip.duration
          state.currentTime = Math.max(clip.startTime, Math.min(clip.startTime + clip.duration - 1, newTime))
        }

        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Clamp current time inside new timeline bounds to keep preview stable
        if (state.currentTime >= state.currentProject.timeline.duration) {
          state.currentTime = Math.max(0, state.currentProject.timeline.duration - 1)
        }

        // Update playhead state in case the updated clip affects current time
        updatePlayheadState(state)
      })

      // Removed auto-save - now requires explicit save action
    },

    // New: Restore a removed clip at a specific index within a track
    restoreClip: (trackId, clip, index) => {
      set((state) => {
        if (!state.currentProject) return

        const track = state.currentProject.timeline.tracks.find(t => t.id === trackId)
        if (!track) return

        // Clamp index within bounds
        const insertIndex = Math.max(0, Math.min(index, track.clips.length))
        track.clips.splice(insertIndex, 0, clip)

        // Update timeline duration and modified timestamp
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

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

        const result = findClipById(state.currentProject, clipId)
        if (!result) {
          console.error('splitClip: Clip not found:', clipId)
          console.error('Available clips:', state.currentProject.timeline.tracks.flatMap(t => 
            t.clips.map(c => ({ id: c.id, start: c.startTime, end: c.startTime + c.duration }))
          ))
          return
        }

        const { clip, track } = result
        
        console.log('[Store] Splitting clip:', {
          clipId,
          splitTime,
          clipStart: clip.startTime,
          clipEnd: clip.startTime + clip.duration,
          clipDuration: clip.duration
        })

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
        
        // Calculate source split point accounting for playback rate
        const playbackRate = clip.playbackRate || 1
        const sourceSplitPoint = splitPoint * playbackRate

        // Create first clip - simple and clean
        const firstClip: Clip = {
          id: `${clip.id}-split1-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: clip.startTime,
          duration: splitPoint,
          sourceIn: clip.sourceIn,
          sourceOut: clip.sourceIn + sourceSplitPoint,
          playbackRate: clip.playbackRate
        }

        // Create second clip
        const secondClip: Clip = {
          id: `${clip.id}-split2-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: splitTime,
          duration: clip.duration - splitPoint,
          sourceIn: clip.sourceIn + sourceSplitPoint,
          sourceOut: clip.sourceOut,
          playbackRate: clip.playbackRate
        }

        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        track.clips.splice(clipIndex, 1, firstClip, secondClip)
        
        console.log('[Store] Split complete:', {
          originalClipId: clipId,
          firstClip: { id: firstClip.id, start: firstClip.startTime, end: firstClip.startTime + firstClip.duration },
          secondClip: { id: secondClip.id, start: secondClip.startTime, end: secondClip.startTime + secondClip.duration }
        })

        // Recalculate timeline duration after split
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
        // Select the left clip to keep focus at the split point
        // This ensures the preview shows the end of the left clip (at the split point)
        state.selectedClipId = firstClip.id
        state.selectedClips = [firstClip.id]

        // Move playhead to just before the split point to ensure we're in the first clip
        // This prevents the "No recording selected" issue
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

        const result = findClipById(state.currentProject, clipId)
        if (!result) return

        const { clip, track } = result

        if (newStartTime >= clip.startTime + clip.duration || newStartTime < 0) return

        const trimAmount = newStartTime - clip.startTime

        // Update clip timing
        clip.startTime = newStartTime
        clip.duration -= trimAmount
        clip.sourceIn += trimAmount

        // Reflow following clips to keep contiguous layout
        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        let nextStart = clip.startTime + clip.duration
        for (let i = clipIndex + 1; i < track.clips.length; i++) {
          const following = track.clips[i]
          const oldStart = following.startTime
          const oldEnd = following.startTime + following.duration
          following.startTime = nextStart
          const delta = following.startTime - oldStart
          if (delta !== 0 && state.currentProject) {
            shiftEffectsInWindow(state.currentProject, oldStart, oldEnd, delta)
          }
          nextStart = following.startTime + following.duration
        }

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

        const { clip, track } = result

        if (newEndTime <= clip.startTime || newEndTime < 0) return

        const newDuration = newEndTime - clip.startTime

        // Update clip timing
        clip.duration = newDuration
        clip.sourceOut = clip.sourceIn + clip.duration

        // Reflow following clips to keep contiguous layout
        const clipIndex = track.clips.findIndex(c => c.id === clipId)
        let nextStart = clip.startTime + clip.duration
        for (let i = clipIndex + 1; i < track.clips.length; i++) {
          const following = track.clips[i]
          const oldStart = following.startTime
          const oldEnd = following.startTime + following.duration
          following.startTime = nextStart
          const delta = following.startTime - oldStart
          if (delta !== 0 && state.currentProject) {
            shiftEffectsInWindow(state.currentProject, oldStart, oldEnd, delta)
          }
          nextStart = following.startTime + following.duration
        }

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

      // Start with position right after the original clip
      let desiredStartTime = clip.startTime + clip.duration

      // Only check for actual overlaps, don't force repositioning
      const wouldOverlap = track.clips.some(otherClip => {
        const otherEnd = otherClip.startTime + otherClip.duration
        const newEnd = desiredStartTime + clip.duration
        return (desiredStartTime < otherEnd && newEnd > otherClip.startTime)
      })

      if (wouldOverlap) {
        // Find the end of the timeline for the duplicate
        const sortedClips = [...track.clips].sort((a, b) =>
          (a.startTime + a.duration) - (b.startTime + b.duration)
        )
        const lastClip = sortedClips[sortedClips.length - 1]
        if (lastClip) {
          desiredStartTime = lastClip.startTime + lastClip.duration
        }
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

      // Clean up blob resources on next tick (after unmount)
      setTimeout(() => {
        if (typeof (globalBlobManager as any).softCleanupByType === 'function') {
          ; (globalBlobManager as any).softCleanupByType('video')
            ; (globalBlobManager as any).softCleanupByType('export')
            ; (globalBlobManager as any).softCleanupByType('thumbnail')
        } else {
          globalBlobManager.cleanupByType('video')
          globalBlobManager.cleanupByType('export')
          globalBlobManager.cleanupByType('thumbnail')
        }
      }, 0)
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

    // Gets all effects that overlap with a clip's time range
    // Note: Effects are timeline-global, not clip-owned
    getEffectsAtTimeRange: (clipId) => {
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
    },

    // Settings
    updateSettings: (updates) => {
      set((state) => {
        Object.assign(state.settings, updates)
      })
    },

    // Typing Speed - Apply typing speed suggestions to a clip
    applyTypingSpeedToClip: (clipId, periods) => {
      const affectedClips: string[] = []
      const originalClips: Clip[] = []
      
      set((state) => {
        if (!state.currentProject) {
          console.error('applyTypingSpeedToClip: No current project')
          return
        }

        // Find the source clip and track
        let sourceClip: Clip | null = null
        let track: Track | null = null
        for (const t of state.currentProject.timeline.tracks) {
          const clip = t.clips.find(c => c.id === clipId)
          if (clip) {
            sourceClip = clip
            track = t
            break
          }
        }

        if (!sourceClip || !track) {
          console.error('applyTypingSpeedToClip: Clip not found:', clipId)
          return
        }

        // Save original state of all clips from this recording
        const recordingId = sourceClip.recordingId
        for (const clip of track.clips) {
          if (clip.recordingId === recordingId) {
            originalClips.push({ ...clip })
          }
        }

        // Process each typing period
        for (const period of periods) {
          console.log('[Store] Processing typing period:', {
            source: { start: period.startTime, end: period.endTime },
            speed: period.suggestedSpeedMultiplier
          })

          // Check if period overlaps with any clip's source range
          let targetClip: Clip | null = null
          for (const clip of track.clips) {
            if (clip.recordingId !== recordingId) continue
            
            const clipSourceIn = clip.sourceIn || 0
            const clipSourceOut = clip.sourceOut || (clipSourceIn + clip.duration)
            
            // Check if this period overlaps with this clip's source range
            if (period.startTime < clipSourceOut && period.endTime > clipSourceIn) {
              targetClip = clip
              break
            }
          }

          if (!targetClip) {
            console.warn('[Store] No clip found for typing period:', period)
            continue
          }

          // Map to timeline coordinates for this specific clip
          const clipSourceIn = targetClip.sourceIn || 0
          const clipSourceOut = targetClip.sourceOut || (clipSourceIn + targetClip.duration)
          const clipPlaybackRate = targetClip.playbackRate || 1

          // Clip the period to this clip's source range
          const clippedStart = Math.max(period.startTime, clipSourceIn)
          const clippedEnd = Math.min(period.endTime, clipSourceOut)

          // Convert to timeline coordinates
          const relativeStart = (clippedStart - clipSourceIn) / clipPlaybackRate
          const relativeEnd = (clippedEnd - clipSourceIn) / clipPlaybackRate
          const timelineStart = targetClip.startTime + relativeStart
          const timelineEnd = targetClip.startTime + relativeEnd

          console.log('[Store] Mapped period to timeline:', {
            clipId: targetClip.id,
            timeline: { start: timelineStart, end: timelineEnd }
          })

          // Determine if we need to split the clip
          const clipStart = targetClip.startTime
          const clipEnd = targetClip.startTime + targetClip.duration
          let currentClipId = targetClip.id

          // Split at start if needed
          if (timelineStart > clipStart + 0.1) {
            console.log('[Store] Splitting at period start:', timelineStart)
            
            const splitPoint = timelineStart - clipStart
            const timestamp = Date.now()
            const sourceSplitPoint = splitPoint * clipPlaybackRate

            // Create first clip (before typing)
            const firstClip: Clip = {
              id: `${currentClipId}-split1-${timestamp}`,
              recordingId: targetClip.recordingId,
              startTime: targetClip.startTime,
              duration: splitPoint,
              sourceIn: targetClip.sourceIn,
              sourceOut: targetClip.sourceIn + sourceSplitPoint,
              playbackRate: targetClip.playbackRate
            }

            // Create second clip (typing part and after)
            const secondClip: Clip = {
              id: `${currentClipId}-split2-${timestamp}`,
              recordingId: targetClip.recordingId,
              startTime: timelineStart,
              duration: targetClip.duration - splitPoint,
              sourceIn: targetClip.sourceIn + sourceSplitPoint,
              sourceOut: targetClip.sourceOut,
              playbackRate: targetClip.playbackRate
            }

            const clipIndex = track.clips.findIndex(c => c.id === currentClipId)
            track.clips.splice(clipIndex, 1, firstClip, secondClip)
            currentClipId = secondClip.id

            // Update targetClip reference to the second clip
            targetClip = secondClip
          }

          // Split at end if needed
          if (timelineEnd < clipEnd - 0.1) {
            console.log('[Store] Splitting at period end:', timelineEnd)
            
            // Find the current clip again (it may have changed)
            const currentClip = track.clips.find(c => c.id === currentClipId)
            if (!currentClip) {
              console.error('[Store] Lost track of clip after first split')
              continue
            }

            const splitPoint = timelineEnd - currentClip.startTime
            const timestamp = Date.now()
            const sourceSplitPoint = splitPoint * (currentClip.playbackRate || 1)

            // Create first clip (typing part)
            const firstClip: Clip = {
              id: `${currentClipId}-split1-${timestamp}`,
              recordingId: currentClip.recordingId,
              startTime: currentClip.startTime,
              duration: splitPoint,
              sourceIn: currentClip.sourceIn,
              sourceOut: currentClip.sourceIn + sourceSplitPoint,
              playbackRate: currentClip.playbackRate
            }

            // Create second clip (after typing)
            const secondClip: Clip = {
              id: `${currentClipId}-split2-${timestamp}`,
              recordingId: currentClip.recordingId,
              startTime: timelineEnd,
              duration: currentClip.duration - splitPoint,
              sourceIn: currentClip.sourceIn + sourceSplitPoint,
              sourceOut: currentClip.sourceOut,
              playbackRate: currentClip.playbackRate
            }

            const clipIndex = track.clips.findIndex(c => c.id === currentClipId)
            track.clips.splice(clipIndex, 1, firstClip, secondClip)
            currentClipId = firstClip.id
          }

          // Apply speed to the target clip
          const finalClip = track.clips.find(c => c.id === currentClipId)
          if (finalClip) {
            console.log('[Store] Applying speed to clip:', finalClip.id)
            const sourceDuration = (finalClip.sourceOut - finalClip.sourceIn)
            const newDuration = sourceDuration / period.suggestedSpeedMultiplier
            
            finalClip.playbackRate = period.suggestedSpeedMultiplier
            finalClip.duration = newDuration
            affectedClips.push(finalClip.id)

            // Don't do magnetic updates here - we'll do it once at the end
          }
        }

        // After all periods are processed, ensure no overlaps
        // Sort clips by startTime
        track.clips.sort((a, b) => a.startTime - b.startTime)
        
        // Fix any overlaps by shifting clips forward (only if needed)
        for (let i = 1; i < track.clips.length; i++) {
          const prevClip = track.clips[i - 1]
          const currentClip = track.clips[i]
          const prevEnd = prevClip.startTime + prevClip.duration
          
          // If current clip overlaps with previous, shift it forward
          if (currentClip.startTime < prevEnd) {
            const shift = prevEnd - currentClip.startTime
            
            // Shift this clip and all subsequent clips to maintain relative positions
            for (let j = i; j < track.clips.length; j++) {
              track.clips[j].startTime += shift
            }
          }
        }

        // Update timeline duration
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()

        // Update playhead state
        updatePlayheadState(state)
      })

      return { affectedClips, originalClips }
    }
  }))
)
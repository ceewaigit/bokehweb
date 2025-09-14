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
  nextClip: Clip | null
  nextRecording: Recording | null

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

// Helper to reflow clips to maintain contiguous layout (no gaps)
const reflowClips = (track: Track, startFromIndex: number = 0, project?: Project) => {
  if (track.clips.length === 0) return
  
  // Sort clips by start time first
  track.clips.sort((a, b) => a.startTime - b.startTime)
  
  // If starting from beginning, ensure first clip starts at 0
  if (startFromIndex === 0 && track.clips.length > 0) {
    const firstClip = track.clips[0]
    const oldStart = firstClip.startTime
    const oldEnd = firstClip.startTime + firstClip.duration
    
    if (oldStart !== 0) {
      firstClip.startTime = 0
      // Shift effects that were aligned with this clip
      if (project) {
        shiftEffectsInWindow(project, oldStart, oldEnd, -oldStart)
      }
    }
  }
  
  // Reflow all clips from the specified index
  for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
    const prevClip = track.clips[i - 1]
    const currentClip = track.clips[i]
    const prevEnd = prevClip.startTime + prevClip.duration
    
    const oldStart = currentClip.startTime
    const oldEnd = currentClip.startTime + currentClip.duration
    const newStart = prevEnd
    
    // Position current clip right after previous clip (no gap)
    if (currentClip.startTime !== newStart) {
      currentClip.startTime = newStart
      const delta = newStart - oldStart
      
      // Shift effects that were aligned with this clip
      if (project && delta !== 0) {
        shiftEffectsInWindow(project, oldStart, oldEnd, delta)
      }
    }
  }
}

// Helper to update playhead state based on current time
const updatePlayheadState = (state: any) => {
  // Keep previous values to prevent gaps
  const prevClip = state.playheadClip
  const prevRecording = state.playheadRecording
  
  state.playheadClip = null
  state.playheadRecording = null
  state.nextClip = null
  state.nextRecording = null

  if (state.currentProject && state.currentTime !== undefined) {
    // Find current clip - handle exact boundaries for split clips
    for (const track of state.currentProject.timeline.tracks) {
      // Sort clips by start time to ensure consistent ordering
      const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
      
      // Find the clip, preferring clips that start at current time
      const clip = sortedClips.find((c: Clip) => {
        // If we're exactly at the start of a clip, prioritize it
        const atStart = state.currentTime === c.startTime
        // Otherwise check if we're within the clip (inclusive of end boundary)
        const withinClip = state.currentTime > c.startTime && 
                          state.currentTime <= c.startTime + c.duration
        return atStart || withinClip
      })
      
      if (clip) {
        state.playheadClip = clip
        state.playheadRecording = state.currentProject.recordings.find(
          (r: Recording) => r.id === clip.recordingId
        ) || null
        break
      }
    }
    
    // If no clip found but we're within 1ms of a clip boundary, keep previous
    if (!state.playheadClip && prevClip) {
      for (const track of state.currentProject.timeline.tracks) {
        const nearClip = track.clips.find((c: Clip) => {
          const distanceToStart = Math.abs(state.currentTime - c.startTime)
          const distanceToEnd = Math.abs(state.currentTime - (c.startTime + c.duration))
          return distanceToStart < 1 || distanceToEnd < 1
        })
        if (nearClip) {
          // We're at a boundary - keep showing previous clip momentarily
          state.playheadClip = prevClip
          state.playheadRecording = prevRecording
          break
        }
      }
    }
    
    // Find next clip (within 200ms lookahead window)
    const lookahead = 200
    for (const track of state.currentProject.timeline.tracks) {
      const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
      const nextClip = sortedClips.find((c: Clip) => {
        return c.startTime > state.currentTime && 
               c.startTime <= state.currentTime + lookahead
      })
      if (nextClip) {
        state.nextClip = nextClip
        state.nextRecording = state.currentProject.recordings.find(
          (r: Recording) => r.id === nextClip.recordingId
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
        // Load project from filesystem if an absolute/relative path is provided
        let project: Project
        if (projectPath && (projectPath.endsWith('.ssproj') || projectPath.includes('/'))) {
          if (window.electronAPI?.readLocalFile) {
            const res = await window.electronAPI.readLocalFile(projectPath)
            if (res?.success && res.data) {
              const json = new TextDecoder().decode(res.data)
              project = JSON.parse(json)
            } else {
              throw new Error('Failed to read project file')
            }
          } else {
            const data = RecordingStorage.getProject(projectPath)
            if (!data) throw new Error('Project not found')
            project = typeof data === 'string' ? JSON.parse(data) : data
          }
        } else {
          const data = RecordingStorage.getProject(projectPath)
          if (!data) throw new Error('Project not found')
          project = typeof data === 'string' ? JSON.parse(data) : data
        }

        // Migration: Mark clips with typing speed applied
        // For existing projects that had speed applied before the flag was added
        for (const track of project.timeline.tracks) {
          for (const clip of track.clips) {
            // If clip has non-default playback rate but no flag, it had typing speed applied
            if (clip.playbackRate && clip.playbackRate !== 1.0 && !clip.typingSpeedApplied) {
              clip.typingSpeedApplied = true
            }
          }
        }

        // Load all videos and metadata in one call
        // Check if we need to load metadata from chunks (new structure)
        for (const recording of project.recordings) {
          if (recording.folderPath && recording.metadataChunks) {
            // Load metadata from chunks if not already in memory
            if (!recording.metadata || Object.keys(recording.metadata).length === 0) {
              recording.metadata = await RecordingStorage.loadMetadataChunks(
                recording.folderPath,
                recording.metadataChunks
              )
            }
          }
        }
        
        // Load videos with folder path support
        await globalBlobManager.loadVideos(
          project.recordings.map((r: Recording) => ({
            id: r.id,
            filePath: r.filePath,
            folderPath: r.folderPath
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
        globalBlobManager.create(videoBlob, `recording-${completeRecording.id}`, 'video')

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
            startTime: startTime ?? 0,  // Default to 0 instead of timeline duration
            duration: recording.duration,
            sourceIn: 0,
            sourceOut: recording.duration
          }
        }

        const videoTrack = state.currentProject.timeline.tracks.find(t => t.type === 'video')
        if (videoTrack) {
          // If no specific startTime provided, add at the end of existing clips
          if (startTime === undefined) {
            if (videoTrack.clips.length > 0) {
              // Sort clips to find the actual end of timeline
              const sortedClips = [...videoTrack.clips].sort((a, b) => a.startTime - b.startTime)
              const lastClip = sortedClips[sortedClips.length - 1]
              clip.startTime = lastClip.startTime + lastClip.duration
            } else {
              // First clip starts at 0
              clip.startTime = 0
            }
          }

          videoTrack.clips.push(clip)
          
          // Reflow all clips to ensure no gaps
          reflowClips(videoTrack, 0, state.currentProject)
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

        // Remove the clip from tracks and reflow remaining clips
        for (const track of state.currentProject.timeline.tracks) {
          const index = track.clips.findIndex(c => c.id === clipId)
          if (index !== -1) {
            track.clips.splice(index, 1)
            
            // Reflow remaining clips to fill the gap
            reflowClips(track, 0, state.currentProject)  // Start from beginning to ensure no gaps
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
        
        // For frame-perfect splits, we need to ensure no frame is lost or duplicated
        // The sourceOut of first clip should be exclusive (not include the boundary frame)
        // The sourceIn of second clip should be inclusive (include the boundary frame)
        // This ensures continuity without gaps

        // Create first clip
        const firstClip: Clip = {
          id: `${clip.id}-split1-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: clip.startTime,
          duration: splitPoint,
          sourceIn: clip.sourceIn,
          sourceOut: clip.sourceIn + sourceSplitPoint, // Exclusive end
          playbackRate: clip.playbackRate,
          typingSpeedApplied: clip.typingSpeedApplied  // Preserve typing speed flag
        }

        // Create second clip - starts exactly where first ends
        const secondClip: Clip = {
          id: `${clip.id}-split2-${timestamp}`,
          recordingId: clip.recordingId,
          startTime: splitTime,
          duration: clip.duration - splitPoint,
          sourceIn: clip.sourceIn + sourceSplitPoint, // Inclusive start (same as firstClip.sourceOut)
          sourceOut: clip.sourceOut,
          playbackRate: clip.playbackRate,
          typingSpeedApplied: clip.typingSpeedApplied  // Preserve typing speed flag
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

        // Reflow all clips to keep contiguous layout
        reflowClips(track, 0, state.currentProject)

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

        // Reflow all clips to keep contiguous layout
        reflowClips(track, 0, state.currentProject)

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

        // Begin debug group
        try {
          console.group('[TypingApply] applyTypingSpeedToClip')
          console.log('sourceClip', {
            id: sourceClip.id,
            startTime: sourceClip.startTime,
            duration: sourceClip.duration,
            sourceIn: sourceClip.sourceIn,
            sourceOut: sourceClip.sourceOut,
            rate: sourceClip.playbackRate
          })
          console.log('periods', periods.map(p => ({ start: p.startTime, end: p.endTime, rate: p.suggestedSpeedMultiplier })))
        } catch {}

        // Tolerances
        const TIME_EPS = 0.5
        const SRC_EPS = 1
        const FRAME_MS = 1000 / 30
        const quantizeMs = (ms: number) => Math.round(ms / FRAME_MS) * FRAME_MS

        // Remember original block start to reflow from after edits
        const originalBlockStartTime = sourceClip.startTime
        const originalBlockEndTime = sourceClip.startTime + sourceClip.duration

        // Save original state of all clips from this recording
        const recordingId = sourceClip.recordingId
        for (const clip of track.clips) {
          if (clip.recordingId === recordingId) {
            originalClips.push({ ...clip })
          }
        }

        // PHASE 1+2+3: Rebuild the source clip into contiguous source-interval segments
        {
          const clipSrcIn = sourceClip.sourceIn || 0
          const clipRate = sourceClip.playbackRate || 1
          const clipSrcOut = sourceClip.sourceOut || (clipSrcIn + sourceClip.duration * clipRate)

          // Build boundaries: clip edges + all period edges clipped to clip range
          const bounds: number[] = [clipSrcIn, clipSrcOut]
          for (const p of periods) {
            const start = Math.max(clipSrcIn, Math.min(clipSrcOut, p.startTime))
            const end = Math.max(clipSrcIn, Math.min(clipSrcOut, p.endTime))
            if (end - start > SRC_EPS) {
              bounds.push(start, end)
            }
          }
          // Unique + sorted with tolerance
          bounds.sort((a, b) => a - b)
          const uniqBounds: number[] = []
          for (const b of bounds) {
            if (uniqBounds.length === 0 || Math.abs(b - uniqBounds[uniqBounds.length - 1]) > SRC_EPS) {
              uniqBounds.push(b)
            }
          }

          // Helper: choose speed multiplier for a source interval midpoint
          const pickRate = (mid: number): number => {
            let chosen = 1
            let bestOverlap = 0
            for (const p of periods) {
              const s = Math.max(clipSrcIn, Math.min(clipSrcOut, p.startTime))
              const e = Math.max(clipSrcIn, Math.min(clipSrcOut, p.endTime))
              if (mid >= s - SRC_EPS && mid <= e + SRC_EPS) {
                const overlap = e - s
                if (overlap > bestOverlap) {
                  bestOverlap = overlap
                  chosen = p.suggestedSpeedMultiplier || 1
                }
              }
            }
            return chosen
          }

          // Build new segments
          const timestamp = Date.now()
          type IntervalSpec = { index: number; sIn: number; sOut: number; rate: number; rawFrames: number; floorFrames: number; remainder: number }
          const intervals: IntervalSpec[] = []
          for (let i = 0; i < uniqBounds.length - 1; i++) {
            const sIn = uniqBounds[i]
            const sOut = uniqBounds[i + 1]
            const srcLen = sOut - sIn
            if (srcLen <= SRC_EPS) continue
            const mid = (sIn + sOut) / 2
            const rate = pickRate(mid) || 1
            const rawFrames = srcLen / (rate * FRAME_MS)
            const floorFrames = Math.max(1, Math.floor(rawFrames))
            const remainder = Math.max(0, rawFrames - floorFrames)
            intervals.push({ index: i, sIn, sOut, rate, rawFrames, floorFrames, remainder })
          }

          // Largest remainder method to distribute rounding so sum matches rounded total
          const totalRawFrames = intervals.reduce((sum, it) => sum + it.rawFrames, 0)
          const targetTotalFrames = Math.max(1, Math.round(totalRawFrames))
          let assignedFrames = intervals.reduce((sum, it) => sum + it.floorFrames, 0)
          let framesToDistribute = Math.max(0, targetTotalFrames - assignedFrames)
          const order = [...intervals].sort((a, b) => b.remainder - a.remainder)
          for (let k = 0; k < order.length && framesToDistribute > 0; k++, framesToDistribute--) {
            order[k].floorFrames += 1
          }

          // Build segments with final frame counts
          const newSegments: Clip[] = []
          let cursorTimeline = sourceClip.startTime
          for (const it of intervals) {
            const duration = Math.max(FRAME_MS, it.floorFrames * FRAME_MS)
            const seg: Clip = {
              id: `${sourceClip.id}-seg-${timestamp}-${it.index}`,
              recordingId: sourceClip.recordingId,
              startTime: cursorTimeline,
              duration,
              sourceIn: it.sIn,
              sourceOut: it.sOut,
              playbackRate: it.rate,
              typingSpeedApplied: it.rate !== 1
            }
            newSegments.push(seg)
            cursorTimeline += duration
          }
          
          // Replace the original clip with rebuilt segments
          const idx = track.clips.findIndex(c => c.id === sourceClip.id)
          if (idx !== -1) {
            track.clips.splice(idx, 1, ...newSegments)
            try { console.log('[TypingApply] rebuild', { count: newSegments.length, segments: newSegments.map(s => ({ id: s.id, start: s.startTime, end: s.startTime + s.duration, srcIn: s.sourceIn, srcOut: s.sourceOut, rate: s.playbackRate })) }) } catch {}
            affectedClips.push(...newSegments.map(s => s.id))
          }
        }
        
        // PHASE 4: Normalize source continuity within lineage (fix tiny gaps/overlaps)
        {
          const lineage = track.clips
            .filter(c => c.recordingId === recordingId)
            .filter(c => {
              const cIn = c.sourceIn || 0
              const cOut = c.sourceOut || (cIn + (c.playbackRate || 1) * c.duration)
              // within original clip source window
              const inLineage = cIn >= (sourceClip.sourceIn || 0) - SRC_EPS && cOut <= (sourceClip.sourceOut || Number.MAX_SAFE_INTEGER) + SRC_EPS
              return inLineage
            })
            .sort((a, b) => (a.sourceIn || 0) - (b.sourceIn || 0))

          for (let i = 1; i < lineage.length; i++) {
            const prev = lineage[i - 1]
            const curr = lineage[i]
            const pIn = prev.sourceIn || 0
            const pOut = prev.sourceOut || (pIn + (prev.playbackRate || 1) * prev.duration)
            const cIn = curr.sourceIn || 0
            const cOut = curr.sourceOut || (cIn + (curr.playbackRate || 1) * curr.duration)

            const overlap = pOut - cIn
            const gap = cIn - pOut

            if (overlap > SRC_EPS) {
              // Move curr start to prev end
              curr.sourceIn = pOut
              const rate = curr.playbackRate || 1
              const newSourceDuration = Math.max(0, cOut - curr.sourceIn)
              const newDuration = Math.max(1, quantizeMs(newSourceDuration / rate))
              try { console.log('[TypingApply] normalize(overlap)', { currId: curr.id, oldIn: cIn, newIn: curr.sourceIn, newDuration }) } catch {}
              curr.duration = newDuration
            } else if (gap > SRC_EPS) {
              // Close tiny gap by pulling curr start back to prev end
              curr.sourceIn = pOut
              const rate = curr.playbackRate || 1
              const newSourceDuration = Math.max(0, cOut - curr.sourceIn)
              const newDuration = Math.max(1, quantizeMs(newSourceDuration / rate))
              try { console.log('[TypingApply] normalize(gap)', { currId: curr.id, oldIn: cIn, newIn: curr.sourceIn, newDuration }) } catch {}
              curr.duration = newDuration
            }
          }
        }
        
        // PHASE 5: Fix overlaps and gaps - reflow the track from the edited block forward
        // Sort by time and reflow from the original block start to keep global ordering intact
        track.clips.sort((a, b) => a.startTime - b.startTime)
        const startIndex = Math.max(0, track.clips.findIndex(c => c.startTime >= originalBlockStartTime - 0.01))
        reflowClips(track, startIndex, state.currentProject)
        try { console.log('[TypingApply] reflowFrom', { originalBlockStartTime, order: track.clips.map(c => ({ id: c.id, start: c.startTime, end: c.startTime + c.duration })) }) } catch {}
        
        // PHASE 6: Remove applied typing periods from the recording's metadata
        // This is the elegant solution - the metadata becomes the single source of truth
        const recording = state.currentProject.recordings.find(r => r.id === recordingId)
        if (recording && recording.metadata?.keyboardEvents) {
          // Filter out keyboard events that fall within the applied typing periods
          recording.metadata.keyboardEvents = recording.metadata.keyboardEvents.filter(event => {
            // Check if this keyboard event falls within any of the applied periods
            const isInAppliedPeriod = periods.some(period => 
              event.timestamp >= period.startTime && event.timestamp <= period.endTime
            )
            // Keep the event only if it's NOT in an applied period
            return !isInAppliedPeriod
          })
        }
        
        // Update timeline duration
        state.currentProject.timeline.duration = calculateTimelineDuration(state.currentProject)
        state.currentProject.modifiedAt = new Date().toISOString()
        
        // Update playhead state - ensure playhead is inside a valid clip
        updatePlayheadState(state)
        
        // If playhead is in a gap, move it to the nearest clip
        if (!state.playheadClip && affectedClips.length > 0) {
          const firstAffectedClip = track.clips.find(c => affectedClips.includes(c.id))
          if (firstAffectedClip) {
            state.currentTime = firstAffectedClip.startTime + 1
            updatePlayheadState(state)
          }
        }

        // End debug group
        try { console.groupEnd() } catch {}
      })

      return { affectedClips, originalClips }
    }
  }))
)
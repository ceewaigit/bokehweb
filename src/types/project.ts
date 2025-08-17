/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 */

import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { EffectsEngine } from '@/lib/effects/effects-engine'

export interface Project {
  version: string
  id: string
  name: string
  filePath?: string  // Path to the saved project file
  createdAt: string
  modifiedAt: string

  // Raw recording references
  recordings: Recording[]

  // Timeline with clips referencing recordings
  timeline: Timeline

  // Global project settings
  settings: ProjectSettings

  // Export presets
  exportPresets: ExportPreset[]
}

export interface Recording {
  id: string
  filePath: string
  duration: number
  width: number
  height: number
  frameRate: number

  // Capture area information
  captureArea?: CaptureArea

  // Captured metadata during recording
  metadata: RecordingMetadata
}

export interface CaptureArea {
  // Full screen bounds (including dock)
  fullBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  // Work area bounds (excluding dock/taskbar)
  workArea: {
    x: number
    y: number
    width: number
    height: number
  }
  // Display scale factor for HiDPI screens
  scaleFactor: number
}

export interface RecordingMetadata {
  // Mouse/cursor events
  mouseEvents: MouseEvent[]

  // Keyboard events for overlay
  keyboardEvents: KeyboardEvent[]

  // Click events for ripples
  clickEvents: ClickEvent[]

  // Screen dimensions changes
  screenEvents: ScreenEvent[]

  // Audio levels for waveform
  audioLevels?: number[]
}

export interface MouseEvent {
  timestamp: number
  x: number
  y: number
  screenWidth: number
  screenHeight: number
  cursorType?: string  // Optional cursor type for rendering
}

export interface KeyboardEvent {
  timestamp: number
  key: string
  modifiers: string[]
}

export interface ClickEvent {
  timestamp: number
  x: number
  y: number
  button: 'left' | 'right' | 'middle'
}

export interface ScreenEvent {
  timestamp: number
  width: number
  height: number
}

export interface Timeline {
  tracks: Track[]
  duration: number
}

export interface Track {
  id: string
  name: string
  type: 'video' | 'audio' | 'annotation'
  clips: Clip[]
  muted: boolean
  locked: boolean
}

export interface Clip {
  id: string
  recordingId: string  // References Recording.id

  // Timeline position
  startTime: number    // Position on timeline
  duration: number     // Clip duration

  // Source trimming
  sourceIn: number     // Start point in source recording
  sourceOut: number    // End point in source recording

  // Applied effects (non-destructive)
  effects: ClipEffects

  // Transitions
  transitionIn?: Transition
  transitionOut?: Transition
}

export interface ClipEffects {
  // Zoom and pan
  zoom: {
    enabled: boolean
    blocks: ZoomBlock[]  // Screen Studio style zoom blocks
    sensitivity: number
    maxZoom: number
    smoothing: number
  }

  // Cursor styling
  cursor: {
    visible: boolean
    style: 'default' | 'macOS' | 'custom'
    size: number
    color: string
    clickEffects: boolean
    motionBlur: boolean
  }

  // Background
  background: {
    type: 'none' | 'color' | 'gradient' | 'image' | 'blur'
    color?: string
    gradient?: {
      colors: string[]
      angle: number
    }
    image?: string
    blur?: number
    padding: number
  }

  // Video styling
  video: {
    cornerRadius: number
    shadow: {
      enabled: boolean
      blur: number
      color: string
      offset: { x: number; y: number }
    }
  }

  // Annotations
  annotations: Annotation[]
}

export interface ZoomBlock {
  id: string
  startTime: number    // Start of zoom effect (in clip time)
  endTime: number      // End of zoom effect (in clip time)
  introMs: number      // Duration of zoom in animation (default 500ms)
  outroMs: number      // Duration of zoom out animation (default 500ms)
  scale: number        // Max zoom level (e.g., 2.0 for 2x)
  targetX: number      // Focus point X (0-1)
  targetY: number      // Focus point Y (0-1)
  mode: 'manual' | 'auto'  // Manual or auto-detected
}

export interface Annotation {
  id: string
  type: 'text' | 'arrow' | 'highlight' | 'keyboard'
  startTime: number
  duration: number
  properties: any  // Type-specific properties
}

export interface Transition {
  type: 'fade' | 'slide' | 'zoom'
  duration: number
  properties: any
}

export interface ProjectSettings {
  resolution: {
    width: number
    height: number
  }
  frameRate: number
  backgroundColor: string
}

export interface ExportPreset {
  id: string
  name: string
  format: 'mp4' | 'mov' | 'gif' | 'webm'
  codec: string
  quality: 'low' | 'medium' | 'high' | 'lossless'
  resolution: {
    width: number
    height: number
  }
  frameRate: number
  bitrate?: number
}

// Helper function to create a new project
export function createProject(name: string): Project {
  return {
    version: '1.0.0',
    id: `project-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    recordings: [],
    timeline: {
      tracks: [
        {
          id: 'video-1',
          name: 'Video',
          type: 'video',
          clips: [],
          muted: false,
          locked: false
        },
        {
          id: 'audio-1',
          name: 'Audio',
          type: 'audio',
          clips: [],
          muted: false,
          locked: false
        }
      ],
      duration: 0
    },
    settings: {
      resolution: { width: 1920, height: 1080 },
      frameRate: 60,
      backgroundColor: '#000000'
    },
    exportPresets: [
      {
        id: 'default',
        name: 'Default',
        format: 'mp4',
        codec: 'h264',
        quality: 'high',
        resolution: { width: 1920, height: 1080 },
        frameRate: 60
      }
    ]
  }
}

// Save/load functions
export async function saveProject(project: Project, customPath?: string): Promise<string | null> {
  // Create a copy of the project to avoid mutating the original
  const projectCopy = { ...project }
  
  // Check if running in Electron environment
  if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      
      // Use existing filePath if available, otherwise create new one
      let projectFilePath: string
      if (projectCopy.filePath && !customPath) {
        // Update existing file
        projectFilePath = projectCopy.filePath
      } else {
        // Create new file
        const projectFileName = customPath || `${projectCopy.id}.ssproj`
        projectFilePath = projectFileName.startsWith('/') ? projectFileName : `${recordingsDir}/${projectFileName}`
      }

      // Update the copy's filePath
      projectCopy.filePath = projectFilePath
      
      // Stringify the copy with the updated filePath
      const projectData = JSON.stringify(projectCopy, null, 2)

      // Save as text file with our custom extension
      await window.electronAPI.saveRecording(
        projectFilePath,
        new TextEncoder().encode(projectData).buffer
      )

      // Also save to localStorage for quick access
      RecordingStorage.setProject(projectCopy.id, projectData)
      RecordingStorage.setProjectPath(projectCopy.id, projectFilePath)

      console.log(`Project saved to: ${projectFilePath}`)
      return projectFilePath
    } catch (error) {
      console.error('Failed to save project file:', error)
      // Fallback to localStorage only
      const projectData = JSON.stringify(projectCopy, null, 2)
      RecordingStorage.setProject(projectCopy.id, projectData)
      return null
    }
  } else {
    // Fallback to localStorage if not in Electron
    const projectData = JSON.stringify(projectCopy, null, 2)
    RecordingStorage.setProject(projectCopy.id, projectData)
    return null
  }
}

export async function saveRecordingWithProject(
  videoBlob: Blob,
  metadata: any[],
  projectName?: string,
  captureArea?: CaptureArea
): Promise<{ project: Project; videoPath: string; projectPath: string } | null> {
  if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
    console.error('Electron API not available for saving')
    return null
  }

  try {
    const recordingsDir = await window.electronAPI.getRecordingsDirectory()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const baseName = projectName || `Recording_${timestamp}`
    const recordingId = `recording-${Date.now()}`

    // Save video file
    const videoFileName = `${baseName}.webm`
    const videoFilePath = `${recordingsDir}/${videoFileName}`
    const buffer = await videoBlob.arrayBuffer()
    await window.electronAPI.saveRecording(videoFilePath, buffer)

    // Get video metadata
    const videoUrl = globalBlobManager.create(videoBlob, 'video-preview')
    const video = document.createElement('video')
    video.src = videoUrl

    // Get proper video duration (blob URLs may show Infinity initially)
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, initial duration:', video.duration)
        
        // If duration is not finite, seek to get it
        if (!isFinite(video.duration)) {
          console.log('Duration is Infinity, seeking to end to get actual duration...')
          video.currentTime = Number.MAX_SAFE_INTEGER
          
          video.onseeked = () => {
            console.log('After seeking, duration is:', video.duration)
            // Remove the event listener to prevent infinite loop
            video.onseeked = null
            video.currentTime = 0 // Reset to start
            resolve()
          }
        } else {
          resolve()
        }
      }
    })

    // Verify we have a valid duration
    if (!isFinite(video.duration) || video.duration <= 0) {
      throw new Error(`Cannot determine video duration: ${video.duration}`)
    }

    const duration = video.duration * 1000 // Convert to milliseconds
    const width = video.videoWidth
    const height = video.videoHeight

    // Use default frame rate since browser detection is unreliable
    const detectedFrameRate = 30

    globalBlobManager.revoke(videoUrl)

    // Create project with recording
    const project = createProject(baseName)

    // Process metadata into proper format
    // IMPORTANT: Preserve original screen dimensions for proper cursor alignment
    const mouseEvents = metadata
      .filter(m => m.eventType === 'mouse' || m.type === 'move')
      .map(m => ({
        timestamp: m.timestamp || m.t || 0,
        x: m.mouseX || m.x || 0,
        y: m.mouseY || m.y || 0,
        // Keep original screen dimensions if available, otherwise use video dimensions
        screenWidth: m.screenWidth || width,
        screenHeight: m.screenHeight || height
      }))

    const clickEvents = metadata
      .filter(m => m.eventType === 'click' || m.type === 'click')
      .map(m => ({
        timestamp: m.timestamp || m.t || 0,
        x: m.mouseX || m.x || 0,
        y: m.mouseY || m.y || 0,
        button: 'left' as const
      }))

    const keyboardEvents = metadata
      .filter(m => m.eventType === 'keypress')
      .map(m => ({
        timestamp: m.timestamp || m.t || 0,
        key: m.key || '',
        modifiers: []
      }))

    // Add recording to project - store just the filename, not absolute path
    const recording: Recording = {
      id: recordingId,
      filePath: videoFileName, // Store just the filename, not the full path
      duration,
      width,
      height,
      frameRate: detectedFrameRate,
      captureArea,
      metadata: {
        mouseEvents,
        keyboardEvents,
        clickEvents,
        screenEvents: []
      }
    }

    project.recordings.push(recording)

    // Generate zoom effects using EffectsEngine - clean and simple!
    const effectsEngine = new EffectsEngine()

    // Create a mock recording object with the data we have
    const mockRecording = {
      duration,
      width,
      height,
      metadata: {
        mouseEvents: mouseEvents.map(e => ({
          timestamp: e.timestamp,
          x: e.x * width,
          y: e.y * height,
          screenWidth: width,
          screenHeight: height
        })),
        clickEvents: clickEvents,
        keyboardEvents: keyboardEvents,
        screenEvents: []
      }
    }

    // Use the engine's public method
    const zoomBlocks = effectsEngine.getZoomBlocks(mockRecording)

    console.log(`📹 Generated ${zoomBlocks.length} zoom blocks`)

    // Detect cursor activity to set visibility intelligently
    const hasCursorActivity = mouseEvents.length > 5 // Has meaningful mouse movement
    const hasClicks = clickEvents.length > 0

    // Add clip to timeline with generated effects
    const clip: Clip = {
      id: `clip-${Date.now()}`,
      recordingId,
      startTime: 0,
      duration,
      sourceIn: 0,
      sourceOut: duration,
      effects: {
        zoom: {
          enabled: true,
          blocks: zoomBlocks, // Use generated zoom blocks
          sensitivity: 1.0,
          maxZoom: 2.0,
          smoothing: 0.1
        },
        cursor: {
          visible: hasCursorActivity, // Only show cursor if there was mouse activity
          style: 'macOS',
          size: 1.2,
          color: '#ffffff',
          clickEffects: hasClicks, // Only enable click effects if there were actual clicks
          motionBlur: hasCursorActivity // Only enable motion blur if cursor was moving
        },
        background: {
          type: 'gradient',
          gradient: {
            colors: ['#f0f9ff', '#e0f2fe'],  // Light blue gradient
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

    // Add to video track
    const videoTrack = project.timeline.tracks.find(t => t.type === 'video')
    if (videoTrack) {
      videoTrack.clips.push(clip)
    }

    project.timeline.duration = duration

    // Save project file
    const projectFileName = `${baseName}.ssproj`
    const projectPath = await saveProject(project, projectFileName)

    // Store metadata with recording ID only (single source of truth)
    RecordingStorage.setMetadata(recordingId, recording.metadata)

    return {
      project,
      videoPath: videoFilePath,
      projectPath: projectPath || `${recordingsDir}/${projectFileName}`
    }
  } catch (error) {
    console.error('Failed to save recording with project:', error)
    return null
  }
}

export async function loadProject(filePath: string): Promise<Project> {
  // Check if running in Electron environment
  if (typeof window !== 'undefined' && window.electronAPI?.readLocalFile) {
    try {
      const result = await window.electronAPI.readLocalFile(filePath)
      if (result && result.success && result.data) {
        const decoder = new TextDecoder()
        const projectData = decoder.decode(result.data as ArrayBuffer)
        const project = JSON.parse(projectData) as Project
        
        // Set the filePath so we can update the same file later
        project.filePath = filePath

        // Cache in RecordingStorage for quick access
        RecordingStorage.setProject(project.id, projectData)
        RecordingStorage.setProjectPath(project.id, filePath)

        return project
      }
    } catch (error) {
      console.error('Failed to load project file:', error)
    }
  }

  // Fallback to RecordingStorage
  const data = RecordingStorage.getProject(filePath)
  if (!data) throw new Error('Project not found')
  return JSON.parse(data)
}
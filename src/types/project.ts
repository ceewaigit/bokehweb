/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 */

import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ZoomEngine } from '@/lib/effects/zoom-engine'

export interface Project {
  version: string
  id: string
  name: string
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
    keyframes: ZoomKeyframe[]
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

export interface ZoomKeyframe {
  time: number
  zoom: number
  x: number  // Focus point
  y: number
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smoothStep'
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
  const projectData = JSON.stringify(project, null, 2)
  
  // Check if running in Electron environment
  if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      const projectFileName = customPath || `${project.id}.ssproj`
      const projectFilePath = projectFileName.startsWith('/') ? projectFileName : `${recordingsDir}/${projectFileName}`
      
      // Save as text file with our custom extension
      await window.electronAPI.saveRecording(
        projectFilePath,
        new TextEncoder().encode(projectData).buffer
      )
      
      // Also save to localStorage for quick access
      RecordingStorage.setProject(project.id, projectData)
      RecordingStorage.setProjectPath(project.id, projectFilePath)
      
      console.log(`Project saved to: ${projectFilePath}`)
      return projectFilePath
    } catch (error) {
      console.error('Failed to save project file:', error)
      // Fallback to localStorage only
      RecordingStorage.setProject(project.id, projectData)
      return null
    }
  } else {
    // Fallback to localStorage if not in Electron
    RecordingStorage.setProject(project.id, projectData)
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
    
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve
    })
    
    const duration = video.duration * 1000 // Convert to milliseconds
    const width = video.videoWidth || window.screen.width
    const height = video.videoHeight || window.screen.height
    
    globalBlobManager.revoke(videoUrl)
    
    // Create project with recording
    const project = createProject(baseName)
    
    // Process metadata into proper format
    const mouseEvents = metadata
      .filter(m => m.eventType === 'mouse' || m.type === 'move')
      .map(m => ({
        timestamp: m.timestamp || m.t || 0,
        x: m.mouseX || m.x || 0,
        y: m.mouseY || m.y || 0,
        screenWidth: width,
        screenHeight: height
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
    
    // Add recording to project
    const recording: Recording = {
      id: recordingId,
      filePath: videoFilePath,
      duration,
      width,
      height,
      frameRate: 60,
      captureArea,
      metadata: {
        mouseEvents,
        keyboardEvents,
        clickEvents,
        screenEvents: []
      }
    }
    
    project.recordings.push(recording)
    
    // Generate zoom keyframes from mouse events using ZoomEngine
    const zoomEngine = new ZoomEngine({
      enabled: true,
      sensitivity: 1.0,
      maxZoom: 2.0,
      smoothing: true
    })
    
    // Convert mouse events to format expected by ZoomEngine
    const zoomEvents = [
      ...mouseEvents.map(e => ({
        timestamp: e.timestamp,
        mouseX: e.x * width,
        mouseY: e.y * height,
        eventType: 'mouse' as const
      })),
      ...clickEvents.map(e => ({
        timestamp: e.timestamp,
        mouseX: e.x,
        mouseY: e.y,
        eventType: 'click' as const
      }))
    ].sort((a, b) => a.timestamp - b.timestamp)
    
    const engineKeyframes = zoomEngine.generateKeyframes(
      zoomEvents,
      duration,
      width,
      height
    )
    
    // Convert ZoomEngine keyframes to project format
    const zoomKeyframes: ZoomKeyframe[] = engineKeyframes.map(kf => ({
      time: kf.timestamp,
      zoom: kf.scale,
      x: kf.x,
      y: kf.y,
      easing: 'smoothStep' as const
    }))
    
    console.log(`📹 Generated ${zoomKeyframes.length} zoom keyframes from ${zoomEvents.length} events`)
    
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
          keyframes: zoomKeyframes, // Use generated keyframes instead of empty array
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
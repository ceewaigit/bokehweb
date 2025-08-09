/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 */

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
  
  // Captured metadata during recording
  metadata: RecordingMetadata
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
export async function saveProject(project: Project): Promise<void> {
  const projectData = JSON.stringify(project, null, 2)
  
  // Check if running in Electron environment
  if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      const projectFileName = `${project.id}.ssproj`
      const projectFilePath = `${recordingsDir}/${projectFileName}`
      
      // Save as text file with our custom extension
      await window.electronAPI.saveRecording(
        projectFilePath,
        new TextEncoder().encode(projectData).buffer
      )
      
      // Also save to localStorage for quick access
      localStorage.setItem(`project-${project.id}`, projectData)
      localStorage.setItem(`project-path-${project.id}`, projectFilePath)
      
      console.log(`Project saved to: ${projectFilePath}`)
    } catch (error) {
      console.error('Failed to save project file:', error)
      // Fallback to localStorage only
      localStorage.setItem(`project-${project.id}`, projectData)
    }
  } else {
    // Fallback to localStorage if not in Electron
    localStorage.setItem(`project-${project.id}`, projectData)
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
        
        // Cache in localStorage for quick access
        localStorage.setItem(`project-${project.id}`, projectData)
        localStorage.setItem(`project-path-${project.id}`, filePath)
        
        return project
      }
    } catch (error) {
      console.error('Failed to load project file:', error)
    }
  }
  
  // Fallback to localStorage
  const data = localStorage.getItem(filePath)
  if (!data) throw new Error('Project not found')
  return JSON.parse(data)
}
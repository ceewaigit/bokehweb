/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 * 
 * This file contains ONLY type definitions - no business logic
 */

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

  // Audio information
  hasAudio?: boolean

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
  // Source type for determining if cropping is needed
  sourceType?: 'screen' | 'window'
  // Source ID for the recording
  sourceId?: string
}

export interface RecordingMetadata {
  // Mouse/cursor events
  mouseEvents: MouseEvent[]

  // Keyboard events for overlay
  keyboardEvents: KeyboardEvent[]

  // Click events for ripples
  clickEvents: ClickEvent[]

  // Scroll events for cinematic scroll effects
  scrollEvents?: ScrollEvent[]

  // Caret (text insertion point) events for text editing tracking
  caretEvents?: CaretEvent[]

  // Screen dimensions changes
  screenEvents: ScreenEvent[]

  // Capture area information for cropping during export
  captureArea?: CaptureArea
}

export interface MouseEvent {
  timestamp: number
  x: number
  y: number
  screenWidth: number
  screenHeight: number
  cursorType?: string  // Optional cursor type for rendering
  captureWidth?: number  // Width of the capture area for coordinate mapping
  captureHeight?: number  // Height of the capture area for coordinate mapping
}

export interface ScrollEvent {
  timestamp: number
  deltaX: number
  deltaY: number
}

export interface CaretEvent {
  timestamp: number
  x: number
  y: number
  bounds?: { x: number; y: number; width: number; height: number }
  line?: number
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
  // Effects are stored independently
  effects: Effect[]
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

  // Transitions
  transitionIn?: Transition
  transitionOut?: Transition
}

// New: Independent effect entity (timeline-global, not per-clip)
export interface Effect {
  id: string
  type: 'zoom' | 'cursor' | 'keystroke' | 'background' | 'annotation' | 'screen'
  
  // Timing on timeline (absolute, not relative to any clip)
  startTime: number  // Start time on timeline (absolute)
  endTime: number    // End time on timeline (absolute)

  // Effect-specific data
  data: ZoomEffectData | CursorEffectData | KeystrokeEffectData | BackgroundEffectData | AnnotationData | ScreenEffectData

  // Common properties
  enabled: boolean
  locked?: boolean
}

// ClipEffects removed - use Effect[] instead
// Effects are stored independently in timeline.effects

export interface ZoomBlock {
  id: string
  startTime: number
  endTime: number
  scale: number
  targetX?: number  // Optional focus point
  targetY?: number
  introMs?: number  // Duration of zoom in animation
  outroMs?: number  // Duration of zoom out animation
}

// New: Effect-specific data types for independent effects
export interface ZoomEffectData {
  scale: number
  targetX?: number
  targetY?: number
  introMs: number
  outroMs: number
  smoothing: number
  // Follow strategy: mouse first (default), mouse only, or caret only
  followStrategy?: 'auto_mouse_first' | 'mouse' | 'caret'
  // Mouse idle threshold in pixels (physical) to consider idle within the velocity window
  mouseIdlePx?: number
  // Caret recent window in ms to accept caret as active typing
  caretWindowMs?: number
}

export interface CursorEffectData {
  style: 'default' | 'macOS' | 'custom'
  size: number
  color: string
  clickEffects: boolean
  motionBlur: boolean
  hideOnIdle: boolean
  idleTimeout: number
}

export interface KeystrokeEffectData {
  position?: 'bottom-center' | 'bottom-right' | 'top-center'
  fontSize?: number
  fontFamily?: string
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderRadius?: number
  padding?: number
  fadeOutDuration?: number
  maxWidth?: number
}

export interface BackgroundEffectData {
  type: 'none' | 'color' | 'gradient' | 'image' | 'wallpaper'
  color?: string
  gradient?: {
    colors: string[]
    angle: number
  }
  image?: string
  wallpaper?: string
  blur?: number
  padding: number
  cornerRadius?: number  // Video corner radius in pixels
  shadowIntensity?: number  // Shadow intensity 0-100
}

export interface AnnotationData {
  type?: 'text' | 'arrow' | 'highlight' | 'keyboard'
  position?: { x: number; y: number }
  content?: string
  style?: any
  // Optional discriminator for advanced behaviors (e.g., 'screen3d', 'scrollCinematic')
  kind?: string
  // Generic payload to support custom annotation kinds
  [key: string]: any
}

export interface Annotation {
  id: string
  type: 'text' | 'arrow' | 'highlight' | 'keyboard'
  startTime: number
  endTime: number
  position: { x: number; y: number }
  data: any  // Type-specific data
}

export interface Transition {
  type: 'fade' | 'dissolve' | 'wipe' | 'slide'
  duration: number
  easing: string
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
  format: 'mp4' | 'webm' | 'gif' | 'mov'
  codec: string
  quality: 'low' | 'medium' | 'high' | 'ultra'
  resolution: {
    width: number
    height: number
  }
  frameRate: number
  bitrate?: number
}

export type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'complete' | 'error'

export interface ScreenEffectData {
  // Simple preset selector; actual parameters derived by renderer
  preset: 'subtle' | 'medium' | 'dramatic' | 'window' | 'cinematic' | 'hero' | 'isometric' | 'flat' | 'tilt-left' | 'tilt-right'
  // Optional fine-tune overrides
  tiltX?: number
  tiltY?: number
  perspective?: number
}
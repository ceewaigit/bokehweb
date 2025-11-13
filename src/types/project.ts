/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 * 
 * This file contains ONLY type definitions - no business logic
 */

// Import and re-export EffectType for convenience
import type { EffectType } from './effects'
export { EffectType } from './effects'

// Enums for various types
export enum TrackType {
  Video = 'video',
  Audio = 'audio',
  Annotation = 'annotation'
}

// Timeline display track types (includes effect lanes)
export enum TimelineTrackType {
  Video = 'video',
  Audio = 'audio',
  Zoom = 'zoom',
  Keystroke = 'keystroke'
}

export enum TransitionType {
  Fade = 'fade',
  Dissolve = 'dissolve',
  Wipe = 'wipe',
  Slide = 'slide'
}

export enum RecordingSourceType {
  Screen = 'screen',
  Window = 'window',
  Area = 'area'
}

export enum ExportFormat {
  MP4 = 'mp4',
  MOV = 'mov',
  WEBM = 'webm',
  GIF = 'gif'
}

export enum QualityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Ultra = 'ultra',
  Custom = 'custom'
}

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
  metadata?: RecordingMetadata

  // Effects stored in source space (timestamps relative to recording start)
  effects: Effect[]

  // Folder-based storage for this recording (absolute or project-relative)
  folderPath?: string

  // Manifest of metadata chunk files stored on disk under folderPath
  metadataChunks?: {
    mouse?: string[]
    keyboard?: string[]
    click?: string[]
    scroll?: string[]
    screen?: string[]
  }
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
  sourceType?: RecordingSourceType
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

  // Screen dimensions changes
  screenEvents: ScreenEvent[]

  // Capture area information for cropping during export
  captureArea?: CaptureArea

  // Cached typing detection results (computed once, reused across clips)
  detectedTypingPeriods?: TypingPeriod[]
}

// Typing period detected in recording
export interface TypingPeriod {
  startTime: number  // Source timestamp
  endTime: number    // Source timestamp
  keyCount: number
  averageWPM: number
  suggestedSpeedMultiplier: number
}

export interface MouseEvent {
  timestamp: number
  sourceTimestamp?: number
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
  sourceTimestamp?: number
  deltaX: number
  deltaY: number
}

export interface KeyboardEvent {
  timestamp: number
  sourceTimestamp?: number
  key: string
  modifiers: string[]
}

export interface ClickEvent {
  timestamp: number
  sourceTimestamp?: number
  x: number
  y: number
  button: MouseButton
}

export interface ScreenEvent {
  timestamp: number
  width: number
  height: number
}

export interface Timeline {
  tracks: Track[]
  duration: number
  // Global effects (backgrounds, etc.) that apply to entire timeline
  // Note: Most effects now live on Recording in source space
  effects?: Effect[]
}

export interface Track {
  id: string
  name: string
  type: TrackType
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

  // Playback control
  playbackRate?: number // Speed multiplier (1.0 = normal, 2.0 = 2x speed, 0.5 = half speed)
  typingSpeedApplied?: boolean // Flag to indicate typing speed has been applied to this clip

  // Time remapping for variable speed (typing speed, etc)
  timeRemapPeriods?: TimeRemapPeriod[]

  // Transitions
  transitionIn?: Transition
  transitionOut?: Transition
}

// Time remapping period for variable playback speed
export interface TimeRemapPeriod {
  // Source time range (in recording coordinates)
  sourceStartTime: number
  sourceEndTime: number
  // Playback speed multiplier for this period
  speedMultiplier: number
}

// Effect entity - timing in source space (recording timestamps)
export interface Effect {
  id: string
  type: EffectType

  // Timing in source space (relative to recording start)
  // For effects on recordings: timestamp in source recording
  // For global effects on timeline: timeline timestamp
  startTime: number
  endTime: number

  // Effect-specific data
  data: ZoomEffectData | CursorEffectData | KeystrokeEffectData | BackgroundEffectData | AnnotationData | ScreenEffectData

  // Common properties
  enabled: boolean
  locked?: boolean
}

export interface ZoomBlock {
  id: string
  startTime: number
  endTime: number
  scale: number
  targetX?: number
  targetY?: number
  introMs?: number  // Duration of zoom in animation
  outroMs?: number  // Duration of zoom out animation
}

// Background type enum
export enum BackgroundType {
  None = 'none',
  Color = 'color',
  Gradient = 'gradient',
  Image = 'image',
  Wallpaper = 'wallpaper'
}

// Screen effect preset enum
export enum ScreenEffectPreset {
  Subtle = 'subtle',
  Medium = 'medium',
  Dramatic = 'dramatic',
  Window = 'window',
  Cinematic = 'cinematic',
  Hero = 'hero',
  Isometric = 'isometric',
  Flat = 'flat',
  TiltLeft = 'tilt-left',
  TiltRight = 'tilt-right'
}

// Annotation type enum
export enum AnnotationType {
  Text = 'text',
  Arrow = 'arrow',
  Highlight = 'highlight',
  Keyboard = 'keyboard'
}

// Cursor style enum
export enum CursorStyle {
  Default = 'default',
  MacOS = 'macOS',
  Custom = 'custom'
}

// Zoom follow strategy enum
export enum ZoomFollowStrategy {
  Mouse = 'mouse'
}

// Keystroke position enum
export enum KeystrokePosition {
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right',
  TopCenter = 'top-center'
}

export enum MouseButton {
  Left = 'left',
  Right = 'right',
  Middle = 'middle'
}

// New: Effect-specific data types for independent effects
export interface ZoomEffectData {
  scale: number
  targetX?: number
  targetY?: number
  introMs: number
  outroMs: number
  smoothing: number
  // Follow strategy: mouse only
  followStrategy?: ZoomFollowStrategy
  // Mouse idle threshold in pixels (physical) to consider idle within the velocity window
  mouseIdlePx?: number
}

export interface CursorEffectData {
  style: CursorStyle
  size: number
  color: string
  clickEffects: boolean
  motionBlur: boolean
  hideOnIdle: boolean
  idleTimeout: number
  gliding: boolean
  speed: number
  smoothness: number
}

export interface KeystrokeEffectData {
  position?: KeystrokePosition
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
  type: BackgroundType
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

// Annotation style definition
export interface AnnotationStyle {
  color?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  padding?: number | { top: number; right: number; bottom: number; left: number }
  opacity?: number
  strokeWidth?: number
  arrowHeadSize?: number
}

export interface AnnotationData {
  type?: 'text' | 'arrow' | 'highlight' | 'keyboard'
  position?: { x: number; y: number }
  content?: string
  style?: AnnotationStyle
  // Optional discriminator for advanced behaviors (e.g., 'screen3d', 'scrollCinematic')
  kind?: string
  // Additional properties for specific annotation types
  endPosition?: { x: number; y: number } // For arrows
  width?: number // For highlights
  height?: number // For highlights
  keys?: string[] // For keyboard annotations
}

export interface Annotation {
  id: string
  type: AnnotationType
  startTime: number
  endTime: number
  position: { x: number; y: number }
  data: any  // Type-specific data
}

export interface Transition {
  type: TransitionType
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
  format: ExportFormat
  codec: string
  quality: QualityLevel
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
  preset: ScreenEffectPreset
  // Optional fine-tune overrides
  tiltX?: number
  tiltY?: number
  perspective?: number
  // Optional easing durations for tilt intro/outro (ms)
  introMs?: number
  outroMs?: number
}

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  status: 'idle' | 'preparing' | 'recording' | 'paused' | 'processing'
}

export interface RecordingSettings {
  area: 'fullscreen' | 'window' | 'region'
  audioInput: 'system' | 'microphone' | 'both' | 'none'
  quality: 'high' | 'medium' | 'low'
  framerate: 30 | 60
  format: 'mp4' | 'mov' | 'webm'
}

// Re-export from project.ts to avoid duplication
export type {
  Project,
  Recording,
  Clip as TimelineClip,
  ProjectSettings,
  KeyboardEvent,
  MouseEvent,
  ClickEvent,
  Timeline,
  Track,
  ClipEffects,
  Annotation,
  Transition,
  ExportPreset,
  ZoomBlock
} from './project'

// Keyframe interface for animations
export interface KeyframeData {
  time: number
  value: any
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'gif' | 'webm'
  quality: 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  resolution: { width: number; height: number }
  framerate: number
  bitrate?: number
  outputPath: string
}
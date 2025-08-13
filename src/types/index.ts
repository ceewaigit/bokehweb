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
  Clip as TimelineClip, // Alias for backward compatibility
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
  ZoomKeyframe
} from './project'

// Keep KeyframeData here as it's not in project.ts
export interface KeyframeData {
  time: number
  value: any
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

// Keep Animation here temporarily for compatibility
export interface Animation {
  id: string
  property: string
  keyframes: KeyframeData[]
  target: string
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'gif' | 'webm'
  quality: 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  resolution: { width: number; height: number }
  framerate: number
  bitrate?: number
  outputPath: string
}
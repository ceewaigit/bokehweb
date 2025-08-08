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

export interface TimelineClip {
  id: string
  type: 'video' | 'audio' | 'image'
  name: string
  startTime: number
  duration: number
  trackIndex: number
  source: string
  thumbnail?: string
  enhancements?: any // Enhancement settings applied during recording
  originalSource?: string // Original unenhanced version
}

export interface KeyframeData {
  time: number
  value: any
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export interface Animation {
  id: string
  property: string
  keyframes: KeyframeData[]
  target: string
}

export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
  clips: TimelineClip[]
  animations: Animation[]
  settings: ProjectSettings
}

export interface ProjectSettings {
  resolution: { width: number; height: number }
  framerate: number
  duration: number
  audioSampleRate: number
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'gif' | 'webm'
  quality: 'low' | 'medium' | 'high' | 'custom'
  resolution: { width: number; height: number }
  framerate: number
  bitrate?: number
  outputPath: string
}
import type { ClipEffects } from '@/types/project'

export const DEFAULT_CLIP_EFFECTS: ClipEffects = {
  zoom: {
    enabled: false,
    keyframes: [],
    sensitivity: 1.0,
    maxZoom: 2.0,
    smoothing: 0.1
  },
  cursor: {
    visible: true,
    style: 'default',
    size: 1.0,
    color: '#ffffff',
    clickEffects: false,
    motionBlur: false
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#1e293b', '#0f172a'],
      angle: 135
    },
    padding: 60
  },
  video: {
    cornerRadius: 24,
    shadow: {
      enabled: true,
      blur: 60,
      color: 'rgba(0, 0, 0, 0.5)',
      offset: { x: 0, y: 25 }
    },
    scale: 0.85  // 85% size by default for better framing
  },
  annotations: []
}

export const SCREEN_STUDIO_CLIP_EFFECTS: ClipEffects = {
  zoom: {
    enabled: true,
    keyframes: [],
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
    cornerRadius: 24,
    shadow: {
      enabled: true,
      blur: 80,
      color: 'rgba(0, 0, 0, 0.6)',
      offset: { x: 0, y: 30 }
    },
    scale: 0.75  // 75% size for Screen Studio style with more background visible
  },
  annotations: []
}
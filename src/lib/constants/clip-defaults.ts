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
    type: 'none',
    padding: 0
  },
  video: {
    cornerRadius: 0,
    shadow: {
      enabled: false,
      blur: 0,
      color: '#000000',
      offset: { x: 0, y: 0 }
    },
    scale: 1.0  // Full size by default
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
    cornerRadius: 12,
    shadow: {
      enabled: true,
      blur: 40,
      color: '#000000',
      offset: { x: 0, y: 20 }
    },
    scale: 0.8  // 80% size for Screen Studio style
  },
  annotations: []
}
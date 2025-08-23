import type { ClipEffects } from '@/types/project'

export const DEFAULT_CLIP_EFFECTS: ClipEffects = {
  zoom: {
    enabled: false,
    blocks: [],
    sensitivity: 1.0,
    maxZoom: 2.0,
    smoothing: 0.1
  },
  cursor: {
    visible: true,
    style: 'default',
    size: 2.0,  // Default 2x size for better visibility
    color: '#ffffff',
    clickEffects: false,
    motionBlur: false
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#f3f4f6', '#e5e7eb'],  // Light gray gradient
      angle: 135
    },
    padding: 60  // Default padding around video
  },
  video: {
    cornerRadius: 24,
    shadow: {
      enabled: true,
      blur: 60,
      color: 'rgba(0, 0, 0, 0.5)',
      offset: { x: 0, y: 25 }
    }
  },
  annotations: []
}

export const SCREEN_STUDIO_CLIP_EFFECTS: ClipEffects = {
  zoom: {
    enabled: true,
    blocks: [],
    sensitivity: 1.0,
    maxZoom: 2.0,
    smoothing: 0.1
  },
  cursor: {
    visible: true,
    style: 'macOS',
    size: 2.0,  // Default 2x size matching Screen Studio
    color: '#ffffff',
    clickEffects: true,
    motionBlur: true
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#f0f9ff', '#e0f2fe'],  // Light blue gradient for Screen Studio style
      angle: 135
    },
    padding: 120  // More padding for Screen Studio style
  },
  video: {
    cornerRadius: 24,
    shadow: {
      enabled: true,
      blur: 80,
      color: 'rgba(0, 0, 0, 0.6)',
      offset: { x: 0, y: 30 }
    }
  },
  annotations: []
}
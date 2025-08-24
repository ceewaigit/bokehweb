import type { ClipEffects } from '@/types/project'

// Function to get default clip effects with current wallpaper if available
export function getDefaultClipEffects(): ClipEffects {
  return structuredClone(DEFAULT_CLIP_EFFECTS)
}

export const DEFAULT_CLIP_EFFECTS: ClipEffects = {
  zoom: {
    enabled: false,
    blocks: [],
    sensitivity: 1.0,
    maxZoom: 2.0,
    smoothing: 0.1
  },
  cursor: {
    style: 'default',
    size: 4.0,
    color: '#ffffff',
    clickEffects: false,
    motionBlur: false,
    hideOnIdle: true,
    idleTimeout: 3000
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#2D3748', '#1A202C'], // Sonoma-like gradient
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
    style: 'macOS',
    size: 4.0,
    color: '#ffffff',
    clickEffects: true,
    motionBlur: true,
    hideOnIdle: true,
    idleTimeout: 3000
  },
  background: {
    type: 'gradient',
    gradient: {
      colors: ['#2D3748', '#1A202C'], // Sonoma-like gradient
      angle: 135
    },
    padding: 120
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
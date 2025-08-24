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
    enabled: true,
    style: 'default',
    size: 4.0,
    color: '#ffffff',
    clickEffects: false,
    motionBlur: false,
    hideOnIdle: true,
    idleTimeout: 3000
  },
  background: {
    type: 'wallpaper',
    gradient: {
      colors: ['#2D3748', '#1A202C'],
      angle: 135
    },
    wallpaper: undefined,
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
    enabled: true,
    style: 'macOS',
    size: 4.0,
    color: '#ffffff',
    clickEffects: true,
    motionBlur: true,
    hideOnIdle: true,
    idleTimeout: 3000
  },
  background: {
    type: 'wallpaper',
    gradient: {
      colors: ['#2D3748', '#1A202C'],
      angle: 135
    },
    wallpaper: undefined,
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
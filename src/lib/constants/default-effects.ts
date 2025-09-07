import type { BackgroundEffectData, CursorEffectData, ZoomEffectData } from '@/types/project'

// Default background effect data
export const DEFAULT_BACKGROUND_DATA: BackgroundEffectData = {
  type: 'wallpaper',
  gradient: {
    colors: ['#2D3748', '#1A202C'],
    angle: 135
  },
  wallpaper: undefined,
  padding: 40
}

// Screen Studio style background effect data
export const SCREEN_STUDIO_BACKGROUND_DATA: BackgroundEffectData = {
  type: 'wallpaper',
  gradient: {
    colors: ['#2D3748', '#1A202C'],
    angle: 135
  },
  wallpaper: undefined,
  padding: 40
}

// Default cursor effect data
export const DEFAULT_CURSOR_DATA: CursorEffectData = {
  style: 'default',
  size: 3.0,
  color: '#ffffff',
  clickEffects: false,
  motionBlur: false,
  hideOnIdle: true,
  idleTimeout: 3000
}

// Store for default wallpaper once loaded
let defaultWallpaper: string | undefined = undefined
let wallpaperInitialized = false

export function setDefaultWallpaper(wallpaper: string) {
  defaultWallpaper = wallpaper
  DEFAULT_BACKGROUND_DATA.wallpaper = wallpaper
  SCREEN_STUDIO_BACKGROUND_DATA.wallpaper = wallpaper
}

export function getDefaultWallpaper(): string | undefined {
  return defaultWallpaper
}

// Initialize default wallpaper on app startup
export async function initializeDefaultWallpaper() {
  // Skip if already initialized
  if (wallpaperInitialized) {
    return
  }

  wallpaperInitialized = true

  if (typeof window === 'undefined' || !window.electronAPI?.loadWallpaperImage) {
    return
  }

  try {
    const dataUrl = await window.electronAPI.loadWallpaperImage('/System/Library/Desktop Pictures/Sonoma.heic')
    if (dataUrl) {
      setDefaultWallpaper(dataUrl)
    }
  } catch (error) {
    // Silently fail - will use gradient background
  }
}
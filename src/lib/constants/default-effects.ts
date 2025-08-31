import type { BackgroundEffectData, CursorEffectData, ZoomEffectData } from '@/types/project'

// Default background effect data
export const DEFAULT_BACKGROUND_DATA: BackgroundEffectData = {
  type: 'wallpaper',
  gradient: {
    colors: ['#2D3748', '#1A202C'],
    angle: 135
  },
  wallpaper: undefined,
  padding: 80
}

// Screen Studio style background effect data
export const SCREEN_STUDIO_BACKGROUND_DATA: BackgroundEffectData = {
  type: 'wallpaper',
  gradient: {
    colors: ['#2D3748', '#1A202C'],
    angle: 135
  },
  wallpaper: undefined,
  padding: 80
}

// Default cursor effect data
export const DEFAULT_CURSOR_DATA: CursorEffectData = {
  style: 'default',
  size: 4.0,
  color: '#ffffff',
  clickEffects: false,
  motionBlur: false,
  hideOnIdle: true,
  idleTimeout: 3000
}

// Screen Studio style cursor effect data
export const SCREEN_STUDIO_CURSOR_DATA: CursorEffectData = {
  style: 'macOS',
  size: 4.0,
  color: '#ffffff',
  clickEffects: true,
  motionBlur: true,
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
    console.log('Wallpaper already initialized, skipping')
    return
  }

  wallpaperInitialized = true
  console.log('Initializing default wallpaper...')

  if (typeof window === 'undefined' || !window.electronAPI?.loadWallpaperImage) {
    console.warn('ElectronAPI not available for wallpaper loading')
    return
  }

  try {
    console.log('Loading Sonoma wallpaper...')
    const dataUrl = await window.electronAPI.loadWallpaperImage('/System/Library/Desktop Pictures/Sonoma.heic')
    if (dataUrl) {
      console.log('Sonoma wallpaper loaded successfully, data URL length:', dataUrl.length)
      setDefaultWallpaper(dataUrl)
    } else {
      console.warn('No data URL returned for Sonoma wallpaper')
    }
  } catch (error) {
    console.error('Failed to load Sonoma wallpaper:', error)
    // Silently fail - will use gradient background
  }
}
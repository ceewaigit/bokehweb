import type { BackgroundEffectData, CursorEffectData, KeystrokeEffectData } from '@/types/project'
import { BackgroundType, CursorStyle, KeystrokePosition, ScreenEffectPreset } from '@/types/project'

// Default background effect data
export const DEFAULT_BACKGROUND_DATA: BackgroundEffectData = {
  type: BackgroundType.Wallpaper,
  gradient: {
    colors: ['#2D3748', '#1A202C'],
    angle: 135
  },
  wallpaper: undefined,
  padding: 40,
  cornerRadius: 15,
  shadowIntensity: 85
}

// Default screen effect presets
export const SCREEN_EFFECT_PRESETS: Record<string, { tiltX: number; tiltY: number; perspective: number }> = {
  [ScreenEffectPreset.Subtle]: { tiltX: -2, tiltY: 4, perspective: 1000 },
  [ScreenEffectPreset.Medium]: { tiltX: -4, tiltY: 8, perspective: 900 },
  [ScreenEffectPreset.Dramatic]: { tiltX: -8, tiltY: 14, perspective: 800 },
  [ScreenEffectPreset.Window]: { tiltX: -3, tiltY: 12, perspective: 700 },
  [ScreenEffectPreset.Cinematic]: { tiltX: -5, tiltY: 10, perspective: 850 },
  [ScreenEffectPreset.Hero]: { tiltX: -10, tiltY: 16, perspective: 760 },
  [ScreenEffectPreset.Isometric]: { tiltX: -25, tiltY: 25, perspective: 950 },
  [ScreenEffectPreset.Flat]: { tiltX: 0, tiltY: 0, perspective: 1200 },
  [ScreenEffectPreset.TiltLeft]: { tiltX: -6, tiltY: -10, perspective: 900 },
  [ScreenEffectPreset.TiltRight]: { tiltX: -6, tiltY: 10, perspective: 900 }
}

// Default cursor effect data
export const DEFAULT_CURSOR_DATA: CursorEffectData = {
  style: CursorStyle.MacOS,
  size: 4.0,
  color: '#ffffff',
  clickEffects: true,
  motionBlur: true,
  hideOnIdle: true,
  idleTimeout: 3000,
  gliding: true,
  speed: 0.2,
  smoothness: 0.85
}

// Default keystroke effect data
export const DEFAULT_KEYSTROKE_DATA: KeystrokeEffectData = {
  fontSize: 16,
  fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.2)',
  borderRadius: 6,
  padding: 12,
  fadeOutDuration: 300,
  position: KeystrokePosition.BottomCenter,
  maxWidth: 300
}

// Store for default wallpaper once loaded
let defaultWallpaper: string | undefined = undefined
let wallpaperInitialized = false

export function setDefaultWallpaper(wallpaper: string) {
  defaultWallpaper = wallpaper
  DEFAULT_BACKGROUND_DATA.wallpaper = wallpaper
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

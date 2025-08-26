import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Only keep the most useful vibrancy options for macOS
export type VibrancyType = 
  | 'under-window'
  | 'sidebar'
  | 'ultra-dark'

// Windows 11 materials
export type BackgroundMaterial = 
  | 'acrylic'
  | 'mica'

interface GlassmorphismState {
  opacity: number // 0-100
  blurRadius: number // 0-50
  
  // Actions
  setOpacity: (opacity: number) => void
  setBlurRadius: (radius: number) => void
  applySettings: () => void
}

export const useGlassmorphismStore = create<GlassmorphismState>()(
  persist(
    (set, get) => ({
      opacity: 80,
      blurRadius: 10,
      
      setOpacity: (opacity) => {
        set({ opacity: Math.max(0, Math.min(100, opacity)) })
        get().applySettings()
      },
      
      setBlurRadius: (blurRadius) => {
        set({ blurRadius: Math.max(0, Math.min(50, blurRadius)) })
        get().applySettings()
      },
      
      applySettings: () => {
        const { opacity, blurRadius } = get()
        
        // Update CSS variables for UI elements
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--glass-opacity', `${opacity / 100}`)
          document.documentElement.style.setProperty('--glass-blur', `${blurRadius}px`)
        }
        
        // Send opacity to Electron to control window transparency
        if (window.electronAPI?.updateGlassmorphism) {
          window.electronAPI.updateGlassmorphism({
            opacity,
            blurRadius
          })
        }
      }
    }),
    {
      name: 'glassmorphism-settings'
    }
  )
)
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
          // Convert opacity to 0-1 range for CSS
          const cssOpacity = opacity / 100
          
          // Set glassmorphism overlay opacity
          document.documentElement.style.setProperty('--glass-opacity', `${cssOpacity}`)
          document.documentElement.style.setProperty('--glass-blur', `${blurRadius}px`)
          
          // Set window background opacity (like Warp terminal)
          // This controls the background transparency while keeping text opaque
          document.documentElement.style.setProperty('--window-bg-opacity', `${cssOpacity}`)
        }
        
        // Notify Electron (though it doesn't need to do anything now)
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
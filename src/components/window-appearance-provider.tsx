"use client"

import { useEffect } from 'react'
import { useWindowAppearanceStore, type WindowSurfaceMode } from '@/stores/window-appearance-store'

function modeToVars(mode: WindowSurfaceMode, opacity: number, blurPx: number) {
  // Solid mode: handled by CSS [data-window-surface="solid"] selector
  if (mode === 'solid') {
    return { opacity: 1, blurPx: 0 }
  }
  // "clear" means high opacity dark tint with no blur
  if (mode === 'clear') return { opacity: Math.min(0.98, Math.max(0.70, opacity)), blurPx: 0 }
  // 'glass' and 'custom' use lower opacity + blur for frosted see-through effect
  return { opacity: Math.min(0.85, Math.max(0.15, opacity)), blurPx: Math.max(1, blurPx) }
}

export function WindowAppearanceProvider({ children }: { children: React.ReactNode }) {
  const mode = useWindowAppearanceStore((s) => s.mode)
  const opacity = useWindowAppearanceStore((s) => s.opacity)
  const blurPx = useWindowAppearanceStore((s) => s.blurPx)

  const isRecordButton = typeof window !== 'undefined' && window.location.hash === '#/record-button'
  const isAreaSelection = typeof window !== 'undefined' && window.location.hash === '#/area-selection'

  useEffect(() => {
    // Force the renderer surface itself to be transparent; UI surfaces should be explicit.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const vars = modeToVars(mode, opacity, blurPx)

    root.style.setProperty('--window-surface-opacity', String(vars.opacity))
    // Scale blur for more gradual, linear curve - slider value * 0.5 = actual blur
    // This makes low blur values (1-5px) much more subtle and the transition smoother
    const scaledBlur = vars.blurPx * 0.5
    root.style.setProperty('--window-surface-blur', `${scaledBlur}px`)
    root.dataset.windowSurface = mode
  }, [mode, opacity, blurPx])

  useEffect(() => {
    // Never change main-process window settings for overlays.
    if (typeof window === 'undefined') return
    if (window.location.hash === '#/record-button') return
    if (window.location.hash === '#/area-selection') return

    // On macOS, vibrancy enables background blurring behind a transparent window.
    // Use a neutral material to avoid the blue-ish tint.
    // Re-apply when any appearance value changes to ensure native effects update with presets.
    const desiredVibrancy = (mode === 'glass' || mode === 'custom') ? 'sidebar' : null
    window.electronAPI?.setWindowVibrancy?.(desiredVibrancy).catch(() => { })
    window.electronAPI?.setWindowHasShadow?.(mode === 'solid').catch(() => { })
  }, [mode, opacity, blurPx])

  if (isRecordButton || isAreaSelection) return children

  return <div className="h-screen w-screen window-surface">{children}</div>
}

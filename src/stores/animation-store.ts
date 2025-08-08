import { create } from 'zustand'
import type { Animation } from '@/types'

interface AnimationPlaybackControls {
  play: () => void
  pause: () => void
  stop: () => void
  seek: (time: number) => void
}

interface AnimationStore {
  animations: Animation[]
  activeAnimations: Map<string, AnimationPlaybackControls>
  isPlaying: boolean
  currentTime: number

  // Core actions
  addAnimation: (animation: Animation) => void
  removeAnimation: (id: string) => void
  updateAnimation: (id: string, updates: Partial<Animation>) => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (time: number) => void

  // Direct Framer Motion helpers
  animateElement: (selector: string, properties: any, options?: any) => void
  addSmoothZoom: (target: string, duration: number, endZoom: number) => void
  addCursorHighlight: (duration: number) => void
  addClickRipple: (target: string, duration: number) => void
  addFadeTransition: (target: string, duration: number) => void
}

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  animations: [],
  activeAnimations: new Map(),
  isPlaying: false,
  currentTime: 0,

  addAnimation: (animation) => {
    set((state) => ({
      animations: [...state.animations, animation]
    }))
  },

  removeAnimation: (id) => {
    const state = get()
    const controls = state.activeAnimations.get(id)
    if (controls) {
      controls.stop()
      state.activeAnimations.delete(id)
    }

    set((state) => ({
      animations: state.animations.filter(anim => anim.id !== id),
      activeAnimations: new Map(state.activeAnimations)
    }))
  },

  updateAnimation: (id, updates) => {
    set((state) => ({
      animations: state.animations.map(anim =>
        anim.id === id ? { ...anim, ...updates } : anim
      )
    }))
  },

  play: () => {
    const state = get()
    state.activeAnimations.forEach(controls => controls.play())
    set({ isPlaying: true })
  },

  pause: () => {
    const state = get()
    state.activeAnimations.forEach(controls => controls.pause())
    set({ isPlaying: false })
  },

  stop: () => {
    const state = get()
    state.activeAnimations.forEach(controls => controls.stop())
    set({ isPlaying: false, currentTime: 0 })
  },

  seek: (time) => {
    const state = get()
    const clampedTime = Math.max(0, time) // Clamp to 0 or higher
    state.activeAnimations.forEach(controls => controls.seek(clampedTime))
    set({ currentTime: clampedTime })
  },

  // Direct Framer Motion helpers
  animateElement: (selector, properties, options = {}) => {
    // Basic implementation - can be enhanced with actual Framer Motion integration
    if (typeof document !== 'undefined') {
      const element = document.querySelector(selector)
      if (element) {
        console.log(`Animating ${selector} with properties:`, properties)
        // For now, just log the animation - can be enhanced with actual animation library
      }
    }
  },

  addSmoothZoom: (target, duration, endZoom) => {
    const animation: Animation = {
      id: `zoom-${Date.now()}`,
      property: 'scale',
      target,
      keyframes: [
        { time: 0, value: 1, easing: 'ease-out' },
        { time: duration, value: endZoom, easing: 'ease-in-out' }
      ]
    }
    get().addAnimation(animation)
  },

  addCursorHighlight: (duration) => {
    const animation: Animation = {
      id: `cursor-highlight-${Date.now()}`,
      property: 'opacity',
      target: '.cursor-highlight',
      keyframes: [
        { time: 0, value: 0, easing: 'ease-in' },
        { time: duration * 0.2, value: 1, easing: 'ease-out' },
        { time: duration * 0.8, value: 1, easing: 'ease-in' },
        { time: duration, value: 0, easing: 'ease-out' }
      ]
    }
    get().addAnimation(animation)
  },

  addClickRipple: (target, duration) => {
    const animation: Animation = {
      id: `click-ripple-${Date.now()}`,
      property: 'scale',
      target,
      keyframes: [
        { time: 0, value: 0, easing: 'ease-out' },
        { time: duration * 0.3, value: 1.2, easing: 'ease-in-out' },
        { time: duration, value: 0, easing: 'ease-in' }
      ]
    }
    get().addAnimation(animation)
  },

  addFadeTransition: (target, duration) => {
    const animation: Animation = {
      id: `fade-${Date.now()}`,
      property: 'opacity',
      target,
      keyframes: [
        { time: 0, value: 1, easing: 'ease-in' },
        { time: duration * 0.5, value: 0, easing: 'ease-in-out' },
        { time: duration, value: 1, easing: 'ease-out' }
      ]
    }
    get().addAnimation(animation)
  }
}))
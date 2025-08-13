/**
 * Shared types for the effects system
 */

import type { MouseEvent, ClickEvent } from '@/types/project'

// Extended event type that includes both mouse and click events
export interface ProjectEvent extends MouseEvent {
  type: 'move' | 'click' | 'keypress' | 'scroll'
  button?: 'left' | 'right' | 'middle'
  key?: string
  scrollDelta?: { x: number; y: number }
}

// Base effect interface
export interface Effect {
  id: string
  type: string
  startTime: number
  endTime: number
  params: any
}

// Zoom effect specifically
export interface ZoomEffect extends Effect {
  type: 'zoom'
  params: {
    targetX: number      // Initial focus point (normalized 0-1)
    targetY: number      // Initial focus point (normalized 0-1)
    scale: number        // Zoom level (e.g., 1.8)
    introMs: number      // Intro animation duration
    outroMs: number      // Outro animation duration
  }
}

// Effect state at a given timestamp
export interface EffectState {
  zoom?: {
    x: number
    y: number
    scale: number
  }
  // Future: pan, rotation, filters, etc.
}

// Recording context for effect detection
export interface RecordingContext {
  duration: number
  width: number
  height: number
  frameRate: number
  metadata: any
  videoScale?: number  // Scale of video relative to canvas (0.3 - 1.0)
  padding?: number     // Padding around video
}

// Base interface for effect detectors
export interface EffectDetector {
  name: string
  detectEffects(events: ProjectEvent[], context: RecordingContext): Effect[]
}
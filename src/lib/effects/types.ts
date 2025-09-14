/**
 * Shared types for the effects system
 */

import type { MouseEvent, ClickEvent, Effect } from '@/types/project'
import { EffectType } from '@/types/project'

// Extended event type that includes both mouse and click events
export interface ProjectEvent extends MouseEvent {
  type: 'move' | 'click' | 'keypress' | 'scroll'
  button?: 'left' | 'right' | 'middle'
  key?: string
  scrollDelta?: { x: number; y: number }
}

// Zoom effect specifically (extends from centralized Effect type)
export interface ZoomEffect extends Effect {
  type: EffectType.Zoom
  params: {
    scale: number        // Zoom level (e.g., 1.8)
    introMs: number      // Intro animation duration
    outroMs: number      // Outro animation duration
    // Note: zoom target is dynamically calculated from mouse position
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
  padding?: number     // Padding around video
}

// Base interface for effect detectors
export interface EffectDetector {
  name: string
  detectEffects(events: ProjectEvent[], context: RecordingContext): Effect[]
}
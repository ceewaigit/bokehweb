/**
 * Store interface types - centralized to avoid circular dependencies
 */

import type { 
  Project, 
  Clip, 
  Track, 
  Recording, 
  Effect,
  ZoomEffectData,
  CursorEffectData,
  BackgroundEffectData
} from './project'
import type { SelectedEffectLayer, EffectLayerType } from './effects'
import { EffectType } from './effects'

// Clipboard effect type with proper union typing for data
export interface ClipboardEffect {
  type: EffectType.Zoom | EffectType.Cursor | EffectType.Background
  data: ZoomEffectData | CursorEffectData | BackgroundEffectData
  sourceClipId: string
}

// ProjectStore interface extracted from CommandContext to avoid circular dependency
export interface ProjectStore {
  currentProject: Project | null
  currentTime: number
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: ClipboardEffect
  }
  
  // Store methods used by commands
  addClip: (clip: Clip | string, startTime?: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>, options?: { exact?: boolean }) => void
  // New restore API to reinsert a clip at a specific track/index
  restoreClip: (trackId: string, clip: Clip, index: number) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  splitClip: (clipId: string, splitTime: number) => void
  trimClipStart: (clipId: string, newStartTime: number) => void
  trimClipEnd: (clipId: string, newEndTime: number) => void
  duplicateClip: (clipId: string) => string | null
  copyClip: (clip: Clip) => void
  copyEffect: (type: EffectType.Zoom | EffectType.Cursor | EffectType.Background, data: ZoomEffectData | CursorEffectData | BackgroundEffectData, sourceClipId: string) => void
  clearClipboard: () => void
  
  // Effects Management (timeline-global)
  addEffect: (effect: Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<Effect>) => void
  getEffectsAtTimeRange: (clipId: string) => Effect[]
  
  // Typing Speed
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
}
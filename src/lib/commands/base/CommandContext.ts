import type { Project, Clip, Track, Recording } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'

// Define ProjectStore interface locally to avoid circular dependency
interface ProjectStore {
  currentProject: Project | null
  currentTime: number
  selectedClips: string[]
  selectedEffectLayer: SelectedEffectLayer
  clipboard: {
    clip?: Clip
    effect?: { type: 'zoom' | 'cursor' | 'background'; data: any; sourceClipId: string }
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
  copyEffect: (type: 'zoom' | 'cursor' | 'background', data: any, sourceClipId: string) => void
  clearClipboard: () => void
  
  // Effects Management (timeline-global)
  addEffect: (effect: import('@/types/project').Effect) => void
  removeEffect: (effectId: string) => void
  updateEffect: (effectId: string, updates: Partial<import('@/types/project').Effect>) => void
  getEffectsAtTimeRange: (clipId: string) => import('@/types/project').Effect[]
  
  // Typing Speed
  applyTypingSpeedToClip: (clipId: string, periods: Array<{
    startTime: number
    endTime: number
    suggestedSpeedMultiplier: number
  }>) => { affectedClips: string[]; originalClips: Clip[] }
}

export interface CommandContext {
  getProject(): Project | null
  getCurrentTime(): number
  getSelectedClips(): string[]
  getSelectedEffectLayer(): SelectedEffectLayer
  getClipboard(): {
    clip?: Clip
    effect?: { type: 'zoom' | 'cursor' | 'background'; data: any; sourceClipId: string }
  }
  
  findClip(clipId: string): { clip: Clip; track: Track } | null
  findRecording(recordingId: string): Recording | null
  
  getStore(): ProjectStore
}

export class DefaultCommandContext implements CommandContext {
  constructor(private store: ProjectStore) {}

  getProject(): Project | null {
    return this.store.currentProject
  }

  getCurrentTime(): number {
    return this.store.currentTime
  }

  getSelectedClips(): string[] {
    return this.store.selectedClips
  }

  getSelectedEffectLayer() {
    return this.store.selectedEffectLayer
  }

  getClipboard() {
    return this.store.clipboard
  }

  findClip(clipId: string): { clip: Clip; track: Track } | null {
    const project = this.getProject()
    if (!project) return null

    for (const track of project.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return { clip, track }
    }
    return null
  }

  findRecording(recordingId: string): Recording | null {
    const project = this.getProject()
    if (!project) return null

    return project.recordings.find(r => r.id === recordingId) || null
  }

  getStore(): ProjectStore {
    return this.store
  }
}

export function hasClipOverlap(
  track: Track,
  clipId: string,
  startTime: number,
  duration: number
): boolean {
  return track.clips.some(clip => {
    if (clip.id === clipId) return false
    const clipEnd = clip.startTime + clip.duration
    return startTime < clipEnd && (startTime + duration) > clip.startTime
  })
}

export function findNextValidPosition(
  track: Track,
  clipId: string,
  desiredStart: number,
  duration: number
): number {
  const GAP_BETWEEN_CLIPS = 100 // 100ms gap for better visual separation
  const otherClips = track.clips
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime)
  
  let proposedStart = desiredStart
  for (const other of otherClips) {
    const otherEnd = other.startTime + other.duration
    // If overlap, move proposed start to after the other clip with a small gap
    if (proposedStart < otherEnd && (proposedStart + duration) > other.startTime) {
      proposedStart = otherEnd + GAP_BETWEEN_CLIPS
    }
  }

  // Ensure start is not negative
  return Math.max(0, proposedStart)
}

export function calculateTimelineDuration(project: Project): number {
  let maxEndTime = 0
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
    }
  }
  return maxEndTime
}
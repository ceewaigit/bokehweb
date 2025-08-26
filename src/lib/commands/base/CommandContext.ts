import type { Project, Clip, Track, Recording } from '@/types/project'

// Define ProjectStore interface locally to avoid circular dependency
interface ProjectStore {
  currentProject: Project | null
  currentTime: number
  selectedClips: string[]
  selectedEffectLayer: { type: 'zoom' | 'cursor' | 'background'; id?: string } | null
  clipboard: {
    clip?: Clip
    effect?: { type: 'zoom' | 'cursor' | 'background'; data: any; sourceClipId: string }
  }
  
  // Store methods used by commands
  addClip: (clip: Clip | string, startTime?: number) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>) => void
  updateClipEffects: (clipId: string, effects: Partial<import('@/types/project').ClipEffects>) => void
  updateZoomBlock: (clipId: string, blockId: string, updates: Partial<import('@/types/project').ZoomBlock>) => void
  addZoomBlock: (clipId: string, block: import('@/types/project').ZoomBlock) => void
  removeZoomBlock: (clipId: string, blockId: string) => void
  selectClip: (clipId: string | null, multi?: boolean) => void
  splitClip: (clipId: string, splitTime: number) => void
  duplicateClip: (clipId: string) => string | null
  copyClip: (clip: Clip) => void
  copyEffect: (type: 'zoom' | 'cursor' | 'background', data: any, sourceClipId: string) => void
  clearClipboard: () => void
}

export interface CommandContext {
  getProject(): Project | null
  getCurrentTime(): number
  getSelectedClips(): string[]
  getSelectedEffectLayer(): { type: 'zoom' | 'cursor' | 'background'; id?: string } | null
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
  const otherClips = track.clips
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime)

  for (const clip of otherClips) {
    const clipEnd = clip.startTime + clip.duration
    if (desiredStart < clipEnd && (desiredStart + duration) > clip.startTime) {
      return clipEnd + 1
    }
  }
  return desiredStart
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
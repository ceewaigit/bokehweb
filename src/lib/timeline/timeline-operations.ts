import type { Project, Track, Clip, Effect, Recording } from '@/types/project'
import { TrackType, EffectType } from '@/types/project'

// Calculate total timeline duration
export function calculateTimelineDuration(project: Project): number {
  let maxEndTime = 0
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      maxEndTime = Math.max(maxEndTime, clip.startTime + clip.duration)
    }
  }
  return maxEndTime
}

// Find clip by ID across all tracks
export function findClipById(project: Project, clipId: string): { clip: Clip; track: Track } | null {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) return { clip, track }
  }
  return null
}

// Shift effects within a time window
export function shiftEffectsInWindow(
  project: Project,
  windowStart: number,
  windowEnd: number,
  delta: number
): void {
  if (!project.timeline.effects || delta === 0) return

  for (const effect of project.timeline.effects) {
    if (effect.type === EffectType.Background) continue
    if (effect.startTime >= windowStart && effect.endTime <= windowEnd) {
      effect.startTime += delta
      effect.endTime += delta
    }
  }
}

// Reflow clips to maintain contiguous layout
export function reflowClips(
  track: Track,
  startFromIndex: number = 0,
  project?: Project
): void {
  if (track.clips.length === 0) return

  track.clips.sort((a, b) => a.startTime - b.startTime)

  if (startFromIndex === 0 && track.clips.length > 0) {
    const firstClip = track.clips[0]
    const oldStart = firstClip.startTime
    const oldEnd = firstClip.startTime + firstClip.duration

    if (oldStart !== 0) {
      firstClip.startTime = 0
      if (project) {
        shiftEffectsInWindow(project, oldStart, oldEnd, -oldStart)
      }
    }
  }

  for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
    const prevClip = track.clips[i - 1]
    const currentClip = track.clips[i]
    const prevEnd = prevClip.startTime + prevClip.duration
    const oldStart = currentClip.startTime
    const oldEnd = currentClip.startTime + currentClip.duration
    const newStart = prevEnd

    if (currentClip.startTime !== newStart) {
      currentClip.startTime = newStart
      const delta = newStart - oldStart
      if (project && delta !== 0) {
        shiftEffectsInWindow(project, oldStart, oldEnd, delta)
      }
    }
  }
}

// Split clip at relative time point
export function splitClipAtTime(
  clip: Clip,
  relativeSplitTime: number
): { firstClip: Clip; secondClip: Clip } | null {
  if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) {
    return null
  }

  const timestamp = Date.now()
  const playbackRate = clip.playbackRate || 1
  const sourceSplitPoint = relativeSplitTime * playbackRate

  const firstClip: Clip = {
    id: `${clip.id}-split1-${timestamp}`,
    recordingId: clip.recordingId,
    startTime: clip.startTime,
    duration: relativeSplitTime,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceIn + sourceSplitPoint,
    playbackRate: clip.playbackRate,
    typingSpeedApplied: clip.typingSpeedApplied
  }

  const secondClip: Clip = {
    id: `${clip.id}-split2-${timestamp}`,
    recordingId: clip.recordingId,
    startTime: clip.startTime + relativeSplitTime,
    duration: clip.duration - relativeSplitTime,
    sourceIn: clip.sourceIn + sourceSplitPoint,
    sourceOut: clip.sourceOut,
    playbackRate: clip.playbackRate,
    typingSpeedApplied: clip.typingSpeedApplied
  }

  return { firstClip, secondClip }
}

// Execute split clip operation
export function executeSplitClip(
  project: Project,
  clipId: string,
  splitTime: number
): { firstClip: Clip; secondClip: Clip } | null {
  const result = findClipById(project, clipId)
  if (!result) return null

  const { clip, track } = result
  const splitResult = splitClipAtTime(clip, splitTime)
  if (!splitResult) return null

  const clipIndex = track.clips.findIndex(c => c.id === clipId)
  track.clips.splice(clipIndex, 1, splitResult.firstClip, splitResult.secondClip)

  project.modifiedAt = new Date().toISOString()
  return splitResult
}

// Trim clip from start
export function trimClipStart(
  clip: Clip,
  newStartTime: number
): Partial<Clip> | null {
  if (newStartTime >= clip.startTime + clip.duration || newStartTime < 0) {
    return null
  }

  const trimAmount = newStartTime - clip.startTime
  return {
    startTime: newStartTime,
    duration: clip.duration - trimAmount,
    sourceIn: clip.sourceIn + trimAmount
  }
}

// Execute trim clip from start
export function executeTrimClipStart(
  project: Project,
  clipId: string,
  newStartTime: number
): boolean {
  const result = findClipById(project, clipId)
  if (!result) return false

  const { clip, track } = result
  const trimResult = trimClipStart(clip, newStartTime)
  if (!trimResult) return false

  Object.assign(clip, trimResult)
  reflowClips(track, 0, project)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Trim clip from end
export function trimClipEnd(
  clip: Clip,
  newEndTime: number
): Partial<Clip> | null {
  if (newEndTime <= clip.startTime || newEndTime < 0) {
    return null
  }

  const newDuration = newEndTime - clip.startTime
  return {
    duration: newDuration,
    sourceOut: clip.sourceIn + newDuration
  }
}

// Execute trim clip from end
export function executeTrimClipEnd(
  project: Project,
  clipId: string,
  newEndTime: number
): boolean {
  const result = findClipById(project, clipId)
  if (!result) return false

  const { clip } = result
  const trimResult = trimClipEnd(clip, newEndTime)
  if (!trimResult) return false

  Object.assign(clip, trimResult)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Get effects overlapping a time range
export function getEffectsInTimeRange(
  effects: Effect[],
  startTime: number,
  endTime: number
): Effect[] {
  return effects.filter(effect =>
    effect.startTime < endTime && effect.endTime > startTime
  )
}

// Check for clip overlaps (internal use only)
function wouldCauseOverlap(
  clips: Clip[],
  clipId: string,
  newStartTime: number,
  duration: number
): boolean {
  return clips.some(otherClip => {
    if (otherClip.id === clipId) return false
    const otherEnd = otherClip.startTime + otherClip.duration
    const newEnd = newStartTime + duration
    return newStartTime < otherEnd && newEnd > otherClip.startTime
  })
}

// Update clip with overlap handling
export function updateClipInTrack(
  project: Project,
  clipId: string,
  updates: Partial<Clip>,
  options?: { exact?: boolean; maintainContiguous?: boolean }
): boolean {
  const result = findClipById(project, clipId)
  if (!result) return false

  const { clip, track } = result
  const prevStartTime = clip.startTime
  const prevDuration = clip.duration

  // Apply updates to the clip
  Object.assign(clip, updates)

  // Always reflow clips to maintain contiguous layout unless explicitly disabled
  if (options?.maintainContiguous !== false) {
    reflowClips(track, 0, project)
  }

  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Add clip to track
export function addClipToTrack(
  project: Project,
  clipOrRecordingId: Clip | string,
  startTime?: number
): Clip | null {
  let clip: Clip

  if (typeof clipOrRecordingId === 'object') {
    clip = clipOrRecordingId
  } else {
    const recording = project.recordings.find(r => r.id === clipOrRecordingId)
    if (!recording) return null

    clip = {
      id: `clip-${Date.now()}`,
      recordingId: clipOrRecordingId,
      startTime: startTime ?? 0,
      duration: recording.duration,
      sourceIn: 0,
      sourceOut: recording.duration
    }
  }

  const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
  if (!videoTrack) return null

  if (startTime === undefined) {
    if (videoTrack.clips.length > 0) {
      const sortedClips = [...videoTrack.clips].sort((a, b) => a.startTime - b.startTime)
      const lastClip = sortedClips[sortedClips.length - 1]
      clip.startTime = lastClip.startTime + lastClip.duration
    } else {
      clip.startTime = 0
    }
  }

  videoTrack.clips.push(clip)
  reflowClips(videoTrack, 0, project)

  project.timeline.duration = Math.max(
    project.timeline.duration,
    clip.startTime + clip.duration
  )
  project.modifiedAt = new Date().toISOString()
  return clip
}

// Remove clip from track
export function removeClipFromTrack(
  project: Project,
  clipId: string
): boolean {
  for (const track of project.timeline.tracks) {
    const index = track.clips.findIndex(c => c.id === clipId)
    if (index !== -1) {
      track.clips.splice(index, 1)
      reflowClips(track, 0, project)
      project.timeline.duration = calculateTimelineDuration(project)
      project.modifiedAt = new Date().toISOString()
      return true
    }
  }
  return false
}

// Duplicate clip
export function duplicateClipInTrack(
  project: Project,
  clipId: string
): Clip | null {
  const result = findClipById(project, clipId)
  if (!result) return null

  const { clip, track } = result
  let desiredStartTime = clip.startTime + clip.duration

  const wouldOverlap = track.clips.some(otherClip => {
    const otherEnd = otherClip.startTime + otherClip.duration
    const newEnd = desiredStartTime + clip.duration
    return (desiredStartTime < otherEnd && newEnd > otherClip.startTime)
  })

  if (wouldOverlap) {
    const sortedClips = [...track.clips].sort((a, b) =>
      (a.startTime + a.duration) - (b.startTime + b.duration)
    )
    const lastClip = sortedClips[sortedClips.length - 1]
    if (lastClip) {
      desiredStartTime = lastClip.startTime + lastClip.duration
    }
  }

  const newClip: Clip = {
    ...clip,
    id: `${clip.id}-copy-${Date.now()}`,
    startTime: desiredStartTime
  }

  track.clips.push(newClip)
  project.timeline.duration = Math.max(
    project.timeline.duration,
    newClip.startTime + newClip.duration
  )
  project.modifiedAt = new Date().toISOString()
  return newClip
}

// Restore clip to track
export function restoreClipToTrack(
  project: Project,
  trackId: string,
  clip: Clip,
  index: number
): boolean {
  const track = project.timeline.tracks.find(t => t.id === trackId)
  if (!track) return false

  const insertIndex = Math.max(0, Math.min(index, track.clips.length))
  track.clips.splice(insertIndex, 0, clip)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()
  return true
}

// Add recording with effects
export function addRecordingToProject(
  project: Project,
  recording: Recording,
  createEffects: (recording: Recording, clip: Clip, existingEffects: Effect[]) => Effect[]
): Clip | null {
  project.recordings.push(recording)

  const clipId = `clip-${Date.now()}`
  const clip: Clip = {
    id: clipId,
    recordingId: recording.id,
    startTime: project.timeline.duration,
    duration: recording.duration,
    sourceIn: 0,
    sourceOut: recording.duration
  }

  if (!project.timeline.effects) {
    project.timeline.effects = []
  }

  const newEffects = createEffects(recording, clip, project.timeline.effects)
  project.timeline.effects.push(...newEffects)

  const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
  if (!videoTrack) return null

  videoTrack.clips.push(clip)
  videoTrack.clips.sort((a, b) => a.startTime - b.startTime)

  project.timeline.duration = Math.max(
    project.timeline.duration,
    clip.startTime + clip.duration
  )
  project.modifiedAt = new Date().toISOString()
  return clip
}

// === Typing Speed Application (merged from typing-speed-application.ts) ===

interface TimeRemapPeriod {
  sourceStartTime: number
  sourceEndTime: number
  speedMultiplier: number
}

export function applyTypingSpeedToClip(
  project: Project,
  clipId: string,
  periods: Array<{ startTime: number; endTime: number; suggestedSpeedMultiplier: number }>
): { affectedClips: string[]; originalClips: Clip[] } {
  const result = findClipById(project, clipId)
  if (!result) {
    return { affectedClips: [], originalClips: [] }
  }

  const { clip, track } = result
  const originalClip = { ...clip }

  const timeRemapPeriods: TimeRemapPeriod[] = periods.map(period => ({
    sourceStartTime: period.startTime,
    sourceEndTime: period.endTime,
    speedMultiplier: period.suggestedSpeedMultiplier
  }))

  let newDuration = 0
  for (const period of timeRemapPeriods) {
    const periodDuration = period.sourceEndTime - period.sourceStartTime
    const periodPlaybackDuration = periodDuration / period.speedMultiplier
    newDuration += periodPlaybackDuration
  }

  clip.timeRemapPeriods = timeRemapPeriods
  clip.duration = newDuration
  clip.typingSpeedApplied = true

  reflowClips(track, track.clips.indexOf(clip), project)
  project.timeline.duration = calculateTimelineDuration(project)
  project.modifiedAt = new Date().toISOString()

  return {
    affectedClips: [clipId],
    originalClips: [originalClip]
  }
}
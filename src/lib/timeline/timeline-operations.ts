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

// ARCHITECTURE NOTE: Effects are stored in source space on Recording objects
// When clips move/split on the timeline, effects do NOT need to be shifted or split
// because they remain anchored to the source recording timestamps

// Reflow clips to maintain contiguous layout
export function reflowClips(
  track: Track,
  startFromIndex: number = 0,
  project?: Project
): void {
  if (track.clips.length === 0) return

  // Validate and fix any duration inconsistencies
  // This ensures clip.duration matches the formula: (sourceOut - sourceIn) / playbackRate
  const DEBUG_REFLOW = process.env.NEXT_PUBLIC_ENABLE_TYPING_DEBUG === '1'

  for (const clip of track.clips) {
    const sourceIn = clip.sourceIn || 0
    const sourceOut = clip.sourceOut || sourceIn
    const sourceDuration = sourceOut - sourceIn
    const playbackRate = clip.playbackRate || 1
    const expectedDuration = sourceDuration / playbackRate

    // Allow 1ms tolerance for rounding
    if (Math.abs(clip.duration - expectedDuration) > 1) {
      if (DEBUG_REFLOW) {
        console.warn('[Reflow] Fixing inconsistent duration', {
          clipId: clip.id,
          storedDuration: clip.duration,
          expectedDuration,
          sourceIn,
          sourceOut,
          playbackRate
        })
      }
      clip.duration = expectedDuration
    }
  }

  track.clips.sort((a, b) => a.startTime - b.startTime)

  if (startFromIndex === 0 && track.clips.length > 0) {
    const firstClip = track.clips[0]
    if (firstClip.startTime !== 0) {
      firstClip.startTime = 0
    }
  }

  for (let i = Math.max(1, startFromIndex); i < track.clips.length; i++) {
    const prevClip = track.clips[i - 1]
    const currentClip = track.clips[i]
    const prevEnd = prevClip.startTime + prevClip.duration
    const newStart = prevEnd

    if (currentClip.startTime !== newStart) {
      currentClip.startTime = newStart
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

  const playbackRate = clip.playbackRate || 1

  // Import the proper conversion function
  const { clipRelativeToSource } = require('../timeline/time-space-converter')

  // Convert clip-relative split time to source space
  const sourceSplitAbsolute = clipRelativeToSource(relativeSplitTime, clip)
  const sourceSplitPoint = sourceSplitAbsolute - clip.sourceIn

  const firstClip: Clip = {
    id: crypto.randomUUID(),
    recordingId: clip.recordingId,
    startTime: clip.startTime,
    duration: relativeSplitTime,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceIn + sourceSplitPoint,
    playbackRate: clip.playbackRate
  }

  // Only copy typingSpeedApplied flag if it exists
  if (clip.typingSpeedApplied) {
    firstClip.typingSpeedApplied = true
  }

  // Only handle timeRemapPeriods if they exist (for backward compatibility)
  if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
    const splitSourceTime = clip.sourceIn + sourceSplitPoint
    const firstPeriods = clip.timeRemapPeriods
      .filter(p => p.sourceStartTime < splitSourceTime)
      .map(p => ({
        ...p,
        sourceEndTime: Math.min(p.sourceEndTime, splitSourceTime)
      }))
    if (firstPeriods.length > 0) {
      firstClip.timeRemapPeriods = firstPeriods
    }
  }

  const secondClip: Clip = {
    id: crypto.randomUUID(),
    recordingId: clip.recordingId,
    startTime: clip.startTime + relativeSplitTime,
    duration: clip.duration - relativeSplitTime,
    sourceIn: clip.sourceIn + sourceSplitPoint,
    sourceOut: clip.sourceOut,
    playbackRate: clip.playbackRate
  }

  // Only copy typingSpeedApplied flag if it exists
  if (clip.typingSpeedApplied) {
    secondClip.typingSpeedApplied = true
  }

  // Only handle timeRemapPeriods if they exist (for backward compatibility)
  if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
    const splitSourceTime = clip.sourceIn + sourceSplitPoint
    const secondPeriods = clip.timeRemapPeriods
      .filter(p => p.sourceEndTime > splitSourceTime)
      .map(p => ({
        ...p,
        sourceStartTime: Math.max(p.sourceStartTime, splitSourceTime)
      }))
    if (secondPeriods.length > 0) {
      secondClip.timeRemapPeriods = secondPeriods
    }
  }

  return { firstClip, secondClip }
}

// Execute split clip operation
export function executeSplitClip(
  project: Project,
  clipId: string,
  splitTime: number  // This is in timeline space
): { firstClip: Clip; secondClip: Clip } | null {
  const result = findClipById(project, clipId)
  if (!result) return null

  const { clip, track } = result
  
  // Convert timeline position to clip-relative time
  const clipRelativeTime = splitTime - clip.startTime
  
  const splitResult = splitClipAtTime(clip, clipRelativeTime)
  if (!splitResult) return null

  const clipIndex = track.clips.findIndex(c => c.id === clipId)
  track.clips.splice(clipIndex, 1, splitResult.firstClip, splitResult.secondClip)

  // Note: Effects are now stored on Recording in source space
  // Both split clips share the same recording's effects, no splitting needed

  project.modifiedAt = new Date().toISOString()
  return {
    firstClip: splitResult.firstClip,
    secondClip: splitResult.secondClip
  }
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
  createEffects: (recording: Recording) => void
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

  // Create effects on the recording itself (in source space)
  createEffects(recording)

  // Ensure global effects exist (background, cursor)
  const { EffectsFactory } = require('../effects/effects-factory')
  EffectsFactory.ensureGlobalEffects(project)

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


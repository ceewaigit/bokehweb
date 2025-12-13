import type { Clip, Effect, Recording } from '@/types/project'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'

export type ActiveClipDataAtFrame = {
  clip: Clip
  recording: Recording
  sourceTimeMs: number
  effects: Effect[]
}

export function getActiveClipDataAtFrame(args: {
  frame: number
  frameLayout: FrameLayoutItem[]
  fps: number
  effects: Effect[]
  getRecording: (recordingId: string) => Recording | null | undefined
}): ActiveClipDataAtFrame | null {
  const { frame, frameLayout, fps, effects, getRecording } = args
  if (!frameLayout || frameLayout.length === 0) return null

  // Boundary preference: if frame equals a clip start, return that clip.
  let layoutItem =
    frameLayout.find(item => frame === item.startFrame) ??
    frameLayout.find(item => frame >= item.startFrame && frame < item.endFrame) ??
    null

  // If no clip at current position, find the nearest one to prevent black frame
  if (!layoutItem) {
    let prevItem = frameLayout[0]
    let nextItem = frameLayout[0]
    let foundPrev = false
    let foundNext = false

    for (const item of frameLayout) {
      if (item.endFrame <= frame) {
        if (!foundPrev || item.endFrame > prevItem.endFrame) {
          prevItem = item
          foundPrev = true
        }
      }

      if (item.startFrame > frame) {
        if (!foundNext || item.startFrame < nextItem.startFrame) {
          nextItem = item
          foundNext = true
        }
      }
    }

    layoutItem = foundPrev ? prevItem : (foundNext ? nextItem : null)
  }

  if (!layoutItem) return null

  const clip = layoutItem.clip
  const recording = getRecording(clip.recordingId)
  if (!recording) return null

  const clipStartFrame = layoutItem.startFrame ?? Math.round((clip.startTime / 1000) * fps)
  const clipDurationFrames = layoutItem.durationFrames ?? Math.max(1, Math.round((clip.duration / 1000) * fps))
  const clipElapsedFrames = Math.max(0, Math.min(frame - clipStartFrame, clipDurationFrames))
  const clipElapsedMs = (clipElapsedFrames / fps) * 1000
  const sourceTimeMs = (clip.sourceIn || 0) + clipElapsedMs * (clip.playbackRate || 1)

  const clipStart = clip.startTime
  const clipEnd = clip.startTime + clip.duration
  const timelineEffects = effects.filter(effect => effect.startTime < clipEnd && effect.endTime > clipStart)

  // Recording-scoped effects are stored in source space on Recording.effects.
  // They should be resolved by sourceTimeMs, not timeline overlap.
  const sourceEffects = (recording.effects || []).filter(effect => {
    return effect.enabled && sourceTimeMs >= effect.startTime && sourceTimeMs <= effect.endTime
  })

  const mergedEffects = [...timelineEffects, ...sourceEffects].filter((effect, index, arr) => {
    if (!effect.id) return true
    return arr.findIndex(e => e.id === effect.id) === index
  })

  return { clip, recording, sourceTimeMs, effects: mergedEffects }
}


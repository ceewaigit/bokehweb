import type { Clip } from '@/types/project'

// Source duration in ms based on source in/out
export function getSourceDuration(clip: Clip): number {
  const sourceIn = clip.sourceIn || 0
  const sourceOut = clip.sourceOut || 0
  if (sourceOut >= sourceIn) return sourceOut - sourceIn
  // Fallback: If sourceOut not set, assume current clip duration represents source
  return clip.duration
}

// Effective timeline duration in ms for a given playback rate
export function computeEffectiveDuration(clip: Clip, rate?: number): number {
  const playback = (rate != null ? rate : (clip.playbackRate ?? 1)) || 1
  const base = getSourceDuration(clip)
  const effective = base / playback
  return Math.max(1, Math.round(effective))
}

// Map a recording timestamp (ms) into the clip-relative timeline, considering playback rate
export function mapRecordingToClipTime(clip: Clip, sourceTimestampMs: number): number {
  const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
  const sourceIn = clip.sourceIn || 0
  return (sourceTimestampMs - sourceIn) / rate
} 
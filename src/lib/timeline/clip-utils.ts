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
  const playbackRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
  const sourceIn = clip.sourceIn || 0

  if (!isFinite(sourceTimestampMs)) {
    return 0
  }

  // Guard against timestamps before the clip starts
  if (sourceTimestampMs <= sourceIn) {
    return 0
  }

  const rawPeriods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  // Fast path when no time remapping is applied
  if (!rawPeriods) {
    return (sourceTimestampMs - sourceIn) / playbackRate
  }

  let playbackTime = 0
  let currentSource = sourceIn

  for (const period of rawPeriods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    // Handle any gap before this period at the base playback rate
    if (currentSource < periodStart) {
      if (sourceTimestampMs <= periodStart) {
        return playbackTime + Math.max(0, sourceTimestampMs - currentSource) / playbackRate
      }

      playbackTime += (periodStart - currentSource) / playbackRate
      currentSource = periodStart
    }

    // If the timestamp falls within this period, map using the period's speed multiplier
    if (sourceTimestampMs <= periodEnd) {
      return playbackTime + Math.max(0, sourceTimestampMs - currentSource) / Math.max(0.0001, period.speedMultiplier)
    }

    // Otherwise, consume the entire period and continue
    playbackTime += (periodEnd - currentSource) / Math.max(0.0001, period.speedMultiplier)
    currentSource = periodEnd
  }

  // Remaining tail after the last remap period plays back at the base rate
  if (sourceTimestampMs > currentSource) {
    playbackTime += (sourceTimestampMs - currentSource) / playbackRate
  }

  return playbackTime
}

// Map timeline time (ms) back to source/recording time, inverse of mapRecordingToClipTime
export function mapClipToRecordingTime(clip: Clip, timelineMs: number): number {
  const sourceIn = clip.sourceIn || 0
  const baseRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
  const periods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  if (!periods) {
    const result = sourceIn + timelineMs * baseRate
    const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
    return Math.max(sourceIn, Math.min(sourceOut, result))
  }

  let remainingTimeline = timelineMs
  let currentSource = sourceIn

  for (const period of periods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    if (currentSource < periodStart) {
      const gapDurationSource = periodStart - currentSource
      const gapTimelineDuration = gapDurationSource / baseRate

      if (remainingTimeline <= gapTimelineDuration) {
        const result = currentSource + remainingTimeline * baseRate
        const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
        return Math.max(sourceIn, Math.min(sourceOut, result))
      }

      remainingTimeline -= gapTimelineDuration
      currentSource = periodStart
    }

    const effectiveSpeed = Math.max(0.0001, period.speedMultiplier)
    const periodDurationSource = periodEnd - periodStart
    const periodTimelineDuration = periodDurationSource / effectiveSpeed

    if (remainingTimeline <= periodTimelineDuration) {
      const result = periodStart + remainingTimeline * effectiveSpeed
      const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
      return Math.max(sourceIn, Math.min(sourceOut, result))
    }

    remainingTimeline -= periodTimelineDuration
    currentSource = periodEnd
  }

  const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
  const result = currentSource + remainingTimeline * baseRate
  return Math.max(sourceIn, Math.min(sourceOut, result))
}

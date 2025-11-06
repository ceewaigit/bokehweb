import type { MouseEvent } from '@/types/project'

const getEventTimestamp = (event: MouseEvent): number => {
  const raw = typeof event.sourceTimestamp === 'number' ? event.sourceTimestamp : event.timestamp
  return Number.isFinite(raw) ? raw : 0
}

/**
 * Catmull-Rom spline interpolation for smooth mouse movement
 * Falls back to a simple eased linear interpolation when data is sparse.
 */
export function interpolateMousePosition(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  if (!mouseEvents || mouseEvents.length === 0) {
    return null
  }

  // Edge cases
  if (timeMs <= getEventTimestamp(mouseEvents[0])) {
    return { x: mouseEvents[0].x, y: mouseEvents[0].y }
  }
  if (timeMs >= getEventTimestamp(mouseEvents[mouseEvents.length - 1])) {
    const last = mouseEvents[mouseEvents.length - 1]
    return { x: last.x, y: last.y }
  }

  // If we have very few points, use simple interpolation
  if (mouseEvents.length < 4) {
    return simpleInterpolate(mouseEvents, timeMs)
  }

  // Find segment where timeMs lies
  let i = 0
  for (; i < mouseEvents.length - 1; i++) {
    if (getEventTimestamp(mouseEvents[i]) <= timeMs && getEventTimestamp(mouseEvents[i + 1]) > timeMs) {
      break
    }
  }

  const p0 = mouseEvents[Math.max(0, i - 1)]
  const p1 = mouseEvents[i]
  const p2 = mouseEvents[Math.min(mouseEvents.length - 1, i + 1)]
  const p3 = mouseEvents[Math.min(mouseEvents.length - 1, i + 2)]

  const segmentDuration = getEventTimestamp(p2) - getEventTimestamp(p1)
  const t = segmentDuration > 0 ? (timeMs - getEventTimestamp(p1)) / segmentDuration : 0

  // Catmull-Rom spline coefficients
  const t2 = t * t
  const t3 = t2 * t

  const v0x = (p2.x - p0.x) * 0.5
  const v1x = (p3.x - p1.x) * 0.5
  const x = p1.x + v0x * t + (3 * (p2.x - p1.x) - 2 * v0x - v1x) * t2 + (2 * (p1.x - p2.x) + v0x + v1x) * t3

  const v0y = (p2.y - p0.y) * 0.5
  const v1y = (p3.y - p1.y) * 0.5
  const y = p1.y + v0y * t + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3

  return { x, y }
}

export function interpolateMousePositionNormalized(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  const pos = interpolateMousePosition(mouseEvents, timeMs)
  if (!pos) return null

  // Prefer capture size if available; fallback to screen size; then to a sensible default
  const baseWidth = mouseEvents[0]?.captureWidth || mouseEvents[0]?.screenWidth || 1920
  const baseHeight = mouseEvents[0]?.captureHeight || mouseEvents[0]?.screenHeight || 1080

  if (!baseWidth || !baseHeight) return null

  return {
    x: Math.max(0, Math.min(1, pos.x / baseWidth)),
    y: Math.max(0, Math.min(1, pos.y / baseHeight))
  }
}

function simpleInterpolate(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } {
  let before: MouseEvent | null = null
  let after: MouseEvent | null = null

  for (let i = 0; i < mouseEvents.length; i++) {
    if (getEventTimestamp(mouseEvents[i]) <= timeMs) {
      before = mouseEvents[i]
    } else {
      after = mouseEvents[i]
      break
    }
  }

  if (!before) {
    const first = mouseEvents[0]
    return { x: first.x, y: first.y }
  }
  if (!after) {
    return { x: before.x, y: before.y }
  }

  const timeDiff = getEventTimestamp(after) - getEventTimestamp(before)
  if (timeDiff === 0) {
    return { x: before.x, y: before.y }
  }

  const t = (timeMs - getEventTimestamp(before)) / timeDiff
  // Smoothstep easing for nicer motion
  const smoothT = t * t * (3 - 2 * t)

  return {
    x: before.x + (after.x - before.x) * smoothT,
    y: before.y + (after.y - before.y) * smoothT
  }
} 
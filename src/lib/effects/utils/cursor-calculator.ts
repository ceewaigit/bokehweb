/**
 * Cursor effect calculator
 * Pure functions for calculating cursor position, visibility, and effects
 * Used by both Remotion preview and export engines
 */

import type { CursorEffectData, MouseEvent, ClickEvent } from '@/types/project'
import { CursorStyle } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { CursorType, electronToCustomCursor } from '../cursor-types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'

// PERF: Memoization cache for smoothing results to avoid re-simulation
const smoothingCache = new Map<string, { x: number; y: number }>()
const MAX_SMOOTHING_CACHE_SIZE = 1000

/**
 * Clear the smoothing cache - call when switching projects or recordings
 */
export function clearCursorCalculatorCache(): void {
  smoothingCache.clear()
}

export interface CursorState {
  visible: boolean
  x: number
  y: number
  type: CursorType
  scale: number
  opacity: number
  clickEffects: ClickEffect[]
  timestamp: number
  motionBlur?: {
    previousX: number
    previousY: number
    velocity: number
  }
}

export interface ClickEffect {
  x: number
  y: number
  timestamp: number
  progress: number // 0 to 1
  radius: number
  opacity: number
}

/**
 * Calculate cursor state at a given timestamp
 */
export function calculateCursorState(
  cursorData: CursorEffectData | undefined,
  mouseEvents: MouseEvent[],
  clickEvents: ClickEvent[],
  timestamp: number,
  previousState?: CursorState,
  renderFps?: number,
  disableHistorySmoothing?: boolean
): CursorState {
  // Default state
  if (!cursorData || !mouseEvents || mouseEvents.length === 0) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: cursorData?.size ?? DEFAULT_CURSOR_DATA.size,
      opacity: 0,
      clickEffects: [],
      timestamp
    }
  }

  // Get interpolated mouse position
  const rawPosition = interpolateMousePosition(mouseEvents, timestamp)
  if (!rawPosition) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: cursorData.size ?? DEFAULT_CURSOR_DATA.size,
      opacity: 0,
      clickEffects: [],
      timestamp
    }
  }

  // Apply additional smoothing on top of interpolation (stateless, time-based)
  // This matches the original CursorLayer behavior for buttery-smooth movement
  const position = applySmoothingFilter(
    mouseEvents,
    timestamp,
    rawPosition,
    previousState,
    cursorData,
    renderFps,
    disableHistorySmoothing
  )

  // Determine cursor type - use binary search for most recent event
  let cursorEventIndex = -1
  let low = 0, high = mouseEvents.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (mouseEvents[mid].timestamp <= timestamp) {
      cursorEventIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const currentEvent = cursorEventIndex >= 0 ? mouseEvents[cursorEventIndex] : mouseEvents[0]
  const cursorType = electronToCustomCursor(currentEvent?.cursorType || 'default')

  // Calculate visibility based on idle timeout
  let visible = true
  let opacity = 1

  if (cursorData.hideOnIdle) {
    const idleTimeout = cursorData.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout
    const lastMovement = findLastMovement(mouseEvents, timestamp)
    if (lastMovement) {
      const idleTime = timestamp - lastMovement.timestamp
      const fadeOnIdle = cursorData.fadeOnIdle ?? DEFAULT_CURSOR_DATA.fadeOnIdle

      if (!fadeOnIdle) {
        if (idleTime > idleTimeout) {
          visible = false
          opacity = 0
        }
      } else {
        const FADE_OUT_DURATION = 300 // ms
        const FADE_IN_DURATION = 180 // ms

        if (idleTime >= idleTimeout) {
          opacity = 0
        } else if (idleTime > idleTimeout - FADE_OUT_DURATION) {
          // Fade out in the last FADE_OUT_DURATION ms
          opacity = Math.max(0, 1 - (idleTime - (idleTimeout - FADE_OUT_DURATION)) / FADE_OUT_DURATION)
        }

        // Fade in on "wake" movement after being idle long enough to hide
        const previousMovement = findLastMovement(mouseEvents, lastMovement.timestamp - 1)
        const idleGap = previousMovement ? (lastMovement.timestamp - previousMovement.timestamp) : 0
        const resumedAfterHide = previousMovement
          ? idleGap > idleTimeout
          : lastMovement.timestamp >= idleTimeout
        if (resumedAfterHide) {
          const sinceWake = timestamp - lastMovement.timestamp
          if (sinceWake >= 0 && sinceWake < FADE_IN_DURATION) {
            opacity = Math.min(opacity, Math.max(0, sinceWake / FADE_IN_DURATION))
          }
        }

        visible = opacity > 0.001
      }
    }
  }

  // Calculate motion blur if enabled
  let motionBlur: CursorState['motionBlur'] = undefined
  if (cursorData.motionBlur) {
    const sequentialPrev = shouldUsePreviousState(previousState, timestamp)
    const referencePosition = sequentialPrev && previousState
      ? { x: previousState.x, y: previousState.y }
      : sampleHistoricalPosition(mouseEvents, timestamp, position, Math.min(60, (1 - (cursorData.speed ?? DEFAULT_CURSOR_DATA.speed)) * 80 + 20))

    const dx = position.x - referencePosition.x
    const dy = position.y - referencePosition.y
    const velocity = Math.sqrt(dx * dx + dy * dy)

    if (velocity > 2) { // Only show blur for significant movement
      motionBlur = {
        previousX: referencePosition.x,
        previousY: referencePosition.y,
        velocity: Math.min(velocity, 50) // Cap velocity for reasonable blur
      }
    }
  }

  // Calculate click effects
  const activeClickEffects = cursorData.clickEffects
    ? calculateClickEffects(clickEvents, timestamp)
    : []

  return {
    visible,
    x: position.x,
    y: position.y,
    type: cursorType,
    scale: cursorData.size ?? DEFAULT_CURSOR_DATA.size,
    opacity,
    clickEffects: activeClickEffects,
    motionBlur,
    timestamp
  }
}

/**
 * Apply smoothing filter - Simulates original stateful smoothing but stateless
 * Works by simulating frame-by-frame exponential smoothing lookback
 */
function applySmoothingFilter(
  mouseEvents: MouseEvent[],
  timestamp: number,
  rawPosition: { x: number; y: number },
  previousState: CursorState | undefined,
  cursorData: CursorEffectData,
  renderFps?: number,
  disableHistorySmoothing?: boolean
): { x: number; y: number } {
  // If gliding is disabled, return the raw interpolated position
  if (!cursorData.gliding) {
    return rawPosition
  }

  const canUsePreviousState = shouldUsePreviousState(previousState, timestamp)
  if (canUsePreviousState && previousState) {
    return smoothTowardsTarget(previousState, rawPosition, cursorData, timestamp - previousState.timestamp)
  }

  if (disableHistorySmoothing) {
    // Export/perf mode: avoid expensive history simulation when frames render out of order.
    return rawPosition
  }

  // Fallback: derive smoothing purely from historical samples so rendering order doesn't matter
  return simulateSmoothingWithHistory(mouseEvents, timestamp, rawPosition, cursorData, renderFps)
}

function simulateSmoothingWithHistory(
  mouseEvents: MouseEvent[],
  timestamp: number,
  rawPosition: { x: number; y: number },
  cursorData: CursorEffectData,
  renderFps?: number
): { x: number; y: number } {
  // PERF: Check cache first - key includes timestamp and smoothing params
  const cacheKey = `${timestamp.toFixed(0)}-${(cursorData.smoothness ?? DEFAULT_CURSOR_DATA.smoothness).toFixed(2)}-${(cursorData.speed ?? DEFAULT_CURSOR_DATA.speed).toFixed(2)}`
  const cached = smoothingCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const historyWindowMs = computeHistoryWindowMs(cursorData)
  const firstEventTime = mouseEvents[0]?.timestamp ?? timestamp
  const availableHistory = Math.max(0, timestamp - firstEventTime)
  const lookbackWindow = Math.min(historyWindowMs, availableHistory)

  if (lookbackWindow <= 0) {
    return rawPosition
  }

  const fps = clampRenderFps(renderFps)
  const frameInterval = 1000 / fps

  const steps = Math.max(1, Math.ceil(lookbackWindow / frameInterval))
  const startTime = timestamp - steps * frameInterval

  let sampleTime = Math.max(firstEventTime, startTime)
  let smoothed = interpolateMousePosition(mouseEvents, sampleTime) || rawPosition

  while (sampleTime < timestamp) {
    const nextTime = Math.min(timestamp, sampleTime + frameInterval)
    const samplePos = nextTime >= timestamp
      ? rawPosition
      : (interpolateMousePosition(mouseEvents, nextTime) || rawPosition)

    smoothed = smoothTowardsTarget(smoothed, samplePos, cursorData, nextTime - sampleTime)
    sampleTime = nextTime
  }

  // PERF: Cache result with LRU eviction
  if (smoothingCache.size >= MAX_SMOOTHING_CACHE_SIZE) {
    const firstKey = smoothingCache.keys().next().value
    if (firstKey) smoothingCache.delete(firstKey)
  }
  smoothingCache.set(cacheKey, smoothed)

  return smoothed
}

function shouldUsePreviousState(previousState: CursorState | undefined, timestamp: number): previousState is CursorState {
  if (!previousState || !previousState.visible) return false
  if (typeof previousState.timestamp !== 'number') return false

  const delta = timestamp - previousState.timestamp
  return Number.isFinite(delta) && delta > 0 && delta <= 120
}

function sampleHistoricalPosition(
  mouseEvents: MouseEvent[],
  timestamp: number,
  fallback: { x: number; y: number },
  lookbackMs: number
): { x: number; y: number } {
  if (lookbackMs <= 0) {
    return fallback
  }

  const sampleTime = timestamp - lookbackMs
  if (sampleTime <= mouseEvents[0].timestamp) {
    return fallback
  }

  return interpolateMousePosition(mouseEvents, sampleTime) || fallback
}

function computeHistoryWindowMs(cursorData: CursorEffectData): number {
  const smoothness = clamp01(cursorData.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)
  const speed = clamp01(cursorData.speed ?? DEFAULT_CURSOR_DATA.speed)

  const minWindow = 120
  const maxWindow = 420
  const baseWindow = minWindow + (maxWindow - minWindow) * smoothness
  const responsiveness = 0.55 + (1 - speed) * 0.4

  return Math.max(90, baseWindow * responsiveness)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function clampRenderFps(renderFps?: number): number {
  if (!renderFps || !Number.isFinite(renderFps)) {
    return 60
  }
  return Math.max(15, Math.min(120, renderFps))
}

function smoothTowardsTarget(
  previous: { x: number; y: number },
  target: { x: number; y: number },
  cursorData: CursorEffectData,
  dtMs?: number
): { x: number; y: number } {
  const deltaX = target.x - previous.x
  const deltaY = target.y - previous.y
  const movementDelta = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

  if (movementDelta > 300) {
    return target
  }

  const speed = clamp01(cursorData.speed ?? DEFAULT_CURSOR_DATA.speed)
  const smoothness = clamp01(cursorData.smoothness ?? DEFAULT_CURSOR_DATA.smoothness)

  // Deadband to prevent micro-shake when the cursor is "stopped" but input is noisy/quantized.
  // Calibrated in physical pixels; keep small so normal slow movement still shows.
  const jitterRadiusPx = Math.min(2.5, 0.9 + (1 - speed) * 1.4)
  if (movementDelta < jitterRadiusPx) {
    return previous
  }

  // Time-constant based smoothing produces consistent results across FPS and event rates.
  // Higher smoothness => larger tau (smoother/slower); higher speed => smaller tau (snappier).
  const dt = Math.max(1, Math.min(100, Number.isFinite(dtMs as number) ? (dtMs as number) : 16.67))
  const minTau = 14
  const maxTau = 160
  const baseTau = minTau + (maxTau - minTau) * smoothness
  const tau = Math.max(6, baseTau * (1.35 - speed))

  // Convert to per-step alpha, then boost slightly when far from target to avoid visible lag.
  const baseAlpha = 1 - Math.exp(-dt / tau)
  const distanceBoost = Math.min(3, movementDelta / 80)
  const smoothingAlpha = Math.max(0.01, Math.min(0.99, 1 - Math.pow(1 - baseAlpha, 1 + distanceBoost)))

  return {
    x: previous.x + deltaX * smoothingAlpha,
    y: previous.y + deltaY * smoothingAlpha
  }
}

/**
 * Find the last mouse movement before a timestamp
 * PERF: Uses binary search O(log n) instead of filter+sort O(n log n)
 */
function findLastMovement(
  mouseEvents: MouseEvent[],
  timestamp: number
): MouseEvent | null {
  if (!mouseEvents || mouseEvents.length === 0) return null

  // Binary search for the last event at or before timestamp
  let low = 0, high = mouseEvents.length - 1
  let startIdx = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (mouseEvents[mid].timestamp <= timestamp) {
      startIdx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  if (startIdx < 0) return null

  // Scan backwards for last actual movement (position change)
  for (let i = startIdx; i > 0; i--) {
    const current = mouseEvents[i]
    const previous = mouseEvents[i - 1]
    if (current.x !== previous.x || current.y !== previous.y) {
      return current
    }
  }

  return mouseEvents[0]
}

/**
 * Calculate active click effects
 * Matches original CursorLayer timing: 300ms duration, 200ms animation
 * PERF: Uses binary search to find relevant window instead of filtering entire array
 */
function calculateClickEffects(
  clickEvents: ClickEvent[],
  timestamp: number
): ClickEffect[] {
  const EFFECT_DURATION = 300 // ms - match original timing
  const ANIMATION_DURATION = 200 // ms - for scale calculation
  const MAX_RADIUS = 50

  if (!clickEvents || clickEvents.length === 0) return []

  // Binary search for first potentially active click (timestamp >= minTime)
  const minTime = timestamp - EFFECT_DURATION
  let low = 0, high = clickEvents.length - 1
  let startIdx = clickEvents.length
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (clickEvents[mid].timestamp >= minTime) {
      startIdx = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  // Only process clicks in the active window
  const activeClicks: ClickEffect[] = []
  for (let i = startIdx; i < clickEvents.length; i++) {
    const click = clickEvents[i]
    if (click.timestamp > timestamp) break // Future clicks

    const age = timestamp - click.timestamp
    if (age >= 0 && age < EFFECT_DURATION) {
      const progress = Math.min(1, age / ANIMATION_DURATION)
      const easedProgress = 1 - Math.pow(1 - progress, 3)

      activeClicks.push({
        x: click.x,
        y: click.y,
        timestamp: click.timestamp,
        progress,
        radius: 10 + easedProgress * MAX_RADIUS,
        opacity: Math.max(0, 1 - progress) * 0.5
      })
    }
  }

  return activeClicks
}

/**
 * Get cursor drawing properties for canvas rendering
 */
export function getCursorDrawingProps(
  state: CursorState,
  style: CursorStyle
): {
  shape: 'arrow' | 'circle' | 'cross' | 'hand'
  color: string
  size: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
} {
  const baseSize = 12 * state.scale

  // Determine shape based on style and type
  let shape: 'arrow' | 'circle' | 'cross' | 'hand' = 'arrow'
  if (style === CursorStyle.Custom) {
    shape = 'circle'
  } else if (state.type === CursorType.POINTING_HAND || state.type === CursorType.OPEN_HAND) {
    shape = 'hand'
  } else if (state.type === CursorType.CROSSHAIR) {
    shape = 'cross'
  }

  // Colors based on style
  const color = style === CursorStyle.Custom ? '#ffffff' : '#ffffff'

  return {
    shape,
    color,
    size: baseSize,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowBlur: 4 * state.scale,
    shadowOffsetX: 1 * state.scale,
    shadowOffsetY: 2 * state.scale
  }
}

/**
 * Calculate cursor path for canvas drawing
 */
export function getCursorPath(
  x: number,
  y: number,
  type: CursorType,
  scale: number
): Path2D {
  const path = new Path2D()

  switch (type) {
    case CursorType.ARROW:
    default:
      // macOS-style arrow cursor
      path.moveTo(x, y)
      path.lineTo(x + 12 * scale, y + 12 * scale)
      path.lineTo(x + 5 * scale, y + 12 * scale)
      path.lineTo(x + 7 * scale, y + 17 * scale)
      path.lineTo(x + 4 * scale, y + 18 * scale)
      path.lineTo(x + 2 * scale, y + 13 * scale)
      path.lineTo(x, y + 15 * scale)
      path.closePath()
      break

    case CursorType.POINTING_HAND:
    case CursorType.OPEN_HAND:
      // Hand/pointer cursor
      path.moveTo(x + 5 * scale, y)
      path.lineTo(x + 5 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 14 * scale)
      path.lineTo(x, y + 14 * scale)
      path.lineTo(x, y + 6 * scale)
      path.closePath()
      break

    case CursorType.CROSSHAIR:
      // Crosshair cursor
      const size = 10 * scale
      path.moveTo(x - size, y)
      path.lineTo(x + size, y)
      path.moveTo(x, y - size)
      path.lineTo(x, y + size)
      break
  }

  return path
}

/**
 * Calculate motion blur trail points
 */
export function getMotionBlurTrail(
  currentX: number,
  currentY: number,
  previousX: number,
  previousY: number,
  velocity: number
): Array<{ x: number; y: number; opacity: number }> {
  const trail: Array<{ x: number; y: number; opacity: number }> = []

  // Number of trail points based on velocity
  const trailCount = Math.min(5, Math.floor(velocity / 10))

  for (let i = 1; i <= trailCount; i++) {
    const t = i / (trailCount + 1)
    trail.push({
      x: previousX + (currentX - previousX) * t,
      y: previousY + (currentY - previousY) * t,
      opacity: (1 - t) * 0.3
    })
  }

  return trail
}

/**
 * Camera Calculator (SSOT)
 *
 * Pure camera follow + zoom-center algorithm used by both preview and export.
 * All logic is in normalized source space (0-1).
 */

import type { Effect, MouseEvent, Recording, ZoomEffectData, ZoomFollowStrategy } from '@/types/project'
import { EffectType } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { calculateZoomScale } from '@/remotion/compositions/utils/zoom-transform'
import {
  CAMERA_DEAD_ZONE_RATIO,
  CLUSTER_RADIUS_RATIO,
  MIN_CLUSTER_DURATION_MS,
  CLUSTER_HOLD_BUFFER_MS,
  CINEMATIC_WINDOW_MS,
  CINEMATIC_SAMPLES,
  SEEK_THRESHOLD_MS,
  SPRING_TENSION,
  SPRING_FRICTION,
  CURSOR_STOP_VELOCITY_THRESHOLD,
  CURSOR_STOP_DWELL_MS,
  CURSOR_STOP_MIN_ZOOM,
  CURSOR_STOP_DAMPING,
  CURSOR_STOP_SNAP_THRESHOLD,
} from '@/lib/constants/calculator-constants'

export interface CameraPhysicsState {
  x: number
  y: number
  vx: number
  vy: number
  /** Last timeline timestamp used for physics integration. */
  lastTimeMs: number
  /** Last source timestamp (used to estimate playback rate). */
  lastSourceTimeMs?: number
  // Stop detection state (prevents camera halt-shake)
  cursorStoppedAtMs?: number
  frozenTargetX?: number
  frozenTargetY?: number
}

export interface OutputOverscan {
  /** Allowed normalized overscan beyond left edge (relative to draw size). */
  left: number
  /** Allowed normalized overscan beyond right edge (relative to draw size). */
  right: number
  /** Allowed normalized overscan beyond top edge (relative to draw size). */
  top: number
  /** Allowed normalized overscan beyond bottom edge (relative to draw size). */
  bottom: number
}

export interface ParsedZoomBlock {
  id: string
  startTime: number
  endTime: number
  scale: number
  targetX?: number
  targetY?: number
  screenWidth?: number
  screenHeight?: number
  introMs: number
  outroMs: number
  smoothing?: number
  followStrategy?: ZoomFollowStrategy
}

export interface CameraComputeInput {
  effects: Effect[]
  timelineMs: number
  sourceTimeMs: number
  recording?: Recording | null
  /** Output/composition size in pixels (for aspect/letterbox-aware bounds) */
  outputWidth?: number
  outputHeight?: number
  /** Overscan bounds to allow panning into preview padding/background. */
  overscan?: OutputOverscan
  physics: CameraPhysicsState
  /**
   * When true, bypass spring physics and compute a deterministic center per-frame.
   * This is important for export, where Remotion may render frames out of order.
   */
  deterministic?: boolean
}

export interface CameraComputeOutput {
  activeZoomBlock?: ParsedZoomBlock
  zoomScale: number
  zoomCenter: { x: number; y: number }
  physics: CameraPhysicsState
}

interface Cluster {
  startTime: number
  endTime: number
  centroidX: number
  centroidY: number
}

function parseZoomBlocks(effects: Effect[]): ParsedZoomBlock[] {
  return effects
    .filter(e => e.type === EffectType.Zoom && e.enabled)
    .map(e => {
      const data = e.data as ZoomEffectData
      return {
        id: e.id,
        startTime: e.startTime,
        endTime: e.endTime,
        scale: data?.scale ?? 2,
        targetX: data?.targetX,
        targetY: data?.targetY,
        screenWidth: data?.screenWidth,
        screenHeight: data?.screenHeight,
        introMs: data?.introMs ?? 300,
        outroMs: data?.outroMs ?? 300,
        smoothing: data?.smoothing,
        followStrategy: data?.followStrategy,
      }
    })
}

function analyzeMotionClusters(
  mouseEvents: MouseEvent[],
  videoWidth: number,
  videoHeight: number
): Cluster[] {
  const clusters: Cluster[] = []
  if (mouseEvents.length === 0) return clusters

  const screenDiag = Math.sqrt(videoWidth * videoWidth + videoHeight * videoHeight)
  const maxClusterRadius = screenDiag * CLUSTER_RADIUS_RATIO
  const minClusterDuration = MIN_CLUSTER_DURATION_MS

  let currentCluster: {
    events: MouseEvent[]
    startTime: number
    sumX: number
    sumY: number
  } | null = null

  for (const event of mouseEvents) {
    if (!currentCluster) {
      currentCluster = {
        events: [event],
        startTime: event.timestamp,
        sumX: event.x,
        sumY: event.y,
      }
      continue
    }

    const count = currentCluster.events.length
    const centroidX = currentCluster.sumX / count
    const centroidY = currentCluster.sumY / count

    const dist = Math.sqrt(
      Math.pow(event.x - centroidX, 2) + Math.pow(event.y - centroidY, 2)
    )

    if (dist <= maxClusterRadius) {
      currentCluster.events.push(event)
      currentCluster.sumX += event.x
      currentCluster.sumY += event.y
    } else {
      const duration =
        currentCluster.events[currentCluster.events.length - 1].timestamp -
        currentCluster.startTime

      if (duration >= minClusterDuration) {
        clusters.push({
          startTime: currentCluster.startTime,
          endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
          centroidX: currentCluster.sumX / currentCluster.events.length,
          centroidY: currentCluster.sumY / currentCluster.events.length,
        })
      }

      currentCluster = {
        events: [event],
        startTime: event.timestamp,
        sumX: event.x,
        sumY: event.y,
      }
    }
  }

  if (currentCluster) {
    const duration =
      currentCluster.events[currentCluster.events.length - 1].timestamp -
      currentCluster.startTime
    if (duration >= minClusterDuration) {
      clusters.push({
        startTime: currentCluster.startTime,
        endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
        centroidX: currentCluster.sumX / currentCluster.events.length,
        centroidY: currentCluster.sumY / currentCluster.events.length,
      })
    }
  }

  return clusters
}

function getCinematicMousePosition(
  mouseEvents: MouseEvent[],
  timeMs: number
): { x: number; y: number } | null {
  const windowSize = CINEMATIC_WINDOW_MS
  const samples = CINEMATIC_SAMPLES

  let sumX = 0
  let sumY = 0
  let validSamples = 0

  for (let i = 0; i < samples; i++) {
    const t = timeMs - i * (windowSize / samples)
    const pos = interpolateMousePosition(mouseEvents, t)
    if (pos) {
      sumX += pos.x
      sumY += pos.y
      validSamples++
    }
  }

  if (validSamples === 0) return null
  return { x: sumX / validSamples, y: sumY / validSamples }
}

function calculateAttractor(
  mouseEvents: MouseEvent[],
  timeMs: number,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number } | null {
  if (mouseEvents.length === 0) return null

  const clusters = analyzeMotionClusters(mouseEvents, videoWidth, videoHeight)
  const holdBuffer = CLUSTER_HOLD_BUFFER_MS

  const activeCluster = clusters.find(
    c => timeMs >= c.startTime && timeMs <= c.endTime + holdBuffer
  )

  if (activeCluster) {
    return { x: activeCluster.centroidX, y: activeCluster.centroidY }
  }

  return getCinematicMousePosition(mouseEvents, timeMs)
}

function getHalfWindows(
  zoomScale: number,
  screenWidth: number,
  screenHeight: number,
  outputWidth?: number,
  outputHeight?: number
): { halfWindowX: number; halfWindowY: number } {
  if (zoomScale <= 1.001) return { halfWindowX: 0.5, halfWindowY: 0.5 }

  let rX = 1
  let rY = 1

  if (outputWidth && outputHeight) {
    const sourceAspect = screenWidth / screenHeight
    const outputAspect = outputWidth / outputHeight
    // When aspects differ, the visible source window is constrained by the
    // narrower axis after fitting. Adjust the half-window on that axis.
    if (outputAspect > sourceAspect) {
      // Output is wider -> constrained by height (letterbox top/bottom).
      rY = outputAspect / sourceAspect
    } else if (outputAspect < sourceAspect) {
      // Output is taller/narrower -> constrained by width (pillarbox left/right).
      rX = sourceAspect / outputAspect
    }
  }

  return {
    halfWindowX: (0.5 * rX) / zoomScale,
    halfWindowY: (0.5 * rY) / zoomScale,
  }
}

function getSourceDimensionsAtTime(
  mouseEvents: MouseEvent[],
  timeMs: number,
  recording?: Recording | null
): { sourceWidth: number; sourceHeight: number } {
  const captureArea = (recording?.metadata as any)?.captureArea as
    | { fullBounds?: { width: number; height: number }; scaleFactor?: number }
    | undefined
  const fallbackScaleFactor = captureArea?.scaleFactor || 1

  const fallbackWidth =
    (captureArea?.fullBounds?.width
      ? Math.round(captureArea.fullBounds.width * fallbackScaleFactor)
      : undefined) ??
    recording?.width ??
    1920
  const fallbackHeight =
    (captureArea?.fullBounds?.height
      ? Math.round(captureArea.fullBounds.height * fallbackScaleFactor)
      : undefined) ??
    recording?.height ??
    1080

  if (!mouseEvents || mouseEvents.length === 0) {
    return { sourceWidth: fallbackWidth, sourceHeight: fallbackHeight }
  }

  // Find the most recent mouse event at or before timeMs.
  let low = 0
  let high = mouseEvents.length - 1
  let idx = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (mouseEvents[mid].timestamp <= timeMs) {
      idx = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const e = mouseEvents[idx] || mouseEvents[0]

  if (e?.captureWidth && e?.captureHeight) {
    return { sourceWidth: e.captureWidth, sourceHeight: e.captureHeight }
  }

  // Older metadata may lack capture dims. Infer whether screen dims need scaling.
  const screenW = e?.screenWidth
  const screenH = e?.screenHeight
  if (screenW && screenH) {
    const xLooksPhysical = e.x > screenW * 1.1
    const yLooksPhysical = e.y > screenH * 1.1
    const shouldScale = (xLooksPhysical || yLooksPhysical) && fallbackScaleFactor > 1
    return {
      sourceWidth: shouldScale ? Math.round(screenW * fallbackScaleFactor) : screenW,
      sourceHeight: shouldScale ? Math.round(screenH * fallbackScaleFactor) : screenH,
    }
  }

  return { sourceWidth: fallbackWidth, sourceHeight: fallbackHeight }
}

function getAdaptiveDeadZoneRatio(zoomScale: number): number {
  // At higher zoom levels, reduce dead‑zone so the camera tracks tighter.
  // Keeps legacy feel near 1x, but avoids under‑following at 2x+.
  const maxRatio = CAMERA_DEAD_ZONE_RATIO
  const minRatio = 0.18
  const startScale = 1.1
  const endScale = 2.5
  if (zoomScale <= startScale) return maxRatio
  const t = Math.min(1, (zoomScale - startScale) / (endScale - startScale))
  return maxRatio + (minRatio - maxRatio) * t
}

function calculateFollowTargetNormalized(
  cursorNorm: { x: number; y: number },
  currentCenterNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  zoomScale: number,
  overscan: OutputOverscan
): { x: number; y: number } {
  const deadZoneRatio = getAdaptiveDeadZoneRatio(zoomScale)
  const deadZoneHalfX = halfWindowX * deadZoneRatio
  const deadZoneHalfY = halfWindowY * deadZoneRatio

  const clampX = (c: number) =>
    Math.max(halfWindowX - overscan.left, Math.min(1 - halfWindowX + overscan.right, c))
  const clampY = (c: number) =>
    Math.max(halfWindowY - overscan.top, Math.min(1 - halfWindowY + overscan.bottom, c))

  const dx = cursorNorm.x - currentCenterNorm.x
  const dy = cursorNorm.y - currentCenterNorm.y

  const softFollowFactor = 0.25

  const nextCenterX =
    Math.abs(dx) <= deadZoneHalfX
      ? currentCenterNorm.x + dx * softFollowFactor
      : dx < 0
        ? cursorNorm.x + deadZoneHalfX
        : cursorNorm.x - deadZoneHalfX

  const nextCenterY =
    Math.abs(dy) <= deadZoneHalfY
      ? currentCenterNorm.y + dy * softFollowFactor
      : dy < 0
        ? cursorNorm.y + deadZoneHalfY
        : cursorNorm.y - deadZoneHalfY

  return { x: clampX(nextCenterX), y: clampY(nextCenterY) }
}

function projectCenterToKeepCursorVisible(
  centerNorm: { x: number; y: number },
  cursorNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  overscan: OutputOverscan,
  /** When true, allow full 0-1 range for output-space calculations */
  allowFullRange: boolean = false
): { x: number; y: number } {
  const projectAxis = (
    c: number,
    cursorPos: number,
    halfWindow: number,
    overscanMin: number,
    overscanMax: number
  ) => {
    const clampedCursor = Math.max(0, Math.min(1, cursorPos))
    let minCenter = clampedCursor - halfWindow
    let maxCenter = clampedCursor + halfWindow
    if (allowFullRange) {
      // In output space with padding, allow camera to span full 0-1 range
      // to reveal padding areas when cursor is near video edges
      minCenter = Math.max(minCenter, halfWindow)
      maxCenter = Math.min(maxCenter, 1 - halfWindow)
    } else {
      minCenter = Math.max(minCenter, halfWindow - overscanMin)
      maxCenter = Math.min(maxCenter, 1 - halfWindow + overscanMax)
    }
    if (minCenter > maxCenter) return 0.5
    return Math.max(minCenter, Math.min(maxCenter, c))
  }

  return {
    x: projectAxis(centerNorm.x, cursorNorm.x, halfWindowX, overscan.left, overscan.right),
    y: projectAxis(centerNorm.y, cursorNorm.y, halfWindowY, overscan.top, overscan.bottom),
  }
}

function clampCenterToContentBounds(
  centerNorm: { x: number; y: number },
  halfWindowX: number,
  halfWindowY: number,
  overscan: OutputOverscan,
  /** When true, allow full 0-1 range for output-space calculations */
  allowFullRange: boolean = false
): { x: number; y: number } {
  if (allowFullRange) {
    // In output space, allow camera center to span full 0-1 range
    return {
      x: Math.max(halfWindowX, Math.min(1 - halfWindowX, centerNorm.x)),
      y: Math.max(halfWindowY, Math.min(1 - halfWindowY, centerNorm.y)),
    }
  }
  return {
    x: Math.max(halfWindowX - overscan.left, Math.min(1 - halfWindowX + overscan.right, centerNorm.x)),
    y: Math.max(halfWindowY - overscan.top, Math.min(1 - halfWindowY + overscan.bottom, centerNorm.y)),
  }
}

interface CursorVelocityResult {
  velocity: number
  stoppedSinceMs: number | null
}

/**
 * Calculate cursor velocity from mouse events to detect when cursor has stopped.
 * Uses a short lookback window to compute instantaneous velocity.
 */
function calculateCursorVelocity(
  mouseEvents: MouseEvent[],
  timeMs: number,
  sourceWidth: number,
  sourceHeight: number,
  lookbackMs: number = 50
): CursorVelocityResult {
  if (mouseEvents.length < 2) {
    return { velocity: 0, stoppedSinceMs: timeMs }
  }

  // Find events in lookback window
  const windowStart = timeMs - lookbackMs
  const recentEvents: MouseEvent[] = []

  for (let i = mouseEvents.length - 1; i >= 0; i--) {
    const e = mouseEvents[i]
    if (e.timestamp > timeMs) continue
    if (e.timestamp < windowStart) break
    recentEvents.unshift(e)
  }

  // If no recent events, cursor stopped at last event time
  if (recentEvents.length < 2) {
    // Find the last event at or before timeMs
    let lastTimestamp: number | null = null
    for (let i = mouseEvents.length - 1; i >= 0; i--) {
      if (mouseEvents[i].timestamp <= timeMs) {
        lastTimestamp = mouseEvents[i].timestamp
        break
      }
    }
    if (lastTimestamp === null) {
      lastTimestamp = mouseEvents[mouseEvents.length - 1].timestamp
    }
    if (timeMs - lastTimestamp > lookbackMs) {
      return { velocity: 0, stoppedSinceMs: lastTimestamp }
    }
    return { velocity: 0, stoppedSinceMs: null }
  }

  const first = recentEvents[0]
  const last = recentEvents[recentEvents.length - 1]

  // Treat tiny movements as noise (e.g., trackpad jitter while typing).
  // This prevents the camera from "hunting" at high zoom levels.
  const jitterThresholdPx = 2
  if (
    Math.abs(last.x - first.x) <= jitterThresholdPx &&
    Math.abs(last.y - first.y) <= jitterThresholdPx
  ) {
    return { velocity: 0, stoppedSinceMs: first.timestamp }
  }

  const dt = (last.timestamp - first.timestamp) / 1000

  if (dt < 0.001) {
    return { velocity: 0, stoppedSinceMs: null }
  }

  const dx = (last.x - first.x) / sourceWidth
  const dy = (last.y - first.y) / sourceHeight
  const velocity = Math.sqrt(dx * dx + dy * dy) / dt

  return { velocity, stoppedSinceMs: null }
}

export function computeCameraState({
  effects,
  timelineMs,
  sourceTimeMs,
  recording,
  outputWidth,
  outputHeight,
  overscan,
  physics,
  deterministic,
}: CameraComputeInput): CameraComputeOutput {
  const zoomBlocks = parseZoomBlocks(effects)
  const activeZoomBlock = zoomBlocks.find(
    b => timelineMs >= b.startTime && timelineMs <= b.endTime
  )

  const currentScale = activeZoomBlock
    ? calculateZoomScale(
        timelineMs - activeZoomBlock.startTime,
        activeZoomBlock.endTime - activeZoomBlock.startTime,
        activeZoomBlock.scale ?? 2,
        activeZoomBlock.introMs,
        activeZoomBlock.outroMs
      )
    : 1

  const mouseEvents = ((recording?.metadata as any)?.mouseEvents || []) as MouseEvent[]
  const { sourceWidth, sourceHeight } = getSourceDimensionsAtTime(
    mouseEvents,
    sourceTimeMs,
    recording
  )

  const { halfWindowX, halfWindowY } = getHalfWindows(
    currentScale,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight
  )

  const safeOverscan: OutputOverscan = overscan || { left: 0, right: 0, top: 0, bottom: 0 }
  const hasOverscan =
    safeOverscan.left > 0 || safeOverscan.right > 0 || safeOverscan.top > 0 || safeOverscan.bottom > 0
  const denomX = 1 + safeOverscan.left + safeOverscan.right
  const denomY = 1 + safeOverscan.top + safeOverscan.bottom

  const attractor = calculateAttractor(
    mouseEvents,
    sourceTimeMs,
    sourceWidth,
    sourceHeight
  )

  let cursorNormX = 0.5
  let cursorNormY = 0.5
  if (attractor) {
    cursorNormX = attractor.x / sourceWidth
    cursorNormY = attractor.y / sourceHeight
  }
  cursorNormX = Math.max(0, Math.min(1, cursorNormX))
  cursorNormY = Math.max(0, Math.min(1, cursorNormY))

  // Calculate cursor velocity for stop detection
  const cursorVelocity = calculateCursorVelocity(
    mouseEvents,
    sourceTimeMs,
    sourceWidth,
    sourceHeight
  )

  // Determine if cursor is frozen (stopped while zoomed)
  const shouldApplyStopDetection = currentScale >= CURSOR_STOP_MIN_ZOOM
  let cursorIsFrozen = false
  let frozenTarget: { x: number; y: number } | null = null

  const unfreezeVelocityThreshold = CURSOR_STOP_VELOCITY_THRESHOLD * 1.5

  if (shouldApplyStopDetection && cursorVelocity.velocity < CURSOR_STOP_VELOCITY_THRESHOLD) {
    const stoppedAt = physics.cursorStoppedAtMs ??
      cursorVelocity.stoppedSinceMs ??
      sourceTimeMs
    const stoppedDuration = sourceTimeMs - stoppedAt

    if (stoppedDuration >= CURSOR_STOP_DWELL_MS) {
      cursorIsFrozen = true
      frozenTarget = {
        x: physics.frozenTargetX ?? cursorNormX,
        y: physics.frozenTargetY ?? cursorNormY
      }
    }
    physics.cursorStoppedAtMs = stoppedAt
  } else if (physics.frozenTargetX != null && physics.frozenTargetY != null && cursorVelocity.velocity < unfreezeVelocityThreshold) {
    // Hysteresis: once frozen, keep it frozen until the cursor clearly moves again.
    cursorIsFrozen = true
    frozenTarget = {
      x: physics.frozenTargetX,
      y: physics.frozenTargetY,
    }
  } else {
    physics.cursorStoppedAtMs = undefined
    physics.frozenTargetX = undefined
    physics.frozenTargetY = undefined
  }

  const followStrategy = activeZoomBlock?.followStrategy
  const shouldFollowMouse =
    followStrategy === 'mouse' ||
    // If strategy is unspecified, default to mouse follow.
    followStrategy == null

  let targetCenter = { x: physics.x, y: physics.y }

  if (activeZoomBlock && !shouldFollowMouse && activeZoomBlock.targetX != null && activeZoomBlock.targetY != null) {
    const sw = activeZoomBlock.screenWidth || sourceWidth
    const sh = activeZoomBlock.screenHeight || sourceHeight
    targetCenter = {
      x: activeZoomBlock.targetX / sw,
      y: activeZoomBlock.targetY / sh,
    }
    targetCenter = clampCenterToContentBounds(targetCenter, halfWindowX, halfWindowY, safeOverscan)
  } else {
    if (shouldFollowMouse && hasOverscan) {
      // When preview has padding/letterbox, compute follow in output-normalized space
      // so the camera can track the cursor all the way into padding.
      const cursorOut = {
        x: (safeOverscan.left + cursorNormX) / denomX,
        y: (safeOverscan.top + cursorNormY) / denomY,
      }
      const centerOut = {
        x: (safeOverscan.left + physics.x) / denomX,
        y: (safeOverscan.top + physics.y) / denomY,
      }
      const halfWindowOutX = halfWindowX / denomX
      const halfWindowOutY = halfWindowY / denomY
      const targetOut = calculateFollowTargetNormalized(
        cursorOut,
        centerOut,
        halfWindowOutX,
        halfWindowOutY,
        currentScale,
        { left: 0, right: 0, top: 0, bottom: 0 }
      )
      targetCenter = {
        x: targetOut.x * denomX - safeOverscan.left,
        y: targetOut.y * denomY - safeOverscan.top,
      }
    } else {
      targetCenter = calculateFollowTargetNormalized(
        { x: cursorNormX, y: cursorNormY },
        { x: physics.x, y: physics.y },
        halfWindowX,
        halfWindowY,
        currentScale,
        safeOverscan
      )
    }
  }

  // Override target when cursor is frozen to prevent halt-shake
  if (cursorIsFrozen && frozenTarget) {
    targetCenter = frozenTarget
    physics.frozenTargetX = frozenTarget.x
    physics.frozenTargetY = frozenTarget.y
  }

  let nextPhysics: CameraPhysicsState
  if (deterministic) {
    // Deterministic per-frame center (no dependence on previous frames).
    // Use frozen target if cursor is frozen to ensure consistent output
    const finalTarget = cursorIsFrozen && frozenTarget ? frozenTarget : targetCenter
    nextPhysics = {
      x: finalTarget.x,
      y: finalTarget.y,
      vx: 0,
      vy: 0,
      lastTimeMs: timelineMs,
      lastSourceTimeMs: sourceTimeMs,
      cursorStoppedAtMs: physics.cursorStoppedAtMs,
      frozenTargetX: physics.frozenTargetX,
      frozenTargetY: physics.frozenTargetY,
    }
  } else {
    const dtTimeline = timelineMs - (physics.lastTimeMs ?? timelineMs)
    const dtSource = sourceTimeMs - (physics.lastSourceTimeMs ?? sourceTimeMs)

    const isSeek = Math.abs(dtTimeline) > SEEK_THRESHOLD_MS || dtTimeline < 0
    if (isSeek) {
      nextPhysics = {
        x: targetCenter.x,
        y: targetCenter.y,
        vx: 0,
        vy: 0,
        lastTimeMs: timelineMs,
        lastSourceTimeMs: sourceTimeMs,
      }
    } else {
      const dtSeconds = dtTimeline / 1000

      // Estimate playback rate so sped-up clips follow responsively without
      // destabilizing the spring with oversized time steps (dt based on source time).
      const playbackRateEstimate = dtTimeline > 1 ? dtSource / dtTimeline : 1
      const rate = Math.max(0.5, Math.min(3, playbackRateEstimate || 1))

      // Apply enhanced damping when cursor is frozen to prevent halt-shake
      const effectiveFriction = cursorIsFrozen
        ? SPRING_FRICTION / CURSOR_STOP_DAMPING
        : SPRING_FRICTION * Math.sqrt(rate)

      const effectiveTension = SPRING_TENSION * rate

      const ax = (targetCenter.x - physics.x) * effectiveTension - physics.vx * effectiveFriction
      const ay = (targetCenter.y - physics.y) * effectiveTension - physics.vy * effectiveFriction
      let vx = physics.vx + ax * dtSeconds
      let vy = physics.vy + ay * dtSeconds

      // Additional velocity damping when frozen
      if (cursorIsFrozen) {
        vx *= CURSOR_STOP_DAMPING
        vy *= CURSOR_STOP_DAMPING
      }

      let x = physics.x + vx * dtSeconds
      let y = physics.y + vy * dtSeconds

      // Snap to target when frozen and very close
      if (cursorIsFrozen) {
        const distToTarget = Math.sqrt(
          Math.pow(x - targetCenter.x, 2) + Math.pow(y - targetCenter.y, 2)
        )
        if (distToTarget < CURSOR_STOP_SNAP_THRESHOLD) {
          x = targetCenter.x
          y = targetCenter.y
          vx = 0
          vy = 0
        }
      }

      nextPhysics = { x, y, vx, vy, lastTimeMs: timelineMs, lastSourceTimeMs: sourceTimeMs }
    }
  }

  let finalCenter = { x: nextPhysics.x, y: nextPhysics.y }
  // After freezing, avoid further cursor-visibility projections which can
  // reintroduce jitter from tiny cursor deltas.
  if (shouldFollowMouse && !cursorIsFrozen) {
    if (hasOverscan) {
      const finalOut = {
        x: (safeOverscan.left + finalCenter.x) / denomX,
        y: (safeOverscan.top + finalCenter.y) / denomY,
      }
      const cursorOut = {
        x: (safeOverscan.left + cursorNormX) / denomX,
        y: (safeOverscan.top + cursorNormY) / denomY,
      }
      const halfWindowOutX = halfWindowX / denomX
      const halfWindowOutY = halfWindowY / denomY
      const projectedOut = projectCenterToKeepCursorVisible(
        finalOut,
        cursorOut,
        halfWindowOutX,
        halfWindowOutY,
        { left: 0, right: 0, top: 0, bottom: 0 },
        true // allowFullRange: camera can span full output space to show padding
      )
      finalCenter = {
        x: projectedOut.x * denomX - safeOverscan.left,
        y: projectedOut.y * denomY - safeOverscan.top,
      }
    } else {
      finalCenter = projectCenterToKeepCursorVisible(
        finalCenter,
        { x: cursorNormX, y: cursorNormY },
        halfWindowX,
        halfWindowY,
        safeOverscan
      )
    }
  }
  // When there's overscan (padding), clamp in output space for consistency
  // with the projection calculations above. Otherwise use source-space clamp.
  if (shouldFollowMouse && hasOverscan) {
    const halfWindowOutX = halfWindowX / denomX
    const halfWindowOutY = halfWindowY / denomY
    const finalOut = {
      x: (safeOverscan.left + finalCenter.x) / denomX,
      y: (safeOverscan.top + finalCenter.y) / denomY,
    }
    const clampedOut = clampCenterToContentBounds(finalOut, halfWindowOutX, halfWindowOutY, { left: 0, right: 0, top: 0, bottom: 0 }, true)
    finalCenter = {
      x: clampedOut.x * denomX - safeOverscan.left,
      y: clampedOut.y * denomY - safeOverscan.top,
    }
  } else {
    finalCenter = clampCenterToContentBounds(finalCenter, halfWindowX, halfWindowY, safeOverscan)
  }
  nextPhysics.x = finalCenter.x
  nextPhysics.y = finalCenter.y

  return {
    activeZoomBlock,
    zoomScale: activeZoomBlock ? activeZoomBlock.scale : 1,
    zoomCenter: finalCenter,
    physics: nextPhysics,
  }
}

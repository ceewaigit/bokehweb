/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly PAN_SMOOTHING = 0.15  // Single smoothing value
  private readonly MAX_PAN_OFFSET = 0.45  // Maximum pan from center

  /**
   * Calculate smooth pan offset based on mouse position
   * Follows mouse at edges and when it escapes viewport
   */
  calculateSmoothPan(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): { x: number; y: number } {
    // Normalize mouse position
    const normalizedX = mouseX / videoWidth
    const normalizedY = mouseY / videoHeight

    // Viewport size in normalized coordinates
    const viewportSize = 1 / zoomScale
    
    // Current viewport bounds
    const viewportLeft = 0.5 - currentPanX - viewportSize / 2
    const viewportRight = 0.5 - currentPanX + viewportSize / 2
    const viewportTop = 0.5 - currentPanY - viewportSize / 2
    const viewportBottom = 0.5 - currentPanY + viewportSize / 2

    // Target pan to keep mouse visible
    let targetPanX = currentPanX
    let targetPanY = currentPanY

    // Edge margin (15% of viewport)
    const margin = viewportSize * 0.15

    // Pan when mouse approaches edges
    if (normalizedX < viewportLeft + margin) {
      targetPanX = 0.5 - normalizedX + margin
    } else if (normalizedX > viewportRight - margin) {
      targetPanX = 0.5 - normalizedX - margin
    }

    if (normalizedY < viewportTop + margin) {
      targetPanY = 0.5 - normalizedY + margin
    } else if (normalizedY > viewportBottom - margin) {
      targetPanY = 0.5 - normalizedY - margin
    }

    // Clamp to bounds
    const maxPan = Math.min(this.MAX_PAN_OFFSET, (1 - viewportSize) / 2)
    targetPanX = Math.max(-maxPan, Math.min(maxPan, targetPanX))
    targetPanY = Math.max(-maxPan, Math.min(maxPan, targetPanY))

    // Smooth interpolation
    const deltaX = targetPanX - currentPanX
    const deltaY = targetPanY - currentPanY
    
    return {
      x: currentPanX + deltaX * this.PAN_SMOOTHING,
      y: currentPanY + deltaY * this.PAN_SMOOTHING
    }
  }

  /**
   * Interpolate mouse position with smooth cubic bezier curves
   */
  interpolateMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } | null {
    if (!mouseEvents || mouseEvents.length === 0) {
      return null
    }

    // Need at least 4 points for smooth cubic interpolation
    if (mouseEvents.length < 4) {
      // Fallback to simple interpolation for few points
      return this.simpleInterpolate(mouseEvents, timeMs)
    }

    // Find the relevant segment
    let segmentStart = 0
    for (let i = 0; i < mouseEvents.length - 1; i++) {
      if (mouseEvents[i].timestamp <= timeMs && mouseEvents[i + 1].timestamp > timeMs) {
        segmentStart = i
        break
      }
    }

    // Handle edge cases
    if (timeMs <= mouseEvents[0].timestamp) {
      return { x: mouseEvents[0].x, y: mouseEvents[0].y }
    }
    if (timeMs >= mouseEvents[mouseEvents.length - 1].timestamp) {
      return { x: mouseEvents[mouseEvents.length - 1].x, y: mouseEvents[mouseEvents.length - 1].y }
    }

    // Get 4 control points for cubic interpolation
    const p0 = mouseEvents[Math.max(0, segmentStart - 1)]
    const p1 = mouseEvents[segmentStart]
    const p2 = mouseEvents[Math.min(mouseEvents.length - 1, segmentStart + 1)]
    const p3 = mouseEvents[Math.min(mouseEvents.length - 1, segmentStart + 2)]

    // Calculate t value for current time
    const segmentDuration = p2.timestamp - p1.timestamp
    const t = segmentDuration > 0 ? (timeMs - p1.timestamp) / segmentDuration : 0

    // Catmull-Rom spline interpolation for smooth curves
    const t2 = t * t
    const t3 = t2 * t

    // Catmull-Rom coefficients
    const v0 = (p2.x - p0.x) * 0.5
    const v1 = (p3.x - p1.x) * 0.5
    const x = p1.x + v0 * t + (3 * (p2.x - p1.x) - 2 * v0 - v1) * t2 + (2 * (p1.x - p2.x) + v0 + v1) * t3

    const v0y = (p2.y - p0.y) * 0.5
    const v1y = (p3.y - p1.y) * 0.5
    const y = p1.y + v0y * t + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3

    return { x, y }
  }

  private simpleInterpolate(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } {
    // Find surrounding events
    let before: MouseEvent | null = null
    let after: MouseEvent | null = null

    for (let i = 0; i < mouseEvents.length; i++) {
      if (mouseEvents[i].timestamp <= timeMs) {
        before = mouseEvents[i]
      } else {
        after = mouseEvents[i]
        break
      }
    }

    if (!before) {
      return { x: mouseEvents[0].x, y: mouseEvents[0].y }
    }
    if (!after) {
      return { x: before.x, y: before.y }
    }

    // Smooth interpolation with easing
    const timeDiff = after.timestamp - before.timestamp
    if (timeDiff === 0) {
      return { x: before.x, y: before.y }
    }

    const t = (timeMs - before.timestamp) / timeDiff
    // Apply smoothstep for smoother transitions
    const smoothT = t * t * (3 - 2 * t)

    return {
      x: before.x + (after.x - before.x) * smoothT,
      y: before.y + (after.y - before.y) * smoothT
    }
  }

}

export const zoomPanCalculator = new ZoomPanCalculator()
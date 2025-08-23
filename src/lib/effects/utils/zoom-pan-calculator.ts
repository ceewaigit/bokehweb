/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly EDGE_THRESHOLD = 0.25  // Start panning when mouse is within 25% of viewport edge
  private readonly PAN_SMOOTHING = 0.08  // Slower, smoother interpolation for butter-smooth pan
  private readonly MAX_PAN_OFFSET = 0.35  // Maximum pan from center (35% of half viewport)

  /**
   * Calculate smooth pan offset based on mouse position
   * Uses gentle, predictable movement for professional feel
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
    // Normalize mouse position to 0-1 range
    const normalizedX = Math.max(0, Math.min(1, mouseX / videoWidth))
    const normalizedY = Math.max(0, Math.min(1, mouseY / videoHeight))

    // Calculate the visible viewport size in normalized coordinates
    const viewportWidth = 1 / zoomScale
    const viewportHeight = 1 / zoomScale

    // Calculate target pan to keep mouse in comfortable viewing area
    let targetPanX = currentPanX  // Start with current position for stability
    let targetPanY = currentPanY

    // Calculate how close mouse is to edges of current viewport
    const viewportCenterX = 0.5 - currentPanX
    const viewportCenterY = 0.5 - currentPanY

    const mouseInViewportX = (normalizedX - (viewportCenterX - viewportWidth / 2)) / viewportWidth
    const mouseInViewportY = (normalizedY - (viewportCenterY - viewportHeight / 2)) / viewportHeight

    // Use a larger comfort zone to reduce jitter
    const comfortZone = 0.6  // Central 60% of viewport (more stable)
    const comfortMin = (1 - comfortZone) / 2
    const comfortMax = 1 - comfortMin

    // Only pan if mouse is significantly outside comfort zone
    const panThreshold = 0.05  // Dead zone to prevent micro-movements

    if (mouseInViewportX < comfortMin - panThreshold) {
      // Mouse too far left - pan left gently
      const overshoot = comfortMin - mouseInViewportX
      const offset = overshoot * viewportWidth * 0.5  // Reduced response
      targetPanX = currentPanX + offset
    } else if (mouseInViewportX > comfortMax + panThreshold) {
      // Mouse too far right - pan right gently
      const overshoot = mouseInViewportX - comfortMax
      const offset = overshoot * viewportWidth * 0.5  // Reduced response
      targetPanX = currentPanX - offset
    }

    if (mouseInViewportY < comfortMin - panThreshold) {
      // Mouse too far up - pan up gently
      const overshoot = comfortMin - mouseInViewportY
      const offset = overshoot * viewportHeight * 0.5  // Reduced response
      targetPanY = currentPanY + offset
    } else if (mouseInViewportY > comfortMax + panThreshold) {
      // Mouse too far down - pan down gently
      const overshoot = mouseInViewportY - comfortMax
      const offset = overshoot * viewportHeight * 0.5  // Reduced response
      targetPanY = currentPanY - offset
    }

    // Clamp target pan to maximum bounds
    const maxPanX = Math.min(this.MAX_PAN_OFFSET, (1 - viewportWidth) / 2)
    const maxPanY = Math.min(this.MAX_PAN_OFFSET, (1 - viewportHeight) / 2)

    targetPanX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX))
    targetPanY = Math.max(-maxPanY, Math.min(maxPanY, targetPanY))

    // Apply smoothing with a gentle curve for butter-smooth movement
    const smoothingFactor = this.PAN_SMOOTHING
    const deltaX = targetPanX - currentPanX
    const deltaY = targetPanY - currentPanY

    // Only update if change is significant (reduces jitter)
    const minChange = 0.0001
    const newPanX = Math.abs(deltaX) > minChange
      ? currentPanX + deltaX * smoothingFactor
      : currentPanX
    const newPanY = Math.abs(deltaY) > minChange
      ? currentPanY + deltaY * smoothingFactor
      : currentPanY

    return {
      x: newPanX,
      y: newPanY
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
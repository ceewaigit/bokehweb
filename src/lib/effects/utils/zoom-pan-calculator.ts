/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly PAN_SMOOTHING = 0.06  // 3x more responsive for faster tracking
  private readonly EDGE_THRESHOLD = 0.25  // Trigger panning when mouse is within 25% of edge
  private readonly RECENTERING_MARGIN = 0.15  // Less wasted space when recentering
  private readonly MAX_PAN_SPEED = 0.020  // 2.5x faster to keep up with mouse
  private targetPanX: number = 0
  private targetPanY: number = 0
  private velocityX: number = 0
  private velocityY: number = 0
  private lastMouseX: number = 0  // Track mouse velocity
  private lastMouseY: number = 0
  private mouseVelocityX: number = 0
  private mouseVelocityY: number = 0

  /**
   * Calculate pan offset using edge-based triggering like Screen Studio
   * Only pans when mouse approaches viewport edges, otherwise stays stable
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
    // Calculate mouse velocity for predictive panning
    const mouseVelX = mouseX - this.lastMouseX
    const mouseVelY = mouseY - this.lastMouseY
    this.mouseVelocityX = this.mouseVelocityX * 0.7 + mouseVelX * 0.3
    this.mouseVelocityY = this.mouseVelocityY * 0.7 + mouseVelY * 0.3
    this.lastMouseX = mouseX
    this.lastMouseY = mouseY
    
    // Predict where mouse will be in a few frames
    const predictionFrames = 8  // Look ahead 8 frames
    const predictedMouseX = mouseX + this.mouseVelocityX * predictionFrames
    const predictedMouseY = mouseY + this.mouseVelocityY * predictionFrames
    
    // Calculate viewport dimensions in pixels
    const viewportWidth = videoWidth / zoomScale
    const viewportHeight = videoHeight / zoomScale
    
    // Calculate current viewport bounds in video space
    // Pan values are normalized (-0.5 to 0.5), convert to pixels
    const viewportCenterX = videoWidth / 2 - currentPanX * videoWidth
    const viewportCenterY = videoHeight / 2 - currentPanY * videoHeight
    
    const viewportLeft = viewportCenterX - viewportWidth / 2
    const viewportRight = viewportCenterX + viewportWidth / 2
    const viewportTop = viewportCenterY - viewportHeight / 2
    const viewportBottom = viewportCenterY + viewportHeight / 2
    
    // Calculate edge zones (pixels from viewport edge)
    const edgeZoneX = viewportWidth * this.EDGE_THRESHOLD
    const edgeZoneY = viewportHeight * this.EDGE_THRESHOLD
    const recenterMarginX = viewportWidth * this.RECENTERING_MARGIN
    const recenterMarginY = viewportHeight * this.RECENTERING_MARGIN
    
    // Check if mouse (current or predicted) is near edges or outside viewport
    const nearLeftEdge = mouseX < viewportLeft + edgeZoneX || predictedMouseX < viewportLeft + edgeZoneX * 0.8
    const nearRightEdge = mouseX > viewportRight - edgeZoneX || predictedMouseX > viewportRight - edgeZoneX * 0.8
    const nearTopEdge = mouseY < viewportTop + edgeZoneY || predictedMouseY < viewportTop + edgeZoneY * 0.8
    const nearBottomEdge = mouseY > viewportBottom - edgeZoneY || predictedMouseY > viewportBottom - edgeZoneY * 0.8
    
    // Check if mouse is completely outside viewport (needs immediate panning)
    const outsideLeft = mouseX < viewportLeft || predictedMouseX < viewportLeft
    const outsideRight = mouseX > viewportRight || predictedMouseX > viewportRight
    const outsideTop = mouseY < viewportTop || predictedMouseY < viewportTop
    const outsideBottom = mouseY > viewportBottom || predictedMouseY > viewportBottom
    
    // Calculate new target pan only if near edges or outside
    let newTargetPanX = currentPanX
    let newTargetPanY = currentPanY
    
    // Horizontal panning
    if (nearLeftEdge || outsideLeft) {
      // Pan left to bring mouse back into comfortable viewing area
      const targetMouseX = mouseX + recenterMarginX
      const requiredCenterX = targetMouseX
      newTargetPanX = (videoWidth / 2 - requiredCenterX) / videoWidth
    } else if (nearRightEdge || outsideRight) {
      // Pan right
      const targetMouseX = mouseX - recenterMarginX
      const requiredCenterX = targetMouseX
      newTargetPanX = (videoWidth / 2 - requiredCenterX) / videoWidth
    }
    
    // Vertical panning
    if (nearTopEdge || outsideTop) {
      // Pan up
      const targetMouseY = mouseY + recenterMarginY
      const requiredCenterY = targetMouseY
      newTargetPanY = (videoHeight / 2 - requiredCenterY) / videoHeight
    } else if (nearBottomEdge || outsideBottom) {
      // Pan down
      const targetMouseY = mouseY - recenterMarginY
      const requiredCenterY = targetMouseY
      newTargetPanY = (videoHeight / 2 - requiredCenterY) / videoHeight
    }
    
    // Clamp pan to maximum bounds (can't pan beyond video edges)
    const maxPanX = (1 - 1/zoomScale) / 2
    const maxPanY = (1 - 1/zoomScale) / 2
    newTargetPanX = Math.max(-maxPanX, Math.min(maxPanX, newTargetPanX))
    newTargetPanY = Math.max(-maxPanY, Math.min(maxPanY, newTargetPanY))
    
    // Update target if changed
    this.targetPanX = newTargetPanX
    this.targetPanY = newTargetPanY
    
    // Professional easing function
    const ease = (t: number) => {
      if (t < 0.5) return 4 * t * t * t
      const f = (2 * t) - 2
      return 1 + f * f * f / 2
    }
    
    // Calculate velocity for momentum
    const deltaX = this.targetPanX - currentPanX
    const deltaY = this.targetPanY - currentPanY
    
    // Update velocity with spring physics
    this.velocityX = this.velocityX * 0.9 + deltaX * 0.1
    this.velocityY = this.velocityY * 0.9 + deltaY * 0.1
    
    // Calculate distance for adaptive smoothing
    const distanceX = Math.abs(deltaX)
    const distanceY = Math.abs(deltaY)
    
    // Calculate distance from mouse to edge for progressive urgency
    const distToLeftEdge = Math.max(0, mouseX - viewportLeft) / edgeZoneX
    const distToRightEdge = Math.max(0, viewportRight - mouseX) / edgeZoneX
    const distToTopEdge = Math.max(0, mouseY - viewportTop) / edgeZoneY
    const distToBottomEdge = Math.max(0, viewportBottom - mouseY) / edgeZoneY
    
    // Find minimum distance to any edge (0 = at edge, 1 = far from edge)
    const minEdgeDistX = Math.min(distToLeftEdge, distToRightEdge)
    const minEdgeDistY = Math.min(distToTopEdge, distToBottomEdge)
    
    // Progressive urgency based on edge proximity
    let urgency = this.PAN_SMOOTHING
    if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
      urgency *= 4.0 // 4x faster response when outside viewport
    } else if (nearLeftEdge || nearRightEdge) {
      // Progressive urgency: closer to edge = faster response
      const edgeUrgency = 1.0 + (1.0 - Math.min(minEdgeDistX, 1.0)) * 2.0
      urgency *= edgeUrgency
    } else if (nearTopEdge || nearBottomEdge) {
      const edgeUrgency = 1.0 + (1.0 - Math.min(minEdgeDistY, 1.0)) * 2.0
      urgency *= edgeUrgency
    }
    
    // Distance-based speed (slow down as we approach target)
    const distanceNormX = Math.min(distanceX / 0.3, 1)
    const distanceNormY = Math.min(distanceY / 0.3, 1)
    const easedDistanceX = ease(distanceNormX)
    const easedDistanceY = ease(distanceNormY)
    
    // Apply spring physics with urgency
    const springForceX = deltaX * urgency * easedDistanceX
    const springForceY = deltaY * urgency * easedDistanceY
    
    // Combine spring force with velocity
    const finalDeltaX = springForceX + this.velocityX * 0.2
    const finalDeltaY = springForceY + this.velocityY * 0.2
    
    // Dynamic speed limiting based on urgency and distance
    const speedMultiplier = outsideLeft || outsideRight || outsideTop || outsideBottom ? 2.0 : 1.0
    const speedLimitX = this.MAX_PAN_SPEED * speedMultiplier * (1 + easedDistanceX * 0.5)
    const speedLimitY = this.MAX_PAN_SPEED * speedMultiplier * (1 + easedDistanceY * 0.5)
    const clampedDeltaX = Math.max(-speedLimitX, Math.min(speedLimitX, finalDeltaX))
    const clampedDeltaY = Math.max(-speedLimitY, Math.min(speedLimitY, finalDeltaY))
    
    return {
      x: currentPanX + clampedDeltaX,
      y: currentPanY + clampedDeltaY
    }
  }

  /**
   * Calculate initial pan position for a zoom block
   * Centers the viewport on the target position
   */
  calculateInitialPan(
    targetX: number,  // Normalized 0-1
    targetY: number,  // Normalized 0-1
    zoomScale: number
  ): { x: number; y: number } {
    // Calculate how much we can pan at this zoom level
    const maxPanX = (1 - 1/zoomScale) / 2
    const maxPanY = (1 - 1/zoomScale) / 2
    
    // Calculate pan to center on target
    // When targetX = 0.5, pan should be 0 (centered)
    // When targetX = 0, pan should be positive (shift viewport left)
    // When targetX = 1, pan should be negative (shift viewport right)
    const panX = (0.5 - targetX) * (zoomScale - 1) / zoomScale
    const panY = (0.5 - targetY) * (zoomScale - 1) / zoomScale
    
    // Clamp to bounds
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, panX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, panY))
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
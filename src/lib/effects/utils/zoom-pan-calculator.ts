/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings
  private readonly ZOOM_PAN_SMOOTHING = 0.1  // Smooth cinematic feel
  private readonly EDGE_BUFFER = 0.2  // Keep mouse 20% from viewport edges

  /**
   * Calculate cinematic pan for zoom - simple and stable
   * Keeps mouse in viewport with smooth following
   */
  calculateCinematicZoomPan(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): { x: number; y: number } {
    // Normalize mouse position to 0-1
    const mouseNormX = mouseX / videoWidth;
    const mouseNormY = mouseY / videoHeight;

    // Calculate viewport size in normalized space (0-1)
    const viewportWidth = 1 / zoomScale;
    const viewportHeight = 1 / zoomScale;
    
    // Current viewport center (pan moves content, so subtract to get viewport position)
    const currentViewportCenterX = 0.5 - currentPanX;
    const currentViewportCenterY = 0.5 - currentPanY;
    
    // Current viewport edges
    const viewportLeft = currentViewportCenterX - viewportWidth / 2;
    const viewportRight = currentViewportCenterX + viewportWidth / 2;
    const viewportTop = currentViewportCenterY - viewportHeight / 2;
    const viewportBottom = currentViewportCenterY + viewportHeight / 2;
    
    // Calculate target viewport center to keep mouse in view
    let targetViewportCenterX = currentViewportCenterX;
    let targetViewportCenterY = currentViewportCenterY;
    
    // Buffer zone - keep mouse this far from edges
    const bufferX = this.EDGE_BUFFER * viewportWidth;
    const bufferY = this.EDGE_BUFFER * viewportHeight;
    
    // Only pan if mouse is near edge or outside viewport
    if (mouseNormX < viewportLeft + bufferX) {
      // Mouse near/past left edge - pan viewport left
      targetViewportCenterX = mouseNormX - bufferX + viewportWidth / 2;
    } else if (mouseNormX > viewportRight - bufferX) {
      // Mouse near/past right edge - pan viewport right
      targetViewportCenterX = mouseNormX + bufferX - viewportWidth / 2;
    }
    
    if (mouseNormY < viewportTop + bufferY) {
      // Mouse near/past top edge - pan viewport up
      targetViewportCenterY = mouseNormY - bufferY + viewportHeight / 2;
    } else if (mouseNormY > viewportBottom - bufferY) {
      // Mouse near/past bottom edge - pan viewport down
      targetViewportCenterY = mouseNormY + bufferY - viewportHeight / 2;
    }
    
    // Convert viewport center to pan values
    // Pan = -(viewport_center - 0.5) because pan moves content opposite to viewport
    const targetPanX = -(targetViewportCenterX - 0.5);
    const targetPanY = -(targetViewportCenterY - 0.5);
    
    // No clamping - allow showing padding area
    
    // Smooth interpolation for cinematic movement
    const newPanX = currentPanX + (targetPanX - currentPanX) * this.ZOOM_PAN_SMOOTHING;
    const newPanY = currentPanY + (targetPanY - currentPanY) * this.ZOOM_PAN_SMOOTHING;

    return {
      x: newPanX,
      y: newPanY
    };
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

    // Simple interpolation for few points
    if (mouseEvents.length < 4) {
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
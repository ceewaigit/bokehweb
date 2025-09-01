/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings - simplified for direct mouse following
  private readonly ZOOM_PAN_SMOOTHING = 0.08  // Smooth cinematic feel
  private readonly EDGE_MARGIN = 0.25  // Keep mouse within 25% of viewport edge

  /**
   * Calculate cinematic pan for zoom - follows mouse smoothly
   * Keeps mouse relatively centered in the zoomed viewport
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
    const normalizedMouseX = mouseX / videoWidth;
    const normalizedMouseY = mouseY / videoHeight;

    // Calculate viewport size in normalized space
    const viewportWidth = 1 / zoomScale;
    const viewportHeight = 1 / zoomScale;

    // The ideal pan would center the mouse in the viewport
    // Pan represents how much to offset the viewport from center (0.5, 0.5)
    // Positive pan moves the viewport (and thus the content) in that direction
    
    // Calculate where we want the viewport center to be
    // We want the mouse to be near the center of our viewport
    let idealViewportCenterX = normalizedMouseX;
    let idealViewportCenterY = normalizedMouseY;

    // Apply edge margin to keep mouse away from viewport edges
    // This creates a "look ahead" effect
    const mouseOffsetFromCenterX = normalizedMouseX - 0.5;
    const mouseOffsetFromCenterY = normalizedMouseY - 0.5;
    
    // Reduce the offset to keep mouse closer to center (cinematic look-ahead)
    idealViewportCenterX = 0.5 + mouseOffsetFromCenterX * 0.7;
    idealViewportCenterY = 0.5 + mouseOffsetFromCenterY * 0.7;

    // Calculate target pan (offset from center)
    // Pan moves the content, not the viewport
    // To move viewport right (follow mouse going right), we pan content left (negative)
    let targetPanX = -(idealViewportCenterX - 0.5);
    let targetPanY = -(idealViewportCenterY - 0.5);

    // Clamp pan to keep viewport within video bounds
    // Maximum pan is limited by how much we can move while keeping viewport in bounds
    const maxPanX = Math.max(0, (1 - viewportWidth) / 2);
    const maxPanY = Math.max(0, (1 - viewportHeight) / 2);
    
    targetPanX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX));
    targetPanY = Math.max(-maxPanY, Math.min(maxPanY, targetPanY));

    // Check if mouse is getting close to viewport edge for urgency
    const currentViewportCenterX = 0.5 - currentPanX;
    const currentViewportCenterY = 0.5 - currentPanY;
    
    const distFromCenterX = Math.abs(normalizedMouseX - currentViewportCenterX);
    const distFromCenterY = Math.abs(normalizedMouseY - currentViewportCenterY);
    
    // More urgent smoothing when mouse is far from viewport center
    const urgencyX = distFromCenterX > viewportWidth * 0.35 ? 0.15 : this.ZOOM_PAN_SMOOTHING;
    const urgencyY = distFromCenterY > viewportHeight * 0.35 ? 0.15 : this.ZOOM_PAN_SMOOTHING;

    const newPanX = currentPanX + (targetPanX - currentPanX) * urgencyX;
    const newPanY = currentPanY + (targetPanY - currentPanY) * urgencyY;

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
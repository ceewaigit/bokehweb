/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings
  private readonly ZOOM_PAN_SMOOTHING = 0.12  // Smooth but responsive
  private readonly EDGE_BUFFER = 0.15  // Keep mouse 15% away from viewport edge

  /**
   * Calculate cinematic pan for zoom - directly follows mouse
   * Ensures mouse stays visible in viewport at all times
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
    
    // Current viewport position (center point)
    const currentViewportCenterX = 0.5 + currentPanX;
    const currentViewportCenterY = 0.5 + currentPanY;
    
    // Current viewport edges
    const viewportLeft = currentViewportCenterX - viewportWidth / 2;
    const viewportRight = currentViewportCenterX + viewportWidth / 2;
    const viewportTop = currentViewportCenterY - viewportHeight / 2;
    const viewportBottom = currentViewportCenterY + viewportHeight / 2;
    
    // Calculate target pan to keep mouse in viewport
    let targetPanX = currentPanX;
    let targetPanY = currentPanY;
    
    // Buffer zone inside viewport edges
    const bufferX = viewportWidth * this.EDGE_BUFFER;
    const bufferY = viewportHeight * this.EDGE_BUFFER;
    
    // Check if mouse is outside the safe zone and adjust
    if (mouseNormX < viewportLeft + bufferX) {
      // Mouse too far left - pan left
      const targetViewportLeft = mouseNormX - bufferX;
      targetPanX = targetViewportLeft + viewportWidth / 2 - 0.5;
    } else if (mouseNormX > viewportRight - bufferX) {
      // Mouse too far right - pan right  
      const targetViewportRight = mouseNormX + bufferX;
      targetPanX = targetViewportRight - viewportWidth / 2 - 0.5;
    }
    
    if (mouseNormY < viewportTop + bufferY) {
      // Mouse too far up - pan up
      const targetViewportTop = mouseNormY - bufferY;
      targetPanY = targetViewportTop + viewportHeight / 2 - 0.5;
    } else if (mouseNormY > viewportBottom - bufferY) {
      // Mouse too far down - pan down
      const targetViewportBottom = mouseNormY + bufferY;
      targetPanY = targetViewportBottom - viewportHeight / 2 - 0.5;
    }
    
    // Clamp pan to valid bounds (don't show outside video)
    const maxPanX = Math.max(0, (1 - viewportWidth) / 2);
    const maxPanY = Math.max(0, (1 - viewportHeight) / 2);
    
    targetPanX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX));
    targetPanY = Math.max(-maxPanY, Math.min(maxPanY, targetPanY));
    
    // Calculate urgency based on how close mouse is to leaving viewport
    const mouseDistFromEdgeX = Math.min(
      mouseNormX - viewportLeft,
      viewportRight - mouseNormX
    );
    const mouseDistFromEdgeY = Math.min(
      mouseNormY - viewportTop,
      viewportBottom - mouseNormY
    );
    
    // Use more aggressive smoothing when mouse is about to leave viewport
    const urgencyX = mouseDistFromEdgeX < bufferX * 0.5 ? 0.25 : this.ZOOM_PAN_SMOOTHING;
    const urgencyY = mouseDistFromEdgeY < bufferY * 0.5 ? 0.25 : this.ZOOM_PAN_SMOOTHING;

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
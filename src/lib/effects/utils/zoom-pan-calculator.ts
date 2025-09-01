/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings
  private readonly ZOOM_PAN_SMOOTHING = 0.08  // Smooth cinematic feel
  private readonly CENTER_WEIGHT = 0.4  // How much to center the mouse (0.5 = full center, 0 = edge follow)

  /**
   * Calculate cinematic pan for zoom - smoothly follows mouse
   * Creates a cinematic look-ahead effect like Screen Studio
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
    
    // For cinematic effect, we want the mouse to influence the viewport center
    // but not be perfectly centered - this creates a natural look-ahead
    
    // Calculate ideal viewport center that keeps mouse comfortably in view
    // Blend between current mouse position and video center for smooth motion
    const idealViewportCenterX = mouseNormX * this.CENTER_WEIGHT + 0.5 * (1 - this.CENTER_WEIGHT);
    const idealViewportCenterY = mouseNormY * this.CENTER_WEIGHT + 0.5 * (1 - this.CENTER_WEIGHT);
    
    // Calculate the pan needed to achieve this viewport center
    // Pan = -(viewport_center - 0.5) because pan moves content opposite to viewport
    let targetPanX = -(idealViewportCenterX - 0.5);
    let targetPanY = -(idealViewportCenterY - 0.5);
    
    // Ensure mouse stays within viewport bounds with some margin
    const currentViewportCenterX = 0.5 - currentPanX;
    const currentViewportCenterY = 0.5 - currentPanY;
    
    const viewportLeft = currentViewportCenterX - viewportWidth / 2;
    const viewportRight = currentViewportCenterX + viewportWidth / 2;
    const viewportTop = currentViewportCenterY - viewportHeight / 2;
    const viewportBottom = currentViewportCenterY + viewportHeight / 2;
    
    // If mouse is outside viewport, adjust target to bring it back smoothly
    const margin = 0.1; // 10% margin from edge
    
    if (mouseNormX < viewportLeft + viewportWidth * margin) {
      // Mouse escaping left - pull viewport left more aggressively
      const correction = (viewportLeft + viewportWidth * margin - mouseNormX);
      targetPanX = currentPanX + correction;
    } else if (mouseNormX > viewportRight - viewportWidth * margin) {
      // Mouse escaping right - pull viewport right more aggressively
      const correction = (mouseNormX - (viewportRight - viewportWidth * margin));
      targetPanX = currentPanX - correction;
    }
    
    if (mouseNormY < viewportTop + viewportHeight * margin) {
      // Mouse escaping top
      const correction = (viewportTop + viewportHeight * margin - mouseNormY);
      targetPanY = currentPanY + correction;
    } else if (mouseNormY > viewportBottom - viewportHeight * margin) {
      // Mouse escaping bottom
      const correction = (mouseNormY - (viewportBottom - viewportHeight * margin));
      targetPanY = currentPanY - correction;
    }
    
    // Allow panning beyond video bounds since we have padding
    // This lets the camera follow the mouse anywhere
    // No clamping needed - let it show the background/padding area
    
    // Calculate distance from mouse to viewport center for dynamic smoothing
    const distFromCenterX = Math.abs(mouseNormX - currentViewportCenterX);
    const distFromCenterY = Math.abs(mouseNormY - currentViewportCenterY);
    
    // More urgent when mouse is far from viewport center
    const maxDistX = viewportWidth * 0.4;
    const maxDistY = viewportHeight * 0.4;
    
    const urgencyX = distFromCenterX > maxDistX ? 0.15 : this.ZOOM_PAN_SMOOTHING;
    const urgencyY = distFromCenterY > maxDistY ? 0.15 : this.ZOOM_PAN_SMOOTHING;

    // Smooth interpolation for cinematic movement
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
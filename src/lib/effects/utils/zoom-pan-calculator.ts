/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings
  private readonly ZOOM_EDGE_THRESHOLD = 0.25  // Trigger panning when mouse is within 25% of edge
  private readonly ZOOM_DEAD_ZONE = 0.4  // 40% center area with no panning
  private readonly ZOOM_PAN_SMOOTHING = 0.01  // Extra smooth for cinematic feel
  private readonly ZOOM_MAX_PAN = 0.15  // Maximum 15% pan offset during zoom

  /**
   * Calculate cinematic pan for zoom - smooth and restricted
   * Only pans when mouse is near edges, with dead zone in center
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
    const normalizedX = mouseX / videoWidth;
    const normalizedY = mouseY / videoHeight;
    
    // Check if mouse is in dead zone (center 40% of screen)
    const inDeadZoneX = normalizedX > (0.5 - this.ZOOM_DEAD_ZONE/2) && 
                        normalizedX < (0.5 + this.ZOOM_DEAD_ZONE/2);
    const inDeadZoneY = normalizedY > (0.5 - this.ZOOM_DEAD_ZONE/2) && 
                        normalizedY < (0.5 + this.ZOOM_DEAD_ZONE/2);
    
    let targetPanX = currentPanX;
    let targetPanY = currentPanY;
    
    // Only pan if outside dead zone
    if (!inDeadZoneX) {
      // Calculate distance from center
      const distFromCenterX = normalizedX - 0.5;
      
      // Check if near edges (25% from edge)
      if (normalizedX < this.ZOOM_EDGE_THRESHOLD || normalizedX > (1 - this.ZOOM_EDGE_THRESHOLD)) {
        // Calculate pan to keep mouse in comfortable zone
        // Pan is proportional to distance from center, clamped to max
        targetPanX = -distFromCenterX * 0.3; // 30% of distance
        targetPanX = Math.max(-this.ZOOM_MAX_PAN, Math.min(this.ZOOM_MAX_PAN, targetPanX));
      }
    }
    
    if (!inDeadZoneY) {
      const distFromCenterY = normalizedY - 0.5;
      
      if (normalizedY < this.ZOOM_EDGE_THRESHOLD || normalizedY > (1 - this.ZOOM_EDGE_THRESHOLD)) {
        targetPanY = -distFromCenterY * 0.3;
        targetPanY = Math.max(-this.ZOOM_MAX_PAN, Math.min(this.ZOOM_MAX_PAN, targetPanY));
      }
    }
    
    // Apply very smooth interpolation for cinematic feel
    const smoothing = this.ZOOM_PAN_SMOOTHING;
    const newPanX = currentPanX + (targetPanX - currentPanX) * smoothing;
    const newPanY = currentPanY + (targetPanY - currentPanY) * smoothing;
    
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
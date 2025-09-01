/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  // Cinematic zoom settings
  private readonly ZOOM_EDGE_THRESHOLD = 0.15  // Trigger panning when mouse is within 15% of edge
  private readonly ZOOM_PAN_SMOOTHING = 0.15  // Much smoother for cinematic feel
  private readonly DEAD_ZONE = 0.35  // Center 35% has no panning

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

    // Calculate viewport bounds in normalized space
    const viewportWidth = 1 / zoomScale;
    const viewportHeight = 1 / zoomScale;

    // Calculate what portion of the video is visible
    const viewportLeft = 0.5 - viewportWidth / 2 - currentPanX;
    const viewportRight = 0.5 + viewportWidth / 2 - currentPanX;
    const viewportTop = 0.5 - viewportHeight / 2 - currentPanY;
    const viewportBottom = 0.5 + viewportHeight / 2 - currentPanY;

    // Calculate dead zone in center (no panning needed)
    const deadZoneLeft = 0.5 - this.DEAD_ZONE / 2;
    const deadZoneRight = 0.5 + this.DEAD_ZONE / 2;
    const deadZoneTop = 0.5 - this.DEAD_ZONE / 2;
    const deadZoneBottom = 0.5 + this.DEAD_ZONE / 2;

    // Calculate safe zone (where mouse should ideally be)
    const safeMargin = this.ZOOM_EDGE_THRESHOLD;
    const safeLeft = viewportLeft + safeMargin * viewportWidth;
    const safeRight = viewportRight - safeMargin * viewportWidth;
    const safeTop = viewportTop + safeMargin * viewportHeight;
    const safeBottom = viewportBottom - safeMargin * viewportHeight;

    let targetPanX = currentPanX;
    let targetPanY = currentPanY;

    // Check if mouse is in dead zone first
    const inDeadZoneX = normalizedX >= deadZoneLeft && normalizedX <= deadZoneRight;
    const inDeadZoneY = normalizedY >= deadZoneTop && normalizedY <= deadZoneBottom;

    // Pan to keep mouse within safe zone (with correct direction)
    if (!inDeadZoneX) {
      if (normalizedX < safeLeft) {
        // Mouse is too far left, pan left (negative direction)
        const offset = safeLeft - normalizedX;
        targetPanX = currentPanX - offset * 0.25; // Move 25% of the distance
      } else if (normalizedX > safeRight) {
        // Mouse is too far right, pan right (positive direction)
        const offset = normalizedX - safeRight;
        targetPanX = currentPanX + offset * 0.25;
      }
    }

    if (!inDeadZoneY) {
      if (normalizedY < safeTop) {
        // Mouse is too far up, pan up (negative direction)
        const offset = safeTop - normalizedY;
        targetPanY = currentPanY - offset * 0.25;
      } else if (normalizedY > safeBottom) {
        // Mouse is too far down, pan down (positive direction)
        const offset = normalizedY - safeBottom;
        targetPanY = currentPanY + offset * 0.25;
      }
    }

    // Clamp to maximum pan bounds (allowing some overflow for padding)
    const maxPan = (1 - viewportWidth) / 2 + 0.1; // Allow 10% extra for padding
    targetPanX = Math.max(-maxPan, Math.min(maxPan, targetPanX));
    targetPanY = Math.max(-maxPan, Math.min(maxPan, targetPanY));

    // Apply smooth interpolation with urgency based on distance from edge
    const distFromEdgeX = Math.min(
      Math.abs(normalizedX - viewportLeft) / viewportWidth,
      Math.abs(viewportRight - normalizedX) / viewportWidth
    );
    const distFromEdgeY = Math.min(
      Math.abs(normalizedY - viewportTop) / viewportHeight,
      Math.abs(viewportBottom - normalizedY) / viewportHeight
    );

    // More urgent smoothing when closer to edge (to prevent escape)
    const urgencyX = distFromEdgeX < 0.1 ? 0.25 : this.ZOOM_PAN_SMOOTHING;
    const urgencyY = distFromEdgeY < 0.1 ? 0.25 : this.ZOOM_PAN_SMOOTHING;

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
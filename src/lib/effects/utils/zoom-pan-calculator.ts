/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'

export class ZoomPanCalculator {
  /**
   * Calculate cinematic pan for zoom - follows mouse directly
   * Centers viewport on mouse position with smooth interpolation
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

    // Simple approach: viewport should follow the mouse
    // The viewport center should move towards the mouse position

    // Target viewport center = mouse position (for full following)
    // But we'll soften it a bit for cinematic effect
    const followStrength = 0.7; // How much the viewport follows (0=none, 1=perfect center)

    // Blend between center (0.5) and mouse position
    const targetViewportCenterX = 0.5 + (mouseNormX - 0.5) * followStrength;
    const targetViewportCenterY = 0.5 + (mouseNormY - 0.5) * followStrength;

    // Convert viewport center to pan values
    // Pan moves content in opposite direction to viewport
    // If viewport goes right (positive), content pans left (negative)
    const targetPanX = -(targetViewportCenterX - 0.5);
    const targetPanY = -(targetViewportCenterY - 0.5);

    // Smooth interpolation for cinematic movement
    const smoothing = 0.08; // Lower = smoother, higher = more responsive
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
    return interpolateMousePosition(mouseEvents, timeMs)
  }

  /**
   * Predict where the mouse is heading shortly in the future.
   * Uses a lightweight look-ahead sample plus velocity fallback so
   * camera pans can anticipate motion without mirroring every wiggle.
   */
  predictMousePosition(
    mouseEvents: MouseEvent[] | undefined,
    timeMs: number,
    lookaheadMs: number = 180
  ): { x: number; y: number } | null {
    if (!mouseEvents || mouseEvents.length === 0) return null

    const current = this.interpolateMousePosition(mouseEvents, timeMs)
    if (!current) return null

    const futureSample = this.interpolateMousePosition(mouseEvents, timeMs + lookaheadMs)
    if (futureSample && (futureSample.x !== current.x || futureSample.y !== current.y)) {
      const anticipationBias = 0.65
      return {
        x: current.x + (futureSample.x - current.x) * anticipationBias,
        y: current.y + (futureSample.y - current.y) * anticipationBias
      }
    }

    const pastSample = this.interpolateMousePosition(mouseEvents, timeMs - lookaheadMs)
    if (pastSample) {
      const vx = current.x - pastSample.x
      const vy = current.y - pastSample.y
      return {
        x: current.x + vx,
        y: current.y + vy
      }
    }

    return current
  }
}

export const zoomPanCalculator = new ZoomPanCalculator()

/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly VIEWPORT_MARGIN = 0.15  // Keep mouse within 85% of viewport
  private readonly MAX_PAN_OFFSET = 0.4  // Maximum pan from center
  private readonly PAN_SMOOTHING = 0.25  // Smoother, more responsive panning
  
  calculatePanOffset(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): { x: number; y: number } {
    // Normalize mouse position to 0-1 range
    const normalizedX = mouseX / videoWidth
    const normalizedY = mouseY / videoHeight
    
    // Calculate the visible viewport in normalized coordinates
    // When zoomed 2x, we can see 50% of the content (1/scale)
    const viewportWidth = 1 / zoomScale
    const viewportHeight = 1 / zoomScale
    
    // Calculate the ideal viewport center to keep mouse comfortably visible
    // The viewport should follow the mouse, keeping it within a comfortable margin
    let idealCenterX = normalizedX
    let idealCenterY = normalizedY
    
    // Apply margins to keep mouse away from edges
    const marginX = viewportWidth * this.VIEWPORT_MARGIN
    const marginY = viewportHeight * this.VIEWPORT_MARGIN
    
    // Calculate current viewport center (accounting for current pan)
    const currentCenterX = 0.5 - currentPanX
    const currentCenterY = 0.5 - currentPanY
    
    // Calculate where the mouse is relative to current viewport
    const mouseInViewportX = (normalizedX - currentCenterX) / viewportWidth + 0.5
    const mouseInViewportY = (normalizedY - currentCenterY) / viewportHeight + 0.5
    
    // Calculate target pan to keep mouse visible and comfortable
    let targetPanX = currentPanX
    let targetPanY = currentPanY
    
    // If mouse is getting close to viewport edges, pan to follow it
    if (mouseInViewportX < this.VIEWPORT_MARGIN) {
      // Mouse near left edge - pan left
      const offset = (this.VIEWPORT_MARGIN - mouseInViewportX) * viewportWidth
      targetPanX = currentPanX + offset
    } else if (mouseInViewportX > 1 - this.VIEWPORT_MARGIN) {
      // Mouse near right edge - pan right
      const offset = (mouseInViewportX - (1 - this.VIEWPORT_MARGIN)) * viewportWidth
      targetPanX = currentPanX - offset
    }
    
    if (mouseInViewportY < this.VIEWPORT_MARGIN) {
      // Mouse near top edge - pan up
      const offset = (this.VIEWPORT_MARGIN - mouseInViewportY) * viewportHeight
      targetPanY = currentPanY + offset
    } else if (mouseInViewportY > 1 - this.VIEWPORT_MARGIN) {
      // Mouse near bottom edge - pan down
      const offset = (mouseInViewportY - (1 - this.VIEWPORT_MARGIN)) * viewportHeight
      targetPanY = currentPanY - offset
    }
    
    // Clamp pan to reasonable bounds
    // Don't let the viewport go too far from center
    const maxPanX = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportWidth/2)
    const maxPanY = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportHeight/2)
    
    targetPanX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX))
    targetPanY = Math.max(-maxPanY, Math.min(maxPanY, targetPanY))
    
    // Apply smoothing for cinematic motion
    const smoothedPanX = currentPanX + (targetPanX - currentPanX) * this.PAN_SMOOTHING
    const smoothedPanY = currentPanY + (targetPanY - currentPanY) * this.PAN_SMOOTHING
    
    return {
      x: smoothedPanX,
      y: smoothedPanY
    }
  }


  /**
   * Interpolate mouse position at a specific time
   */
  interpolateMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } | null {
    if (!mouseEvents || mouseEvents.length === 0) {
      return null
    }
    
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
    
    // If we only have one event or time is outside range
    if (!before) {
      return { x: mouseEvents[0].x, y: mouseEvents[0].y }
    }
    if (!after) {
      return { x: before.x, y: before.y }
    }
    
    // Linear interpolation between events
    const timeDiff = after.timestamp - before.timestamp
    if (timeDiff === 0) {
      return { x: before.x, y: before.y }
    }
    
    const t = (timeMs - before.timestamp) / timeDiff
    return {
      x: before.x + (after.x - before.x) * t,
      y: before.y + (after.y - before.y) * t
    }
  }

}

export const zoomPanCalculator = new ZoomPanCalculator()
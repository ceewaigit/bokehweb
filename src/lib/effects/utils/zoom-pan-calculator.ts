/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly EDGE_ZONE = 0.2  // Start panning when mouse is within 20% of viewport edge
  private readonly PAN_STRENGTH = 0.8  // How strongly to pan based on distance from edge
  private readonly PAN_SMOOTHING = 0.08  // Ice-like smooth gliding (lower = smoother)
  private readonly MAX_PAN_OFFSET = 0.45  // Maximum pan from center
  
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
    const viewportWidth = 1 / zoomScale
    const viewportHeight = 1 / zoomScale
    
    // Calculate current viewport bounds
    const viewportLeft = 0.5 - viewportWidth/2 - currentPanX
    const viewportRight = 0.5 + viewportWidth/2 - currentPanX
    const viewportTop = 0.5 - viewportHeight/2 - currentPanY
    const viewportBottom = 0.5 + viewportHeight/2 - currentPanY
    
    // Check if mouse is outside viewport (including when it goes off screen)
    const isOutsideLeft = normalizedX < viewportLeft
    const isOutsideRight = normalizedX > viewportRight
    const isOutsideTop = normalizedY < viewportTop
    const isOutsideBottom = normalizedY > viewportBottom
    
    // Calculate position within viewport (0 = left/top edge, 1 = right/bottom edge)
    const posInViewportX = (normalizedX - viewportLeft) / viewportWidth
    const posInViewportY = (normalizedY - viewportTop) / viewportHeight
    
    // Calculate target pan
    let targetPanX = currentPanX
    let targetPanY = currentPanY
    
    // Pan horizontally
    if (isOutsideLeft) {
      // Mouse is outside left edge - pan left to bring it into view
      targetPanX = 0.5 - viewportWidth/2 - normalizedX + viewportWidth * 0.1
    } else if (isOutsideRight) {
      // Mouse is outside right edge - pan right to bring it into view
      targetPanX = 0.5 + viewportWidth/2 - normalizedX - viewportWidth * 0.1
    } else if (posInViewportX < this.EDGE_ZONE) {
      // Mouse approaching left edge - start panning left
      const edgeDistance = this.EDGE_ZONE - posInViewportX
      const panForce = Math.pow(edgeDistance / this.EDGE_ZONE, 2) * this.PAN_STRENGTH
      targetPanX = currentPanX + panForce * viewportWidth * 0.1
    } else if (posInViewportX > 1 - this.EDGE_ZONE) {
      // Mouse approaching right edge - start panning right
      const edgeDistance = posInViewportX - (1 - this.EDGE_ZONE)
      const panForce = Math.pow(edgeDistance / this.EDGE_ZONE, 2) * this.PAN_STRENGTH
      targetPanX = currentPanX - panForce * viewportWidth * 0.1
    }
    
    // Pan vertically
    if (isOutsideTop) {
      // Mouse is outside top edge - pan up to bring it into view
      targetPanY = 0.5 - viewportHeight/2 - normalizedY + viewportHeight * 0.1
    } else if (isOutsideBottom) {
      // Mouse is outside bottom edge - pan down to bring it into view
      targetPanY = 0.5 + viewportHeight/2 - normalizedY - viewportHeight * 0.1
    } else if (posInViewportY < this.EDGE_ZONE) {
      // Mouse approaching top edge - start panning up
      const edgeDistance = this.EDGE_ZONE - posInViewportY
      const panForce = Math.pow(edgeDistance / this.EDGE_ZONE, 2) * this.PAN_STRENGTH
      targetPanY = currentPanY + panForce * viewportHeight * 0.1
    } else if (posInViewportY > 1 - this.EDGE_ZONE) {
      // Mouse approaching bottom edge - start panning down
      const edgeDistance = posInViewportY - (1 - this.EDGE_ZONE)
      const panForce = Math.pow(edgeDistance / this.EDGE_ZONE, 2) * this.PAN_STRENGTH
      targetPanY = currentPanY - panForce * viewportHeight * 0.1
    }
    
    // Clamp pan to maximum bounds
    const maxPanX = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportWidth/2)
    const maxPanY = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportHeight/2)
    
    targetPanX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX))
    targetPanY = Math.max(-maxPanY, Math.min(maxPanY, targetPanY))
    
    // Apply ice-like smooth gliding with low smoothing factor
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
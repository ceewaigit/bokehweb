/**
 * Zoom Pan Calculator
 * Handles dynamic camera panning during zoom based on mouse position
 * Implements Screen Studio-like intelligent following behavior
 */

import type { MouseEvent } from '@/types/project'

interface PanOffset {
  x: number  // Normalized offset (-1 to 1)
  y: number  // Normalized offset (-1 to 1)
}


export class ZoomPanCalculator {
  // Edge trigger zone - when mouse gets within this distance of viewport edge, start panning
  private readonly EDGE_TRIGGER_RATIO = 0.25  // Pan when mouse is within 25% of edge
  
  // Maximum pan speed
  private readonly MAX_PAN_SPEED = 0.02  // Max pan per frame
  
  // Smoothing factor for pan transitions
  private readonly PAN_SMOOTHING = 0.15  // Smooth, cinematic panning
  
  /**
   * Calculate pan offset based on mouse position during zoom
   * Returns normalized pan values that should be applied to the zoom transform
   */
  calculatePanOffset(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): PanOffset {
    // Normalize mouse position to 0-1 range
    const normalizedX = mouseX / videoWidth
    const normalizedY = mouseY / videoHeight
    
    // Calculate the visible viewport in normalized coordinates
    // When zoomed 2x, we can see 50% of the content (1/scale)
    const viewportWidth = 1 / zoomScale
    const viewportHeight = 1 / zoomScale
    
    // Calculate current viewport bounds based on current pan
    // Pan of 0,0 means centered at 0.5,0.5
    const viewportLeft = 0.5 - viewportWidth/2 - currentPanX
    const viewportRight = 0.5 + viewportWidth/2 - currentPanX
    const viewportTop = 0.5 - viewportHeight/2 - currentPanY
    const viewportBottom = 0.5 + viewportHeight/2 - currentPanY
    
    // Calculate how close the mouse is to each edge of the viewport
    const distToLeft = normalizedX - viewportLeft
    const distToRight = viewportRight - normalizedX
    const distToTop = normalizedY - viewportTop
    const distToBottom = viewportBottom - normalizedY
    
    // Calculate edge trigger threshold
    const edgeTriggerX = viewportWidth * this.EDGE_TRIGGER_RATIO
    const edgeTriggerY = viewportHeight * this.EDGE_TRIGGER_RATIO
    
    // Calculate target pan based on edge proximity
    let targetPanX = currentPanX
    let targetPanY = currentPanY
    
    // Pan horizontally if near edges
    if (distToLeft < edgeTriggerX && normalizedX < 0.5) {
      // Near left edge, pan left
      const edgeStrength = 1 - (distToLeft / edgeTriggerX)
      targetPanX = currentPanX + (edgeStrength * this.MAX_PAN_SPEED)
      // Clamp to prevent over-panning
      targetPanX = Math.min(targetPanX, 0.5 - viewportWidth/2)
    } else if (distToRight < edgeTriggerX && normalizedX > 0.5) {
      // Near right edge, pan right  
      const edgeStrength = 1 - (distToRight / edgeTriggerX)
      targetPanX = currentPanX - (edgeStrength * this.MAX_PAN_SPEED)
      // Clamp to prevent over-panning
      targetPanX = Math.max(targetPanX, -(0.5 - viewportWidth/2))
    }
    
    // Pan vertically if near edges
    if (distToTop < edgeTriggerY && normalizedY < 0.5) {
      // Near top edge, pan up
      const edgeStrength = 1 - (distToTop / edgeTriggerY)
      targetPanY = currentPanY + (edgeStrength * this.MAX_PAN_SPEED)
      targetPanY = Math.min(targetPanY, 0.5 - viewportHeight/2)
    } else if (distToBottom < edgeTriggerY && normalizedY > 0.5) {
      // Near bottom edge, pan down
      const edgeStrength = 1 - (distToBottom / edgeTriggerY)
      targetPanY = currentPanY - (edgeStrength * this.MAX_PAN_SPEED)
      targetPanY = Math.max(targetPanY, -(0.5 - viewportHeight/2))
    }
    
    // Apply smoothing for cinematic motion
    const smoothedPanX = currentPanX + (targetPanX - currentPanX) * this.PAN_SMOOTHING
    const smoothedPanY = currentPanY + (targetPanY - currentPanY) * this.PAN_SMOOTHING
    
    console.log('[PanCalculator] Edge-based pan:', {
      mouseNorm: { x: normalizedX, y: normalizedY },
      viewport: { left: viewportLeft, right: viewportRight, top: viewportTop, bottom: viewportBottom },
      edgeDist: { left: distToLeft, right: distToRight, top: distToTop, bottom: distToBottom },
      targetPan: { x: targetPanX, y: targetPanY },
      smoothedPan: { x: smoothedPanX, y: smoothedPanY }
    })
    
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
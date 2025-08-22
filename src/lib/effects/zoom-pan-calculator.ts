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
  // Dead zone where no panning occurs (center of screen)
  private readonly DEAD_ZONE_RATIO = 0.05  // 5% of screen dimensions - very small for immediate response
  
  // Maximum pan distance as ratio of zoomed area
  private readonly MAX_PAN_RATIO = 1.0  // Allow full screen panning to follow mouse anywhere
  
  // Smoothing factor for pan transitions
  private readonly PAN_SMOOTHING = 0.35  // Much faster response for immediate following
  
  // Edge resistance factor
  private readonly EDGE_RESISTANCE = 0.8  // Less resistance at edges

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
    
    // Calculate distance from center (0.5, 0.5)
    // This is how far we need to pan to center the mouse
    const centerDistX = normalizedX - 0.5
    const centerDistY = normalizedY - 0.5
    
    console.log('[PanCalculator] Input:', {
      mousePos: { x: mouseX, y: mouseY },
      videoDimensions: { width: videoWidth, height: videoHeight },
      normalized: { x: normalizedX, y: normalizedY },
      centerDist: { x: centerDistX, y: centerDistY },
      zoomScale,
      currentPan: { x: currentPanX, y: currentPanY }
    })
    
    // Direct pan calculation - follow mouse more aggressively
    // The pan should move the view to keep mouse near center
    let targetPanX = centerDistX * 0.8  // Pan 80% of the way to center the mouse
    let targetPanY = centerDistY * 0.8
    
    // Apply small dead zone only for very small movements
    const deadZone = 0.02  // 2% dead zone
    if (Math.abs(centerDistX) < deadZone) {
      targetPanX = 0
    }
    if (Math.abs(centerDistY) < deadZone) {
      targetPanY = 0
    }
    
    // Smooth transitions but with higher responsiveness
    const smoothedPanX = currentPanX + (targetPanX - currentPanX) * 0.4
    const smoothedPanY = currentPanY + (targetPanY - currentPanY) * 0.4
    
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

  private applyEdgeResistance(panValue: number, normalizedPos: number): number {
    // Apply resistance when approaching edges
    const edgeDistance = Math.min(normalizedPos, 1 - normalizedPos)
    const resistanceFactor = edgeDistance < 0.1 
      ? this.EDGE_RESISTANCE * (edgeDistance / 0.1)
      : 1
    
    return panValue * resistanceFactor
  }

  private smoothTransition(current: number, target: number): number {
    // Exponential smoothing for natural movement
    return current + (target - current) * this.PAN_SMOOTHING
  }
}

export const zoomPanCalculator = new ZoomPanCalculator()
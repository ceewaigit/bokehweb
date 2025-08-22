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
  private readonly DEAD_ZONE_RATIO = 0.3  // 30% of screen dimensions
  
  // Maximum pan distance as ratio of zoomed area
  private readonly MAX_PAN_RATIO = 0.35
  
  // Smoothing factor for pan transitions
  private readonly PAN_SMOOTHING = 0.15
  
  // Edge resistance factor
  private readonly EDGE_RESISTANCE = 0.7

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
    
    // Apply dead zone
    const deadZoneX = this.DEAD_ZONE_RATIO / 2
    const deadZoneY = this.DEAD_ZONE_RATIO / 2
    
    let targetPanX = 0
    let targetPanY = 0
    
    // Calculate horizontal pan
    if (Math.abs(centerDistX) > deadZoneX) {
      const beyondDeadZone = centerDistX > 0 
        ? centerDistX - deadZoneX 
        : centerDistX + deadZoneX
      
      // Scale pan amount based on zoom level
      const maxPanX = this.MAX_PAN_RATIO * (zoomScale - 1) / zoomScale
      targetPanX = beyondDeadZone * maxPanX / (0.5 - deadZoneX)
      
      // Apply edge resistance
      targetPanX = this.applyEdgeResistance(targetPanX, normalizedX)
    }
    
    // Calculate vertical pan
    if (Math.abs(centerDistY) > deadZoneY) {
      const beyondDeadZone = centerDistY > 0 
        ? centerDistY - deadZoneY 
        : centerDistY + deadZoneY
      
      // Scale pan amount based on zoom level
      const maxPanY = this.MAX_PAN_RATIO * (zoomScale - 1) / zoomScale
      targetPanY = beyondDeadZone * maxPanY / (0.5 - deadZoneY)
      
      // Apply edge resistance
      targetPanY = this.applyEdgeResistance(targetPanY, normalizedY)
    }
    
    // Smooth transitions
    const smoothedPanX = this.smoothTransition(currentPanX, targetPanX)
    const smoothedPanY = this.smoothTransition(currentPanY, targetPanY)
    
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
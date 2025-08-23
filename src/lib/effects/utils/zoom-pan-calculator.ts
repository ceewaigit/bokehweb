/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly EDGE_ZONE = 0.25  // Start panning when mouse is within 25% of viewport edge
  private readonly PAN_STRENGTH = 0.5  // How strongly to pan based on distance from edge
  private readonly VELOCITY_DAMPING = 0.94  // Ice-like momentum (higher = more glide)
  private readonly ACCELERATION = 0.0015  // How quickly velocity builds up
  private readonly MAX_PAN_OFFSET = 0.45  // Maximum pan from center
  
  // New method that properly tracks velocity
  calculatePanOffsetWithVelocity(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0,
    currentVelocityX: number = 0,
    currentVelocityY: number = 0
  ): { x: number; y: number; velocityX: number; velocityY: number } {
    // Normalize mouse position to 0-1 range
    // Don't clamp - we want to track mouse even when it goes off-screen
    const normalizedX = mouseX / videoWidth
    const normalizedY = mouseY / videoHeight
    
    // Calculate the visible viewport in normalized coordinates
    const viewportWidth = 1 / zoomScale
    const viewportHeight = 1 / zoomScale
    
    // Calculate current viewport bounds
    const viewportCenterX = 0.5 - currentPanX
    const viewportCenterY = 0.5 - currentPanY
    const viewportLeft = viewportCenterX - viewportWidth/2
    const viewportRight = viewportCenterX + viewportWidth/2
    const viewportTop = viewportCenterY - viewportHeight/2
    const viewportBottom = viewportCenterY + viewportHeight/2
    
    // Calculate mouse position relative to viewport center
    const mouseRelX = normalizedX - viewportCenterX
    const mouseRelY = normalizedY - viewportCenterY
    
    // Calculate desired acceleration based on mouse position
    let accelX = 0
    let accelY = 0
    
    // Calculate position within viewport (-0.5 to 0.5 from center)
    const posInViewportX = (normalizedX - viewportLeft) / viewportWidth
    const posInViewportY = (normalizedY - viewportTop) / viewportHeight
    
    // Apply acceleration when mouse is near edges or outside viewport
    if (posInViewportX < 0) {
      // Mouse is outside left edge
      accelX = -this.ACCELERATION * 3
    } else if (posInViewportX > 1) {
      // Mouse is outside right edge
      accelX = this.ACCELERATION * 3
    } else if (posInViewportX < this.EDGE_ZONE) {
      // Mouse approaching left edge
      const edgeForce = (this.EDGE_ZONE - posInViewportX) / this.EDGE_ZONE
      accelX = -this.ACCELERATION * edgeForce * this.PAN_STRENGTH
    } else if (posInViewportX > 1 - this.EDGE_ZONE) {
      // Mouse approaching right edge
      const edgeForce = (posInViewportX - (1 - this.EDGE_ZONE)) / this.EDGE_ZONE
      accelX = this.ACCELERATION * edgeForce * this.PAN_STRENGTH
    }
    
    if (posInViewportY < 0) {
      // Mouse is outside top edge
      accelY = -this.ACCELERATION * 3
    } else if (posInViewportY > 1) {
      // Mouse is outside bottom edge
      accelY = this.ACCELERATION * 3
    } else if (posInViewportY < this.EDGE_ZONE) {
      // Mouse approaching top edge
      const edgeForce = (this.EDGE_ZONE - posInViewportY) / this.EDGE_ZONE
      accelY = -this.ACCELERATION * edgeForce * this.PAN_STRENGTH
    } else if (posInViewportY > 1 - this.EDGE_ZONE) {
      // Mouse approaching bottom edge
      const edgeForce = (posInViewportY - (1 - this.EDGE_ZONE)) / this.EDGE_ZONE
      accelY = this.ACCELERATION * edgeForce * this.PAN_STRENGTH
    }
    
    // Update velocity with acceleration
    let velocityX = currentVelocityX + accelX
    let velocityY = currentVelocityY + accelY
    
    // Apply damping for ice-like gliding
    velocityX *= this.VELOCITY_DAMPING
    velocityY *= this.VELOCITY_DAMPING
    
    // Update pan position with velocity
    let newPanX = currentPanX + velocityX
    let newPanY = currentPanY + velocityY
    
    // Clamp pan to maximum bounds
    const maxPanX = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportWidth/2)
    const maxPanY = Math.min(this.MAX_PAN_OFFSET, 0.5 - viewportHeight/2)
    
    // Apply soft boundaries with velocity reduction at edges
    if (Math.abs(newPanX) > maxPanX) {
      newPanX = Math.sign(newPanX) * maxPanX
      velocityX *= 0.5 // Reduce velocity when hitting boundary
    }
    if (Math.abs(newPanY) > maxPanY) {
      newPanY = Math.sign(newPanY) * maxPanY
      velocityY *= 0.5 // Reduce velocity when hitting boundary
    }
    
    return {
      x: newPanX,
      y: newPanY,
      velocityX,
      velocityY
    }
  }

  // Legacy method for backward compatibility
  calculatePanOffset(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): { x: number; y: number } {
    const result = this.calculatePanOffsetWithVelocity(
      mouseX, mouseY, videoWidth, videoHeight, zoomScale,
      currentPanX, currentPanY, 0, 0
    );
    return { x: result.x, y: result.y };
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
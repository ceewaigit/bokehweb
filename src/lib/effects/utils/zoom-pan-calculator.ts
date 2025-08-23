/**
 * Zoom Pan Calculator
 * Handles edge-based camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'

export class ZoomPanCalculator {
  private readonly EDGE_ZONE = 0.3  // Start panning when mouse is within 30% of viewport edge
  private readonly CENTER_ZONE = 0.2  // Dead zone in center where no panning occurs
  private readonly PAN_STRENGTH = 0.8  // How strongly to pan based on distance from edge
  private readonly VELOCITY_DAMPING = 0.98  // Ultra smooth ice-like momentum (like butter)
  private readonly ACCELERATION = 0.0008  // Gentle acceleration for smooth movement
  private readonly MAX_PAN_OFFSET = 0.45  // Maximum pan from center
  private readonly LOOK_AHEAD = 0.12  // How much to pan ahead of mouse direction
  private readonly VELOCITY_SMOOTHING = 0.7  // Smooth out velocity changes
  
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
    
    // Calculate position within viewport (0 to 1, where 0.5 is center)
    const posInViewportX = (normalizedX - viewportLeft) / viewportWidth
    const posInViewportY = (normalizedY - viewportTop) / viewportHeight
    
    // Calculate distance from viewport center (0 = center, 0.5 = edge)
    const distFromCenterX = Math.abs(posInViewportX - 0.5)
    const distFromCenterY = Math.abs(posInViewportY - 0.5)
    
    // Apply acceleration to proactively show area of interest
    if (posInViewportX < -0.1 || posInViewportX > 1.1) {
      // Mouse is way outside viewport - strong pull
      accelX = posInViewportX < 0.5 ? 
        this.ACCELERATION * 4 : -this.ACCELERATION * 4
    } else if (posInViewportX < 0 || posInViewportX > 1) {
      // Mouse is outside viewport - medium pull
      accelX = posInViewportX < 0.5 ? 
        this.ACCELERATION * 2.5 : -this.ACCELERATION * 2.5
    } else if (distFromCenterX > this.CENTER_ZONE) {
      // Mouse is outside center dead zone - calculate pan force
      const edgeProximity = (distFromCenterX - this.CENTER_ZONE) / (0.5 - this.CENTER_ZONE)
      
      // Proactive panning: pan to show more area in the direction of mouse
      if (posInViewportX < 0.5) {
        // Mouse on left side - pan left to show more left area
        const targetViewportX = 0.3 - (edgeProximity * this.LOOK_AHEAD)
        const offset = targetViewportX - posInViewportX
        accelX = offset * this.ACCELERATION * this.PAN_STRENGTH
      } else {
        // Mouse on right side - pan right to show more right area
        const targetViewportX = 0.7 + (edgeProximity * this.LOOK_AHEAD)
        const offset = targetViewportX - posInViewportX
        accelX = offset * this.ACCELERATION * this.PAN_STRENGTH
      }
    }
    
    // Same for vertical
    if (posInViewportY < -0.1 || posInViewportY > 1.1) {
      // Mouse is way outside viewport - strong pull
      accelY = posInViewportY < 0.5 ? 
        this.ACCELERATION * 4 : -this.ACCELERATION * 4
    } else if (posInViewportY < 0 || posInViewportY > 1) {
      // Mouse is outside viewport - medium pull
      accelY = posInViewportY < 0.5 ? 
        this.ACCELERATION * 2.5 : -this.ACCELERATION * 2.5
    } else if (distFromCenterY > this.CENTER_ZONE) {
      // Mouse is outside center dead zone - calculate pan force
      const edgeProximity = (distFromCenterY - this.CENTER_ZONE) / (0.5 - this.CENTER_ZONE)
      
      // Proactive panning: pan to show more area in the direction of mouse
      if (posInViewportY < 0.5) {
        // Mouse on top side - pan up to show more top area
        const targetViewportY = 0.3 - (edgeProximity * this.LOOK_AHEAD)
        const offset = targetViewportY - posInViewportY
        accelY = offset * this.ACCELERATION * this.PAN_STRENGTH
      } else {
        // Mouse on bottom side - pan down to show more bottom area
        const targetViewportY = 0.7 + (edgeProximity * this.LOOK_AHEAD)
        const offset = targetViewportY - posInViewportY
        accelY = offset * this.ACCELERATION * this.PAN_STRENGTH
      }
    }
    
    // Smooth velocity changes to prevent jerkiness
    const targetVelocityX = currentVelocityX + accelX
    const targetVelocityY = currentVelocityY + accelY
    
    // Apply velocity smoothing for butter-smooth movement
    let velocityX = currentVelocityX + (targetVelocityX - currentVelocityX) * this.VELOCITY_SMOOTHING
    let velocityY = currentVelocityY + (targetVelocityY - currentVelocityY) * this.VELOCITY_SMOOTHING
    
    // Apply damping for ice-like gliding
    velocityX *= this.VELOCITY_DAMPING
    velocityY *= this.VELOCITY_DAMPING
    
    // Clamp very small velocities to zero to prevent drift
    if (Math.abs(velocityX) < 0.0001) velocityX = 0
    if (Math.abs(velocityY) < 0.0001) velocityY = 0
    
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
    
    // Need at least 4 points for smooth cubic interpolation
    if (mouseEvents.length < 4) {
      // Fallback to simple interpolation for few points
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
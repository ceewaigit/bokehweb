/**
 * Cursor effect calculator
 * Pure functions for calculating cursor position, visibility, and effects
 * Used by both Remotion preview and export engines
 */

import type { CursorEffectData, MouseEvent, ClickEvent } from '@/types/project'
import { CursorStyle } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import { CursorType, electronToCustomCursor } from '../cursor-types'

export interface CursorState {
  visible: boolean
  x: number
  y: number
  type: CursorType
  scale: number
  opacity: number
  clickEffects: ClickEffect[]
  motionBlur?: {
    previousX: number
    previousY: number
    velocity: number
  }
}

export interface ClickEffect {
  x: number
  y: number
  timestamp: number
  progress: number // 0 to 1
  radius: number
  opacity: number
}

/**
 * Calculate cursor state at a given timestamp
 */
export function calculateCursorState(
  cursorData: CursorEffectData | undefined,
  mouseEvents: MouseEvent[],
  clickEvents: ClickEvent[],
  timestamp: number,
  previousState?: CursorState
): CursorState {
  // Default state
  if (!cursorData || !mouseEvents || mouseEvents.length === 0) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: 1,
      opacity: 0,
      clickEffects: []
    }
  }

  // Get interpolated mouse position
  const position = interpolateMousePosition(mouseEvents, timestamp)
  if (!position) {
    return {
      visible: false,
      x: 0,
      y: 0,
      type: CursorType.ARROW,
      scale: cursorData.size || 1,
      opacity: 0,
      clickEffects: []
    }
  }

  // Determine cursor type
  const currentEvent = mouseEvents.find(e => e.timestamp <= timestamp) || mouseEvents[0]
  const cursorType = electronToCustomCursor(currentEvent?.cursorType || 'default')

  // Calculate visibility based on idle timeout
  let visible = true
  let opacity = 1

  if (cursorData.hideOnIdle) {
    const lastMovement = findLastMovement(mouseEvents, timestamp)
    if (lastMovement) {
      const idleTime = timestamp - lastMovement.timestamp
      if (idleTime > cursorData.idleTimeout) {
        visible = false
        opacity = 0
      } else if (idleTime > cursorData.idleTimeout - 300) {
        // Fade out in the last 300ms
        opacity = Math.max(0, 1 - (idleTime - (cursorData.idleTimeout - 300)) / 300)
      }
    }
  }

  // Calculate motion blur if enabled
  let motionBlur: CursorState['motionBlur'] = undefined
  if (cursorData.motionBlur && previousState) {
    const dx = position.x - previousState.x
    const dy = position.y - previousState.y
    const velocity = Math.sqrt(dx * dx + dy * dy)
    
    if (velocity > 2) { // Only show blur for significant movement
      motionBlur = {
        previousX: previousState.x,
        previousY: previousState.y,
        velocity: Math.min(velocity, 50) // Cap velocity for reasonable blur
      }
    }
  }

  // Calculate click effects
  const activeClickEffects = cursorData.clickEffects
    ? calculateClickEffects(clickEvents, timestamp)
    : []

  return {
    visible,
    x: position.x,
    y: position.y,
    type: cursorType,
    scale: cursorData.size || 1,
    opacity,
    clickEffects: activeClickEffects,
    motionBlur
  }
}

/**
 * Find the last mouse movement before a timestamp
 */
function findLastMovement(
  mouseEvents: MouseEvent[],
  timestamp: number
): MouseEvent | null {
  // Find events before timestamp
  const pastEvents = mouseEvents.filter(e => e.timestamp <= timestamp)
  if (pastEvents.length === 0) return null

  // Sort by timestamp descending
  pastEvents.sort((a, b) => b.timestamp - a.timestamp)

  // Find last actual movement (position change)
  for (let i = 0; i < pastEvents.length - 1; i++) {
    const current = pastEvents[i]
    const previous = pastEvents[i + 1]
    
    if (current.x !== previous.x || current.y !== previous.y) {
      return current
    }
  }

  return pastEvents[0]
}

/**
 * Calculate active click effects
 */
function calculateClickEffects(
  clickEvents: ClickEvent[],
  timestamp: number
): ClickEffect[] {
  const EFFECT_DURATION = 500 // ms
  const MAX_RADIUS = 50

  return clickEvents
    .filter(click => {
      const age = timestamp - click.timestamp
      return age >= 0 && age < EFFECT_DURATION
    })
    .map(click => {
      const age = timestamp - click.timestamp
      const progress = age / EFFECT_DURATION
      
      // Easing for smooth animation
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      
      return {
        x: click.x,
        y: click.y,
        timestamp: click.timestamp,
        progress,
        radius: 10 + easedProgress * MAX_RADIUS,
        opacity: Math.max(0, 1 - progress) * 0.5
      }
    })
}

/**
 * Get cursor drawing properties for canvas rendering
 */
export function getCursorDrawingProps(
  state: CursorState,
  style: CursorStyle
): {
  shape: 'arrow' | 'circle' | 'cross' | 'hand'
  color: string
  size: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
} {
  const baseSize = 12 * state.scale
  
  // Determine shape based on style and type
  let shape: 'arrow' | 'circle' | 'cross' | 'hand' = 'arrow'
  if (style === CursorStyle.Custom) {
    shape = 'circle'
  } else if (state.type === CursorType.POINTING_HAND || state.type === CursorType.OPEN_HAND) {
    shape = 'hand'
  } else if (state.type === CursorType.CROSSHAIR) {
    shape = 'cross'
  }

  // Colors based on style
  const color = style === CursorStyle.Custom ? '#ffffff' : '#ffffff'
  
  return {
    shape,
    color,
    size: baseSize,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowBlur: 4 * state.scale,
    shadowOffsetX: 1 * state.scale,
    shadowOffsetY: 2 * state.scale
  }
}

/**
 * Calculate cursor path for canvas drawing
 */
export function getCursorPath(
  x: number,
  y: number,
  type: CursorType,
  scale: number
): Path2D {
  const path = new Path2D()
  
  switch (type) {
    case CursorType.ARROW:
    default:
      // macOS-style arrow cursor
      path.moveTo(x, y)
      path.lineTo(x + 12 * scale, y + 12 * scale)
      path.lineTo(x + 5 * scale, y + 12 * scale)
      path.lineTo(x + 7 * scale, y + 17 * scale)
      path.lineTo(x + 4 * scale, y + 18 * scale)
      path.lineTo(x + 2 * scale, y + 13 * scale)
      path.lineTo(x, y + 15 * scale)
      path.closePath()
      break
      
    case CursorType.POINTING_HAND:
    case CursorType.OPEN_HAND:
      // Hand/pointer cursor
      path.moveTo(x + 5 * scale, y)
      path.lineTo(x + 5 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 8 * scale)
      path.lineTo(x + 2 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 12 * scale)
      path.lineTo(x + 8 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 8 * scale)
      path.lineTo(x + 10 * scale, y + 14 * scale)
      path.lineTo(x, y + 14 * scale)
      path.lineTo(x, y + 6 * scale)
      path.closePath()
      break
      
    case CursorType.CROSSHAIR:
      // Crosshair cursor
      const size = 10 * scale
      path.moveTo(x - size, y)
      path.lineTo(x + size, y)
      path.moveTo(x, y - size)
      path.lineTo(x, y + size)
      break
  }
  
  return path
}

/**
 * Calculate motion blur trail points
 */
export function getMotionBlurTrail(
  currentX: number,
  currentY: number,
  previousX: number,
  previousY: number,
  velocity: number
): Array<{ x: number; y: number; opacity: number }> {
  const trail: Array<{ x: number; y: number; opacity: number }> = []
  
  // Number of trail points based on velocity
  const trailCount = Math.min(5, Math.floor(velocity / 10))
  
  for (let i = 1; i <= trailCount; i++) {
    const t = i / (trailCount + 1)
    trail.push({
      x: previousX + (currentX - previousX) * t,
      y: previousY + (currentY - previousY) * t,
      opacity: (1 - t) * 0.3
    })
  }
  
  return trail
}
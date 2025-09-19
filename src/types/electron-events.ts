/**
 * Type definitions for Electron IPC event data
 */

export interface MouseMoveEventData {
  x: number
  y: number
  velocity?: number
  cursorType?: string
  logicalX?: number
  logicalY?: number
}

export interface MouseClickEventData {
  x: number
  y: number
  button: string
  cursorType?: string
  logicalX?: number
  logicalY?: number
}

export interface KeyboardEventData {
  key: string
  type: 'keydown' | 'keyup'
  modifiers?: string[]
}

export interface ScrollEventData {
  deltaX: number
  deltaY: number
}

export interface DisplayInfo {
  id: string
  name: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  scaleFactor: number
}

export interface DesktopSource {
  id: string
  name: string
  thumbnail: string
  display_id?: string
  appIcon?: string
}
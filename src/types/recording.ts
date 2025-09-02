/**
 * Recording-related type definitions
 */

export interface ElectronMetadata {
  timestamp: number
  mouseX?: number  // Optional for keyboard events, in physical pixels
  mouseY?: number  // Optional for keyboard events, in physical pixels
  eventType: 'mouse' | 'click' | 'keypress' | 'scroll'
  key?: string
  modifiers?: string[]
  keyEventType?: 'keydown' | 'keyup'
  velocity?: { x: number; y: number }
  scrollDelta?: { x: number; y: number }
  captureWidth?: number  // Physical pixels
  captureHeight?: number // Physical pixels
  scaleFactor?: number
  cursorType?: string
  sourceBounds?: { x: number; y: number; width: number; height: number }
  sourceType?: 'screen' | 'window' | 'area'
  // Debugging fields - logical coordinates before scaling
  logicalX?: number
  logicalY?: number
}

export interface ElectronRecordingResult {
  video: Blob
  duration: number
  metadata: ElectronMetadata[]
  hasAudio?: boolean
  captureArea?: {
    fullBounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    sourceType?: 'screen' | 'window'
    sourceId?: string
  }
}

export interface RecordingSource {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnail?: string
  bounds?: { x: number; y: number; width: number; height: number }
}
/**
 * Recording-related type definitions
 */

export interface ElectronMetadata {
  timestamp: number
  mouseX?: number  // Optional for keyboard events
  mouseY?: number  // Optional for keyboard events
  eventType: 'mouse' | 'click' | 'keypress' | 'scroll'
  key?: string
  modifiers?: string[]
  keyEventType?: 'keydown' | 'keyup'
  velocity?: { x: number; y: number }
  scrollDelta?: { x: number; y: number }
  captureWidth?: number
  captureHeight?: number
  scaleFactor?: number
  cursorType?: string
  sourceBounds?: { x: number; y: number; width: number; height: number }
  sourceType?: 'screen' | 'window' | 'area'
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
/**
 * Cursor type definitions and mappings for custom cursor rendering
 */

export enum CursorType {
  ARROW = 'arrow',
  IBEAM = 'iBeam',
  POINTING_HAND = 'pointingHand',
  CLOSED_HAND = 'closedHand',
  OPEN_HAND = 'openHand',
  CROSSHAIR = 'crosshair',
  RESIZE_LEFT = 'resizeLeft',
  RESIZE_RIGHT = 'resizeRight',
  RESIZE_UP = 'resizeUp',
  RESIZE_DOWN = 'resizeDown',
  RESIZE_LEFT_RIGHT = 'resizeLeftRight',
  RESIZE_UP_DOWN = 'resizeUpDown',
  CONTEXTUAL_MENU = 'contextualMenu',
  DISAPPEARING_ITEM = 'disappearingItem',
  DRAG_COPY = 'dragCopy',
  DRAG_LINK = 'dragLink',
  OPERATION_NOT_ALLOWED = 'operationNotAllowed',
  IBEAM_VERTICAL = 'iBeamCursorForVerticalLayout'
}

/**
 * Map Electron cursor types to our custom cursor types
 */
export const ELECTRON_TO_CUSTOM_CURSOR: Record<string, CursorType> = {
  'default': CursorType.ARROW,
  'pointer': CursorType.POINTING_HAND,
  'text': CursorType.IBEAM,
  'vertical-text': CursorType.IBEAM_VERTICAL,
  'crosshair': CursorType.CROSSHAIR,
  'move': CursorType.OPEN_HAND,
  'grabbing': CursorType.CLOSED_HAND,
  'grab': CursorType.OPEN_HAND,
  'not-allowed': CursorType.OPERATION_NOT_ALLOWED,
  'context-menu': CursorType.CONTEXTUAL_MENU,
  'copy': CursorType.DRAG_COPY,
  'alias': CursorType.DRAG_LINK,
  'e-resize': CursorType.RESIZE_RIGHT,
  'w-resize': CursorType.RESIZE_LEFT,
  'n-resize': CursorType.RESIZE_UP,
  's-resize': CursorType.RESIZE_DOWN,
  'ew-resize': CursorType.RESIZE_LEFT_RIGHT,
  'ns-resize': CursorType.RESIZE_UP_DOWN,
  'ne-resize': CursorType.RESIZE_RIGHT,
  'nw-resize': CursorType.RESIZE_LEFT,
  'se-resize': CursorType.RESIZE_RIGHT,
  'sw-resize': CursorType.RESIZE_LEFT,
  'nesw-resize': CursorType.RESIZE_LEFT_RIGHT,
  'nwse-resize': CursorType.RESIZE_LEFT_RIGHT,
  'col-resize': CursorType.RESIZE_LEFT_RIGHT,
  'row-resize': CursorType.RESIZE_UP_DOWN,
  'all-scroll': CursorType.OPEN_HAND,
  'zoom-in': CursorType.CROSSHAIR,
  'zoom-out': CursorType.CROSSHAIR
}

/**
 * Cursor hotspot configurations (where the "click point" is)
 * Coordinates are relative to the cursor image dimensions
 */
export interface CursorHotspot {
  x: number
  y: number
}

/**
 * Define hotspots for each cursor type
 * Based on standard macOS cursor hotspots, adjusted for high-resolution images
 * Arrow cursor is 170x230, approximately 5x scale
 * Other cursors vary in size but most are around 2x-3x scale
 */
export const CURSOR_HOTSPOTS: Record<CursorType, CursorHotspot> = {
  [CursorType.ARROW]: { x: 20, y: 20 }, // 5x scale from original 4,4
  [CursorType.IBEAM]: { x: 45, y: 90 }, // Center of I-beam (90x180 image)
  [CursorType.POINTING_HAND]: { x: 18, y: 12 }, // Finger tip (64x64 image, ~3x scale)
  [CursorType.CLOSED_HAND]: { x: 32, y: 32 }, // Center of fist (64x64 image)
  [CursorType.OPEN_HAND]: { x: 32, y: 32 }, // Center of palm (64x64 image)
  [CursorType.CROSSHAIR]: { x: 24, y: 24 }, // Center intersection (48x48 image)
  [CursorType.RESIZE_LEFT]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.RESIZE_RIGHT]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.RESIZE_UP]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.RESIZE_DOWN]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.RESIZE_LEFT_RIGHT]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.RESIZE_UP_DOWN]: { x: 24, y: 24 }, // Center (48x48 image)
  [CursorType.CONTEXTUAL_MENU]: { x: 14, y: 14 }, // Arrow tip (56x80 image, ~2x scale)
  [CursorType.DISAPPEARING_ITEM]: { x: 28, y: 40 }, // Center (56x80 image)
  [CursorType.DRAG_COPY]: { x: 14, y: 14 }, // Arrow tip (56x80 image)
  [CursorType.DRAG_LINK]: { x: 8, y: 8 }, // Arrow tip (32x42 image, ~1.5x scale)
  [CursorType.OPERATION_NOT_ALLOWED]: { x: 28, y: 40 }, // Center (56x80 image)
  [CursorType.IBEAM_VERTICAL]: { x: 18, y: 16 } // Center (36x32 image)
}

/**
 * Get cursor image path for a given cursor type
 */
export function getCursorImagePath(cursorType: CursorType): string {
  // In production (Electron), files are served from the webpack output root
  // In development (Next.js), files are served from public folder
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    // Electron production build - cursors are copied to root/cursors
    return `cursors/${cursorType}.png`
  }
  // Development or web build
  return `/cursors/${cursorType}.png`
}

/**
 * Convert Electron cursor type to custom cursor type
 */
export function electronToCustomCursor(electronType: string): CursorType {
  return ELECTRON_TO_CUSTOM_CURSOR[electronType] || CursorType.ARROW
}
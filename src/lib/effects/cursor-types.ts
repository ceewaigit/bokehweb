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
 * Based on standard macOS cursor hotspots
 */
export const CURSOR_HOTSPOTS: Record<CursorType, CursorHotspot> = {
  [CursorType.ARROW]: { x: 4, y: 4 },
  [CursorType.IBEAM]: { x: 12, y: 12 }, // Center of I-beam
  [CursorType.POINTING_HAND]: { x: 6, y: 4 }, // Finger tip
  [CursorType.CLOSED_HAND]: { x: 12, y: 12 }, // Center of fist
  [CursorType.OPEN_HAND]: { x: 12, y: 12 }, // Center of palm
  [CursorType.CROSSHAIR]: { x: 12, y: 12 }, // Center intersection
  [CursorType.RESIZE_LEFT]: { x: 12, y: 12 }, // Center
  [CursorType.RESIZE_RIGHT]: { x: 12, y: 12 }, // Center
  [CursorType.RESIZE_UP]: { x: 12, y: 12 }, // Center
  [CursorType.RESIZE_DOWN]: { x: 12, y: 12 }, // Center
  [CursorType.RESIZE_LEFT_RIGHT]: { x: 12, y: 12 }, // Center
  [CursorType.RESIZE_UP_DOWN]: { x: 12, y: 12 }, // Center
  [CursorType.CONTEXTUAL_MENU]: { x: 4, y: 4 }, // Arrow tip
  [CursorType.DISAPPEARING_ITEM]: { x: 12, y: 12 }, // Center
  [CursorType.DRAG_COPY]: { x: 4, y: 4 }, // Arrow tip
  [CursorType.DRAG_LINK]: { x: 4, y: 4 }, // Arrow tip
  [CursorType.OPERATION_NOT_ALLOWED]: { x: 12, y: 12 }, // Center
  [CursorType.IBEAM_VERTICAL]: { x: 12, y: 12 } // Center
}

/**
 * Get cursor image path for a given cursor type
 */
export function getCursorImagePath(cursorType: CursorType): string {
  return `/cursors/${cursorType}.png`
}

/**
 * Convert Electron cursor type to custom cursor type
 */
export function electronToCustomCursor(electronType: string): CursorType {
  return ELECTRON_TO_CUSTOM_CURSOR[electronType] || CursorType.ARROW
}
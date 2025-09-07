/**
 * Shared constants for all tracking modules
 */

// Timing constants (in milliseconds)
export const TIMING = {
  // Mouse tracking
  MIN_MOUSE_INTERVAL: 8,
  MAX_MOUSE_INTERVAL: 1000,
  DEFAULT_MOUSE_INTERVAL: 8,
  MOUSE_HISTORY_SIZE: 5,
  CURSOR_STABILIZE_MS: 30,
  
  // Caret tracking
  CARET_SAMPLE_SHORT_DELAY: 20,
  CARET_SAMPLE_LONG_DELAY: 80,
  CARET_POLL_INTERVAL: 16,
  CARET_POLL_DURATION_KEYDOWN: 120,
  CARET_POLL_DURATION_KEYUP: 80,
  
  // Monitor overlay
  MONITOR_OVERLAY_DURATION: 2000,
  
  // Velocity smoothing
  VELOCITY_SMOOTHING_FACTOR: 0.2,
  MIN_TIME_DELTA: 1, // Prevent division by zero
} as const

// Display constants
export const DISPLAY = {
  DEFAULT_SCALE_FACTOR: 1,
  MIN_CARET_WIDTH: 1,
  MIN_CARET_HEIGHT: 1,
  DEFAULT_CARET_HEIGHT: 12,
} as const

// Key codes for keyboard tracking
export const KEY_CODES: Record<number, string> = {
  36: 'Return',
  49: 'Space',
  51: 'Backspace',
  53: 'Escape',
} as const

// Button mappings
export const MOUSE_BUTTONS = {
  LEFT: 1,
  RIGHT: 2,
  MIDDLE: 3,
} as const

// Scroll wheel direction
export const SCROLL_DIRECTION = {
  UP: 3,
  DOWN: 1,
} as const
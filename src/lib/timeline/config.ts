/**
 * Centralized configuration for timeline constants
 */
export const TimelineConfig = {
  // Layout dimensions
  RULER_HEIGHT: 32,
  TRACK_LABEL_WIDTH: 42,
  TRACK_PADDING: 4,
  MIN_CLIP_WIDTH: 40,

  // Snapping behavior
  SNAP_THRESHOLD_MS: 200,  // Increased for better snapping
  SNAP_THRESHOLD_PX: 15,   // Increased for better visual snapping
  SNAP_INTERVAL_MS: 100,

  // Clip positioning
  DEFAULT_CLIP_GAP_MS: 0, // No forced gaps
  AUTO_POSITION_GAP_MS: 100, // Gap when auto-positioning to avoid overlaps

  // Zoom settings
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 0.5,
  ZOOM_STEP: 0.1,

  // Playback
  DEFAULT_FPS: 30,
  PLAYBACK_UPDATE_INTERVAL_MS: 33, // ~30fps

  // Effects defaults
  ZOOM_EFFECT_DEFAULT_SCALE: 2.0,
  ZOOM_EFFECT_DEFAULT_INTRO_MS: 500,
  ZOOM_EFFECT_DEFAULT_OUTRO_MS: 500,
  ZOOM_EFFECT_MIN_DURATION_MS: 100,

  CURSOR_EFFECT_DEFAULT_SIZE: 4.0,
  CURSOR_EFFECT_DEFAULT_COLOR: '#ffffff',
  CURSOR_EFFECT_IDLE_TIMEOUT_MS: 3000,

  BACKGROUND_EFFECT_DEFAULT_PADDING: 80,
  BACKGROUND_EFFECT_DEFAULT_CORNER_RADIUS: 25,
  BACKGROUND_EFFECT_DEFAULT_SHADOW_INTENSITY: 85,

  // Timeline visibility
  BASE_VISIBLE_DURATION_MS: 10000, // 10 seconds visible at zoom 1.0
  TIMELINE_EXTRA_PADDING_PERCENT: 0.3, // 30% extra space at the end

  // Keyboard shortcuts
  SHORTCUTS: {
    PLAY_PAUSE: ' ',
    SPLIT: 's',
    DELETE: ['Delete', 'Backspace'],
    COPY: ['Meta+c', 'Control+c'],
    PASTE: ['Meta+v', 'Control+v'],
    CUT: ['Meta+x', 'Control+x'],
    DUPLICATE: ['Meta+d', 'Control+d'],
    SELECT_ALL: ['Meta+a', 'Control+a'],
    DESELECT: 'Escape',
    UNDO: ['Meta+z', 'Control+z'],
    REDO: ['Meta+Shift+z', 'Control+Shift+z'],
    SAVE: ['Meta+s', 'Control+s']
  },

  // Animation durations
  ANIMATION: {
    CLIP_SNAP_BACK_MS: 200,
    ZOOM_TRANSITION_MS: 300,
    PANEL_SLIDE_MS: 250
  },

  // Color opacity values
  OPACITY: {
    CLIP_DRAGGING: 0.6,
    CLIP_INVALID: 0.5,
    CLIP_NORMAL: 1.0,
    EFFECT_BLOCK_SELECTED: 0.95,
    EFFECT_BLOCK_NORMAL: 0.85,
    EFFECT_BLOCK_DRAGGING: 0.7
  }
} as const

// Type for the config
export type TimelineConfigType = typeof TimelineConfig

// Helper to get config values with optional overrides
export function getTimelineConfig<K extends keyof TimelineConfigType>(
  key: K,
  override?: TimelineConfigType[K]
): TimelineConfigType[K] {
  return override !== undefined ? override : TimelineConfig[key]
}
/**
 * Constants for calculator utilities
 * Used by camera-calculator.ts and background-calculator.ts
 */

// =============================================================================
// ZOOM/PAN CAMERA BEHAVIOR
// =============================================================================

/** Dead‑zone size as ratio of visible window (0-1). Cursor can move within this without panning. */
export const CAMERA_DEAD_ZONE_RATIO = 0.4;

// Motion cluster detection
/** Maximum cluster radius as ratio of screen diagonal */
export const CLUSTER_RADIUS_RATIO = 0.15;
/** Minimum duration in ms for a dwell to be considered a valid cluster */
export const MIN_CLUSTER_DURATION_MS = 400;
/** Buffer time in ms after cluster ends before transitioning out */
export const CLUSTER_HOLD_BUFFER_MS = 0;

// Cinematic mouse smoothing
/** Window size in ms for averaging mouse position */
export const CINEMATIC_WINDOW_MS = 200;
/** Number of samples to take within the averaging window for smooth camera follow */
export const CINEMATIC_SAMPLES = 8;

// Physics
/** Time delta threshold in ms to consider a seek (skip vs normal playback) */
export const SEEK_THRESHOLD_MS = 100;
/** Spring tension - higher = faster response */
export const SPRING_TENSION = 120;
/** Spring friction - higher = less oscillation */
export const SPRING_FRICTION = 25;

// =============================================================================
// CURSOR STOP DETECTION (prevents camera halt-shake)
// =============================================================================

/** Velocity threshold (normalized units/sec) below which cursor is "stopped" */
export const CURSOR_STOP_VELOCITY_THRESHOLD = 0.002;

/** Time in ms cursor must be below velocity threshold before freeze activates */
export const CURSOR_STOP_DWELL_MS = 80;

/** Minimum zoom scale for stop detection (no effect at 1x) */
export const CURSOR_STOP_MIN_ZOOM = 1.05;

/** Velocity damping factor when frozen (0-1, lower = faster settling) */
export const CURSOR_STOP_DAMPING = 0.7;

/** Distance threshold for snapping to target when frozen */
export const CURSOR_STOP_SNAP_THRESHOLD = 0.0005;

// =============================================================================
// BACKGROUND/SHADOW EFFECTS
// =============================================================================

/** Maximum blur radius for shadow effect */
export const MAX_SHADOW_BLUR = 50;
/** Divisor to convert shadow intensity (0-100) to opacity (0-1) */
export const SHADOW_INTENSITY_TO_OPACITY_DIVISOR = 100;
/** Divisor for shadow Y offset relative to blur */
export const SHADOW_OFFSET_DIVISOR = 4;

/** Default center position for background images */
export const DEFAULT_IMAGE_POSITION = { x: 0.5, y: 0.5 } as const;

/** Fallback color when no background color specified */
export const DEFAULT_BACKGROUND_COLOR = '#000000';

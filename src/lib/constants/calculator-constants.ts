/**
 * Constants for calculator utilities
 * Used by zoom-pan-calculator.ts and background-calculator.ts
 */

// =============================================================================
// ZOOM/PAN CAMERA BEHAVIOR
// =============================================================================

/** How much the viewport follows mouse position (0=none, 1=perfect center) */
export const CAMERA_FOLLOW_STRENGTH = 0.7;
/** Interpolation smoothing factor - lower = smoother, higher = more responsive */
export const CAMERA_SMOOTHING = 0.08;

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
/** Number of samples to take within the averaging window */
export const CINEMATIC_SAMPLES = 5;

// Physics
/** Time delta threshold in ms to consider a seek (skip vs normal playback) */
export const SEEK_THRESHOLD_MS = 100;
/** Spring tension - higher = faster response */
export const SPRING_TENSION = 120;
/** Spring friction - higher = less oscillation */
export const SPRING_FRICTION = 25;

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

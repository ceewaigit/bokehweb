/**
 * Shared zoom transformation utilities for video and cursor layers
 * Uses deterministic, frame-perfect easing without spring physics
 */

import type { ZoomBlock } from '@/types/project';

/**
 * Professional easing curves for smooth, cinematic zoom
 * These are deterministic and frame-perfect
 */

// Smooth ease-in-out-cubic for consistent speed
export const easeInOutCubic = (t: number): number => {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};


// Professional zoom easing - smooth and consistent
const professionalZoomIn = (progress: number): number => {
  // Use smooth cubic for consistent, cinematic zoom
  return easeInOutCubic(progress);
};

const professionalZoomOut = (progress: number): number => {
  // Mirror of zoom in for symmetry
  return easeInOutCubic(progress);
};

interface ZoomState {
  scale: number;
  scaleCompensationX: number;
  scaleCompensationY: number;
  panX: number;
  panY: number;
}

/**
 * Calculate the zoom scale for a given time within a zoom block
 * This is now completely deterministic based on elapsed time
 */
export function calculateZoomScale(
  elapsed: number,
  blockDuration: number,
  targetScale: number,
  introMs: number = 500,
  outroMs: number = 500
): number {
  // Clamp elapsed time to valid range
  const clampedElapsed = Math.max(0, Math.min(blockDuration, elapsed));

  if (clampedElapsed < introMs) {
    // Intro phase - zoom in smoothly
    const progress = Math.min(1, Math.max(0, clampedElapsed / introMs));
    const easedProgress = professionalZoomIn(progress);
    return 1 + (targetScale - 1) * easedProgress;
  } else if (clampedElapsed > blockDuration - outroMs) {
    // Outro phase - zoom out smoothly
    const outroElapsed = clampedElapsed - (blockDuration - outroMs);
    const progress = Math.min(1, Math.max(0, outroElapsed / outroMs));
    const easedProgress = professionalZoomOut(progress);
    return targetScale - (targetScale - 1) * easedProgress;
  } else {
    // Hold phase - maintain exact zoom scale
    return targetScale;
  }
}

/**
 * Calculate the complete zoom transformation for a video element
 * Creates a cinematic zoom with optional smooth panning
 */
export function calculateZoomTransform(
  activeBlock: ZoomBlock | undefined,
  currentTimeMs: number,
  videoWidth: number,
  videoHeight: number,
  zoomCenter: { x: number; y: number }, // Fixed zoom center (normalized 0-1)
  overrideScale?: number,
  /** Padding amount in pixels - used to calculate pan for revealing padding */
  padding?: number
): ZoomState {
  if (!activeBlock) {
    return {
      scale: 1,
      scaleCompensationX: 0,
      scaleCompensationY: 0,
      panX: 0,
      panY: 0
    };
  }

  const blockDuration = activeBlock.endTime - activeBlock.startTime;
  const elapsed = currentTimeMs - activeBlock.startTime;

  // Calculate zoom scale - completely deterministic
  const scale = (overrideScale != null)
    ? overrideScale
    : calculateZoomScale(
      elapsed,
      blockDuration,
      activeBlock.scale || 2,
      activeBlock.introMs,
      activeBlock.outroMs
    );

  // IMPORTANT:
  // `zoomCenter` is a CAMERA CENTER (view center) in normalized source space.
  // It can go outside 0-1 when overscan/padding should be revealed.
  //
  // Our CSS transform is `translate(...) scale(...)` (scale applies first, then translate),
  // so to center the visible window on `zoomCenter`, we translate by:
  //   T = (0.5 - zoomCenter) * size * scale
  // Derived from: x_view_center = 0.5 - T/(size*scale)
  const panX = Math.abs(scale - 1) < 0.001 ? 0 : (0.5 - zoomCenter.x) * videoWidth * scale;
  const panY = Math.abs(scale - 1) < 0.001 ? 0 : (0.5 - zoomCenter.y) * videoHeight * scale;

  return {
    scale,
    scaleCompensationX: 0,
    scaleCompensationY: 0,
    panX,
    panY
  };
}

/**
 * Apply zoom transformation to a point (for cursor positioning)
 * Matches the video transform which uses transformOrigin: '50% 50%'
 */
/**
 * Generate CSS transform string for video element with GPU acceleration
 * Now with sub-pixel rounding to prevent jitter
 */
export function getZoomTransformString(zoomTransform: ZoomState): string {
  if (Math.abs(zoomTransform.scale - 1) < 0.001) {
    return '';
  }

  // Round translations to 2 decimal places to prevent sub-pixel jitter
  const translateX = Math.round((zoomTransform.scaleCompensationX + zoomTransform.panX) * 100) / 100;
  const translateY = Math.round((zoomTransform.scaleCompensationY + zoomTransform.panY) * 100) / 100;
  const scale = Math.round(zoomTransform.scale * 1000) / 1000; // 3 decimal places for scale

  // Use transform3d for GPU acceleration and smoother animation
  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
}

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

  // Use fixed zoom center for stable, cinematic zoom
  // Clamp to 0-1 for the "keep point fixed" calculation
  const clampedCenterX = Math.max(0, Math.min(1, zoomCenter.x));
  const clampedCenterY = Math.max(0, Math.min(1, zoomCenter.y));

  // Convert to pixel coordinates
  const zoomPointX = clampedCenterX * videoWidth;
  const zoomPointY = clampedCenterY * videoHeight;

  // Calculate center of video
  const centerX = videoWidth / 2;
  const centerY = videoHeight / 2;

  // Calculate offset from center to zoom point
  const offsetFromCenterX = zoomPointX - centerX;
  const offsetFromCenterY = zoomPointY - centerY;

  // Scale compensation to keep zoom point fixed
  const scaleCompensationX = -offsetFromCenterX * (scale - 1);
  const scaleCompensationY = -offsetFromCenterY * (scale - 1);

  // Calculate pan to reveal padding when camera is at edge.
  // The camera center in source-normalized coords tells us where the view should be centered.
  // When it's < 0.5/scale or > 1-0.5/scale, we need additional pan to show padding.
  let panX = 0;
  let panY = 0;

  if (padding && padding > 0 && scale > 1) {
    // The camera can position the view such that some padding should be visible.
    // Calculate how much of the view extends beyond the video content.
    const halfViewWidth = 0.5 / scale; // Normalized half-width of visible area

    // View left edge in source-normalized coords
    const viewLeftEdge = zoomCenter.x - halfViewWidth;
    // View right edge in source-normalized coords
    const viewRightEdge = zoomCenter.x + halfViewWidth;

    // If view extends left of video (< 0), pan right to reveal left padding
    if (viewLeftEdge < 0) {
      // How much of the view is in the "padding zone" (negative source coords)
      const paddingVisible = -viewLeftEdge; // As normalized ratio
      // Convert to pixel pan - this shifts the scaled video right
      panX = paddingVisible * videoWidth * scale;
    }
    // If view extends right of video (> 1), pan left to reveal right padding
    if (viewRightEdge > 1) {
      const paddingVisible = viewRightEdge - 1;
      panX = -paddingVisible * videoWidth * scale;
    }

    // Same for Y
    const viewTopEdge = zoomCenter.y - halfViewWidth;
    const viewBottomEdge = zoomCenter.y + halfViewWidth;

    if (viewTopEdge < 0) {
      panY = -viewTopEdge * videoHeight * scale;
    }
    if (viewBottomEdge > 1) {
      panY = -(viewBottomEdge - 1) * videoHeight * scale;
    }
  }

  // Fade padding-pan with zoom progress so zoom-out doesn't "snap" on the last frame.
  if (padding && padding > 0 && (panX !== 0 || panY !== 0)) {
    const targetScale = activeBlock.scale || 2;
    const t = targetScale > 1.000001 ? Math.max(0, Math.min(1, (scale - 1) / (targetScale - 1))) : 0;
    panX *= t;
    panY *= t;
  }

  return {
    scale,
    scaleCompensationX,
    scaleCompensationY,
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

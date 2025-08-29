/**
 * Shared zoom transformation utilities for video and cursor layers
 * Uses deterministic, frame-perfect easing without spring physics
 */

import type { ZoomBlock } from '@/types/project';

/**
 * Professional easing curves for smooth, cinematic zoom
 * These are deterministic and frame-perfect
 */

// Smooth exponential ease out for zoom in
export const easeOutExpo = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

// Very smooth cubic bezier curve
const smoothCubic = (t: number): number => {
  return t * t * (3 - 2 * t);
};

// Professional zoom easing - deterministic and smooth
const professionalZoomIn = (progress: number): number => {
  // Use a combination of curves for the smoothest result
  // Start with exponential, blend with cubic for polish
  const expo = easeOutExpo(progress);
  const cubic = smoothCubic(progress);
  // Weighted blend favoring exponential
  return expo * 0.8 + cubic * 0.2;
};

const professionalZoomOut = (progress: number): number => {
  // Mirror of zoom in for symmetry
  const t = 1 - progress;
  const expo = easeOutExpo(t);
  const cubic = smoothCubic(t);
  return 1 - (expo * 0.8 + cubic * 0.2);
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
  cinematicPan?: { x: number; y: number } // Optional cinematic pan (normalized)
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
  const scale = calculateZoomScale(
    elapsed,
    blockDuration,
    activeBlock.scale || 2,
    activeBlock.introMs,
    activeBlock.outroMs
  );

  // Use fixed zoom center for stable, cinematic zoom
  const zoomCenterX = zoomCenter.x;
  const zoomCenterY = zoomCenter.y;

  // Convert to pixel coordinates
  const zoomPointX = zoomCenterX * videoWidth;
  const zoomPointY = zoomCenterY * videoHeight;

  // Calculate center of video
  const centerX = videoWidth / 2;
  const centerY = videoHeight / 2;

  // Calculate offset from center to zoom point
  const offsetFromCenterX = zoomPointX - centerX;
  const offsetFromCenterY = zoomPointY - centerY;

  // Scale compensation to keep zoom point fixed
  const scaleCompensationX = -offsetFromCenterX * (scale - 1);
  const scaleCompensationY = -offsetFromCenterY * (scale - 1);

  // Apply cinematic pan if provided (already smoothed in MainComposition)
  const panX = (cinematicPan?.x || 0) * videoWidth;
  const panY = (cinematicPan?.y || 0) * videoHeight;

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
export function applyZoomToPoint(
  pointX: number,
  pointY: number,
  videoOffset: { x: number; y: number; width: number; height: number },
  zoomTransform: ZoomState
): { x: number; y: number } {
  if (zoomTransform.scale === 1) {
    return { x: pointX, y: pointY };
  }

  // The video div is transformed with CSS transform and transformOrigin: '50% 50%'
  // This means the video scales from its center, then translates

  // First, get the point relative to the video's top-left corner
  const relativeToVideoX = pointX - videoOffset.x;
  const relativeToVideoY = pointY - videoOffset.y;

  // Now scale this position (video scales from its center)
  const scaledRelativeX = relativeToVideoX * zoomTransform.scale + (videoOffset.width / 2) * (1 - zoomTransform.scale);
  const scaledRelativeY = relativeToVideoY * zoomTransform.scale + (videoOffset.height / 2) * (1 - zoomTransform.scale);

  // Apply the translation that was applied to the video
  const totalTranslateX = zoomTransform.scaleCompensationX + zoomTransform.panX;
  const totalTranslateY = zoomTransform.scaleCompensationY + zoomTransform.panY;

  // Final position in screen coordinates
  return {
    x: videoOffset.x + scaledRelativeX + totalTranslateX,
    y: videoOffset.y + scaledRelativeY + totalTranslateY
  };
}

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


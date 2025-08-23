/**
 * Shared zoom transformation utilities for video and cursor layers
 */

import { interpolate } from 'remotion';
import type { ZoomBlock } from '@/types/project';

// Ultra-smooth easing for butter-like zoom and pan transitions
export const easeInOutQuint = (t: number): number => {
  if (t < 0.5) {
    return 16 * t * t * t * t * t;
  }
  return 1 - Math.pow(-2 * t + 2, 5) / 2;
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
 */
export function calculateZoomScale(
  elapsed: number,
  blockDuration: number,
  targetScale: number,
  introMs: number = 500,
  outroMs: number = 500
): number {
  if (elapsed < introMs) {
    // Intro phase - zoom in smoothly
    const progress = elapsed / introMs;
    return interpolate(
      progress,
      [0, 1],
      [1, targetScale],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: easeInOutQuint  // Ultra-smooth butter-like zoom in
      }
    );
  } else if (elapsed > blockDuration - outroMs) {
    // Outro phase - zoom out smoothly
    const outroElapsed = elapsed - (blockDuration - outroMs);
    const progress = outroElapsed / outroMs;
    return interpolate(
      progress,
      [0, 1],
      [targetScale, 1],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: easeInOutQuint  // Ultra-smooth butter-like zoom out
      }
    );
  } else {
    // Hold phase - maintain zoom scale
    return targetScale;
  }
}

/**
 * Calculate the complete zoom transformation for a video element
 */
export function calculateZoomTransform(
  activeBlock: ZoomBlock | undefined,
  currentTimeMs: number,
  videoWidth: number,
  videoHeight: number,
  smoothPan: { x: number; y: number },
  mousePosition?: { x: number; y: number } // Current mouse position (normalized 0-1)
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

  // Calculate zoom scale
  const scale = calculateZoomScale(
    elapsed,
    blockDuration,
    activeBlock.scale || 2,
    activeBlock.introMs,
    activeBlock.outroMs
  );

  // Use current mouse position as zoom center, fallback to center if not available
  const zoomCenterX = mousePosition?.x ?? 0.5;
  const zoomCenterY = mousePosition?.y ?? 0.5;

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

  // Add dynamic pan offset (scaled with zoom)
  const panX = smoothPan.x * videoWidth * scale;
  const panY = smoothPan.y * videoHeight * scale;

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
  
  // Get the center of the video (transform origin)
  const videoCenterX = videoOffset.x + videoOffset.width / 2;
  const videoCenterY = videoOffset.y + videoOffset.height / 2;

  // First, get the point relative to the video's top-left corner
  const relativeToVideoX = pointX - videoOffset.x;
  const relativeToVideoY = pointY - videoOffset.y;

  // Now scale this position (video scales from its center)
  // After scaling, a point at (x,y) relative to video top-left becomes:
  // newX = centerX + (x - centerX) * scale
  // Which simplifies to: newX = x * scale + centerX * (1 - scale)
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
 * Generate CSS transform string for video element
 */
export function getZoomTransformString(zoomTransform: ZoomState): string {
  if (zoomTransform.scale === 1) {
    return '';
  }

  const translateX = zoomTransform.scaleCompensationX + zoomTransform.panX;
  const translateY = zoomTransform.scaleCompensationY + zoomTransform.panY;

  return `translate(${translateX}px, ${translateY}px) scale(${zoomTransform.scale})`;
}
/**
 * Shared zoom transformation utilities for video and cursor layers
 */

import { interpolate } from 'remotion';

// Easing functions for smooth transitions
export const easeOutExpo = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

export const easeInExpo = (t: number): number => {
  return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
};

interface ZoomBlock {
  startTime: number;
  endTime: number;
  scale?: number;
  targetX?: number;
  targetY?: number;
  introMs?: number;
  outroMs?: number;
}

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
  introMs: number = 400,
  outroMs: number = 400
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
        easing: easeOutExpo
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
        easing: easeInExpo
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
  smoothPan: { x: number; y: number }
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

  // Calculate zoom center point
  const zoomCenterX = activeBlock.targetX || 0.5;
  const zoomCenterY = activeBlock.targetY || 0.5;

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

  // Translate point relative to video origin
  const relativeX = pointX - videoOffset.x;
  const relativeY = pointY - videoOffset.y;
  
  // Scale the position
  const scaledX = relativeX * zoomTransform.scale;
  const scaledY = relativeY * zoomTransform.scale;
  
  // Apply the translation
  const totalTranslateX = zoomTransform.scaleCompensationX + zoomTransform.panX;
  const totalTranslateY = zoomTransform.scaleCompensationY + zoomTransform.panY;
  
  // Add back the video offset
  return {
    x: videoOffset.x + scaledX + totalTranslateX,
    y: videoOffset.y + scaledY + totalTranslateY
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
/**
 * Shared zoom transformation utilities for video and cursor layers
 */

import { interpolate } from 'remotion';
import type { ZoomBlock } from '@/types/project';
import { easeOutExpo, smoothStep } from '@/lib/utils/easing';

// Professional easing curves for cinematic zoom
const easeInExpo = (t: number): number => {
  return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
};

// Custom zoom easing - combines exponential and smooth curves
const zoomInEasing = (t: number): number => {
  // Use exponential easing for zoom in (fast start, smooth deceleration)
  // Combined with smoothstep for extra polish
  const expo = easeOutExpo(t);
  const smooth = smoothStep(t);
  return expo * 0.7 + smooth * 0.3; // Blend for best feel
};

const zoomOutEasing = (t: number): number => {
  // Inverse of zoom in for symmetrical feel
  const expo = 1 - easeOutExpo(1 - t);
  const smooth = smoothStep(t);
  return expo * 0.7 + smooth * 0.3;
};

// Spring physics for natural motion
class SpringSmoothing {
  private velocity: number = 0;
  private lastValue: number = 1;
  private lastTime: number = 0;
  
  update(targetValue: number, currentTime: number, stiffness: number = 0.15, damping: number = 0.92): number {
    if (this.lastTime === 0) {
      this.lastTime = currentTime;
      this.lastValue = targetValue;
      return targetValue;
    }
    
    const deltaTime = Math.min((currentTime - this.lastTime) / 16.67, 2); // Normalize to 60fps
    this.lastTime = currentTime;
    
    // Spring physics
    const displacement = targetValue - this.lastValue;
    const springForce = displacement * stiffness;
    this.velocity = (this.velocity + springForce) * damping;
    
    // Apply velocity with clamping
    const maxVelocity = Math.abs(displacement) * 0.5;
    this.velocity = Math.max(-maxVelocity, Math.min(maxVelocity, this.velocity));
    
    this.lastValue += this.velocity * deltaTime;
    
    // Snap to target if very close
    if (Math.abs(this.lastValue - targetValue) < 0.001) {
      this.lastValue = targetValue;
      this.velocity = 0;
    }
    
    return this.lastValue;
  }
  
  reset() {
    this.velocity = 0;
    this.lastValue = 1;
    this.lastTime = 0;
  }
}

// Global spring instances for smoothing
const scaleSpring = new SpringSmoothing();

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
  outroMs: number = 500,
  useSpring: boolean = true
): number {
  let rawScale: number;
  
  if (elapsed < introMs) {
    // Intro phase - zoom in with professional easing
    const progress = Math.max(0, Math.min(1, elapsed / introMs));
    const easedProgress = zoomInEasing(progress);
    rawScale = 1 + (targetScale - 1) * easedProgress;
  } else if (elapsed > blockDuration - outroMs) {
    // Outro phase - zoom out with smooth easing
    const outroElapsed = elapsed - (blockDuration - outroMs);
    const progress = Math.max(0, Math.min(1, outroElapsed / outroMs));
    const easedProgress = zoomOutEasing(progress);
    rawScale = targetScale - (targetScale - 1) * easedProgress;
  } else {
    // Hold phase - maintain zoom scale with slight spring dampening
    rawScale = targetScale;
  }
  
  // Apply spring smoothing for extra polish (optional)
  if (useSpring) {
    // Use current time as elapsed for spring physics
    return scaleSpring.update(rawScale, elapsed);
  }
  
  return rawScale;
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
 * Generate CSS transform string for video element with GPU acceleration
 */
export function getZoomTransformString(zoomTransform: ZoomState): string {
  if (zoomTransform.scale === 1) {
    return '';
  }

  const translateX = zoomTransform.scaleCompensationX + zoomTransform.panX;
  const translateY = zoomTransform.scaleCompensationY + zoomTransform.panY;

  // Use transform3d for GPU acceleration and smoother animation
  return `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${zoomTransform.scale}, ${zoomTransform.scale}, 1)`;
}

/**
 * Reset spring smoothing when switching zoom blocks
 */
export function resetZoomSmoothing(): void {
  scaleSpring.reset();
}
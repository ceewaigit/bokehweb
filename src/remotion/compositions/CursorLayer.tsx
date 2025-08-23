import React, { useMemo } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import type { CursorLayerProps } from './types';
import {
  CursorType,
  CURSOR_HOTSPOTS,
  getCursorImagePath,
  electronToCustomCursor
} from '../../lib/effects/cursor-types';
import { calculateZoomTransform, applyZoomToPoint } from './utils/zoom-transform';

// Cursor dimensions for proper aspect ratio
const CURSOR_DIMENSIONS: Record<CursorType, { width: number; height: number }> = {
  [CursorType.ARROW]: { width: 24, height: 32 },
  [CursorType.IBEAM]: { width: 16, height: 32 },
  [CursorType.POINTING_HAND]: { width: 28, height: 28 },
  [CursorType.CLOSED_HAND]: { width: 28, height: 28 },
  [CursorType.OPEN_HAND]: { width: 32, height: 32 },
  [CursorType.CROSSHAIR]: { width: 24, height: 24 },
  [CursorType.RESIZE_LEFT]: { width: 24, height: 24 },
  [CursorType.RESIZE_RIGHT]: { width: 24, height: 24 },
  [CursorType.RESIZE_UP]: { width: 24, height: 24 },
  [CursorType.RESIZE_DOWN]: { width: 24, height: 24 },
  [CursorType.RESIZE_LEFT_RIGHT]: { width: 32, height: 24 },
  [CursorType.RESIZE_UP_DOWN]: { width: 24, height: 32 },
  [CursorType.CONTEXTUAL_MENU]: { width: 24, height: 32 },
  [CursorType.DISAPPEARING_ITEM]: { width: 24, height: 32 },
  [CursorType.DRAG_COPY]: { width: 24, height: 32 },
  [CursorType.DRAG_LINK]: { width: 24, height: 32 },
  [CursorType.OPERATION_NOT_ALLOWED]: { width: 28, height: 28 },
  [CursorType.IBEAM_VERTICAL]: { width: 32, height: 16 }
};

export const CursorLayer: React.FC<CursorLayerProps> = ({
  cursorEvents,
  clickEvents,
  fps,
  videoOffset,
  zoom = { scale: 1, x: 0.5, y: 0.5, panX: 0, panY: 0 },
  videoWidth,
  videoHeight,
  cursorEffects
}) => {
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;

  // Determine current cursor type from events
  const cursorType = useMemo(() => {
    if (!cursorEvents || cursorEvents.length === 0) return CursorType.ARROW;

    // Find the event closest to current time
    let closestEvent = cursorEvents[0];
    let minDiff = Math.abs(closestEvent.timestamp - currentTimeMs);

    for (const event of cursorEvents) {
      const diff = Math.abs(event.timestamp - currentTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestEvent = event;
      }
    }

    const electronType = (closestEvent as any)?.cursorType || 'default';
    return electronToCustomCursor(electronType);
  }, [cursorEvents, currentTimeMs]);

  // Get interpolated cursor position with ice-like sliding effect
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    // Much larger lag for ice-like sliding effect
    const lagMs = 250; // Cursor slides behind by a significant amount
    const laggedTime = Math.max(0, currentTimeMs - lagMs);

    // Find surrounding events for the lagged time
    let prevEvent = null;
    let nextEvent = null;

    for (let i = 0; i < cursorEvents.length; i++) {
      const event = cursorEvents[i];
      if (event.timestamp <= laggedTime) {
        prevEvent = event;
      } else {
        nextEvent = event;
        break;
      }
    }

    if (!prevEvent) {
      return cursorEvents[0] ? {
        x: cursorEvents[0].x,
        y: cursorEvents[0].y
      } : null;
    }

    if (!nextEvent) {
      return {
        x: prevEvent.x,
        y: prevEvent.y
      };
    }

    // Interpolate between events
    const timeDiff = nextEvent.timestamp - prevEvent.timestamp;
    if (timeDiff === 0) {
      return {
        x: prevEvent.x,
        y: prevEvent.y
      };
    }

    const progress = (laggedTime - prevEvent.timestamp) / timeDiff;

    // Ice-like easing function - very slow acceleration and deceleration
    // This creates a sliding effect like the cursor is on ice
    const iceEasing = (t: number) => {
      // Using a combination of sine and exponential for ultra-smooth ice sliding
      const clampedT = Math.max(0, Math.min(1, t));
      
      // Smooth exponential ease for ice-like physics
      // Starts very slow, gradually builds momentum, then slowly decelerates
      const exponentialEase = 1 - Math.pow(2, -10 * clampedT);
      
      // Add subtle sine wave for extra smoothness
      const sineInfluence = (Math.sin((clampedT - 0.5) * Math.PI) + 1) / 2;
      
      // Combine both for ice-like movement
      return exponentialEase * 0.7 + sineInfluence * 0.3;
    };

    const smoothProgress = iceEasing(progress);
    
    return {
      x: prevEvent.x + (nextEvent.x - prevEvent.x) * smoothProgress,
      y: prevEvent.y + (nextEvent.y - prevEvent.y) * smoothProgress
    };
  }, [cursorEvents, currentTimeMs]);

  // Check for active click animation
  const activeClick = useMemo(() => {
    return clickEvents.find(click => {
      const clickDuration = 300; // ms for click animation
      return currentTimeMs >= click.timestamp &&
        currentTimeMs <= click.timestamp + clickDuration;
    });
  }, [clickEvents, currentTimeMs]);

  // Calculate click animation scale - must be before early return for React hooks rules
  const clickScale = useMemo(() => {
    if (!activeClick) return 1;
    const clickProgress = (currentTimeMs - activeClick.timestamp) / 150; // 150ms animation
    if (clickProgress > 1) return 1;

    // Subtle pulse: 1.0 -> 0.90 -> 1.0
    if (clickProgress < 0.5) {
      return 1 - (clickProgress * 0.2); // Scale down to 0.90
    } else {
      return 0.90 + ((clickProgress - 0.5) * 0.2); // Scale back up to 1.0
    }
  }, [activeClick, currentTimeMs]);

  if (!cursorPosition) return null;

  // Get cursor metadata from the event (display bounds)
  const currentEvent = cursorEvents.find(e =>
    Math.abs(e.timestamp - currentTimeMs) < 50
  );
  const displayBounds = (currentEvent as any)?.displayBounds;

  // The cursor position comes from screen coordinates
  // We need to map it relative to the video recording area
  let rawX = cursorPosition.x;
  let rawY = cursorPosition.y;

  // If we have display bounds, adjust for multi-monitor setups
  if (displayBounds) {
    rawX = rawX - displayBounds.x;
    rawY = rawY - displayBounds.y;
  }

  // Normalize using screen dimensions from the event (not video dimensions)
  // This accounts for Retina displays where video is 2x screen size
  const screenWidth = currentEvent?.screenWidth || videoWidth / 2;
  const screenHeight = currentEvent?.screenHeight || videoHeight / 2;
  const normalizedX = rawX / screenWidth;
  const normalizedY = rawY / screenHeight;

  // Map to displayed video position
  let cursorX = videoOffset.x + normalizedX * videoOffset.width;
  let cursorY = videoOffset.y + normalizedY * videoOffset.height;

  // Apply cursor size from effects
  const cursorSize = cursorEffects?.size ?? 1.0;
  
  // Apply cursor hotspot offset for accurate positioning
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];
  const hotspotScale = (dimensions.width / 48) * cursorSize; // Scale with cursor size

  cursorX -= hotspot.x * hotspotScale;
  cursorY -= hotspot.y * hotspotScale;

  // Apply zoom transformation to match video layer exactly
  if (zoom.scale > 1) {
    // Calculate the same zoom transform as the video
    const zoomTransform = {
      scale: zoom.scale,
      scaleCompensationX: -(zoom.x * videoOffset.width - videoOffset.width / 2) * (zoom.scale - 1),
      scaleCompensationY: -(zoom.y * videoOffset.height - videoOffset.height / 2) * (zoom.scale - 1),
      panX: (zoom.panX || 0) * videoOffset.width * zoom.scale,
      panY: (zoom.panY || 0) * videoOffset.height * zoom.scale
    };

    // Apply the transformation to cursor position
    const transformedPos = applyZoomToPoint(cursorX, cursorY, videoOffset, zoomTransform);
    cursorX = transformedPos.x;
    cursorY = transformedPos.y;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Cursor with proper dimensions and smooth motion */}
      <Img
        src={getCursorImagePath(cursorType)}
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          width: dimensions.width * cursorSize,
          height: dimensions.height * cursorSize,
          transform: `scale(${clickScale})`,
          transformOrigin: `${CURSOR_HOTSPOTS[cursorType].x * cursorSize}px ${CURSOR_HOTSPOTS[cursorType].y * cursorSize}px`,
          zIndex: 100,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25)) drop-shadow(0 1px 3px rgba(0,0,0,0.15))',
          imageRendering: 'crisp-edges',
          willChange: 'transform, left, top'
        }}
      />
    </AbsoluteFill>
  );
};
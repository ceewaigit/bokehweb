import React, { useMemo } from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CursorLayerProps } from './types';
import {
  CursorType,
  CURSOR_HOTSPOTS,
  getCursorImagePath,
  electronToCustomCursor
} from '../../lib/effects/cursor-types';

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
  currentFrame,
  fps,
  videoOffset,
  zoom = { scale: 1, x: 0.5, y: 0.5, panX: 0, panY: 0 },
  videoWidth,
  videoHeight,
  cursorEffects
}) => {
  const { width, height } = useVideoConfig();
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

  // Get interpolated cursor position with smooth lag
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    // Apply lag - cursor follows behind for smooth, natural movement
    const lagMs = 60; // Cursor lags behind by this amount (like Screen Studio)
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

    // Use smooth cubic easing for natural, flowing movement
    const easeInOutQuad = (t: number) => {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    const smoothProgress = easeInOutQuad(Math.max(0, Math.min(1, progress)));

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

  if (!cursorPosition) return null;

  // Get cursor metadata from the event (scale factor, display bounds)
  const currentEvent = cursorEvents.find(e =>
    Math.abs(e.timestamp - currentTimeMs) < 50
  );
  const scaleFactor = (currentEvent as any)?.scaleFactor || 1;
  const displayBounds = (currentEvent as any)?.displayBounds;

  console.log('[CursorLayer] Cursor metadata:', {
    cursorPosition,
    currentEvent: currentEvent ? {
      x: currentEvent.x,
      y: currentEvent.y,
      screenWidth: currentEvent.screenWidth,
      screenHeight: currentEvent.screenHeight,
      timestamp: currentEvent.timestamp
    } : null,
    scaleFactor,
    displayBounds,
    videoSize: { videoWidth, videoHeight },
    videoOffset
  });

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
    // The video is scaled from its center, so cursor needs same transformation
    const videoCenterX = videoOffset.x + videoOffset.width / 2;
    const videoCenterY = videoOffset.y + videoOffset.height / 2;
    
    // Scale cursor position relative to video center
    const scaledX = videoCenterX + (cursorX - videoCenterX) * zoom.scale;
    const scaledY = videoCenterY + (cursorY - videoCenterY) * zoom.scale;
    
    // Apply the same pan as the video (based on zoom target)
    // The video zooms toward (zoom.x, zoom.y) and pans to keep it centered
    const zoomPointX = zoom.x * videoOffset.width;
    const zoomPointY = zoom.y * videoOffset.height;
    const centerX = videoOffset.width / 2;
    const centerY = videoOffset.height / 2;
    
    // Calculate the static pan offset (same as VideoLayer)
    const offsetFromCenterX = zoomPointX - centerX;
    const offsetFromCenterY = zoomPointY - centerY;
    const staticPanX = -offsetFromCenterX * (zoom.scale - 1);
    const staticPanY = -offsetFromCenterY * (zoom.scale - 1);
    
    // Add dynamic pan from mouse movement (provided by MainComposition)
    const dynamicPanX = (zoom.panX || 0) * videoOffset.width;
    const dynamicPanY = (zoom.panY || 0) * videoOffset.height;
    
    cursorX = scaledX + staticPanX + dynamicPanX;
    cursorY = scaledY + staticPanY + dynamicPanY;
  }

  // Calculate click animation scale
  const clickScale = useMemo(() => {
    if (!activeClick) return 1;
    const clickProgress = (currentTimeMs - activeClick.timestamp) / 150; // 150ms animation
    if (clickProgress > 1) return 1;

    // Subtle pulse: 1.0 -> 0.95 -> 1.0
    if (clickProgress < 0.5) {
      return 1 - (clickProgress * 0.1); // Scale down to 0.95
    } else {
      return 0.95 + ((clickProgress - 0.5) * 0.1); // Scale back up to 1.0
    }
  }, [activeClick, currentTimeMs]);

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
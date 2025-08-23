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

  // Get interpolated cursor position
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    // Use current time directly for immediate response
    const targetTime = currentTimeMs;

    // Find surrounding events
    let prevEvent = null;
    let nextEvent = null;

    for (let i = 0; i < cursorEvents.length; i++) {
      const event = cursorEvents[i];
      if (event.timestamp <= targetTime) {
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

    const progress = (targetTime - prevEvent.timestamp) / timeDiff;
    
    // Simple smoothstep interpolation
    const smoothProgress = progress * progress * (3 - 2 * progress);

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

  // Calculate click animation scale
  const clickScale = useMemo(() => {
    if (!activeClick) return 1;
    const clickProgress = Math.min(1, (currentTimeMs - activeClick.timestamp) / 150);
    // Subtle pulse animation
    return clickProgress < 0.5 
      ? 1 - (clickProgress * 0.2)
      : 0.9 + ((clickProgress - 0.5) * 0.2);
  }, [activeClick, currentTimeMs]);

  if (!cursorPosition) return null;

  // Get cursor metadata from the event (display bounds and source info)
  const currentEvent = cursorEvents.find(e =>
    Math.abs(e.timestamp - currentTimeMs) < 50
  );
  const displayBounds = (currentEvent as any)?.displayBounds;
  const sourceType = (currentEvent as any)?.sourceType || 'screen';
  const isWindowRecording = sourceType === 'window';

  // Get raw cursor position (screen coordinates)
  let rawX = cursorPosition.x;
  let rawY = cursorPosition.y;

  // Adjust for multi-monitor setups
  if (displayBounds) {
    rawX -= displayBounds.x;
    rawY -= displayBounds.y;
  }

  // Determine screen dimensions
  const screenWidth = isWindowRecording ? videoWidth : (currentEvent?.screenWidth || videoWidth);
  const screenHeight = isWindowRecording ? videoHeight : (currentEvent?.screenHeight || videoHeight);

  // Calculate normalized position (0-1 range)
  let normalizedX = rawX / screenWidth;
  let normalizedY = rawY / screenHeight;

  // For window recording, check if cursor is outside the window bounds
  if (isWindowRecording) {
    // Clamp cursor to window bounds (with a small margin for visibility)
    const margin = 0.02; // 2% margin
    normalizedX = Math.max(-margin, Math.min(1 + margin, normalizedX));
    normalizedY = Math.max(-margin, Math.min(1 + margin, normalizedY));
    
    // If cursor is too far outside, hide it
    if (normalizedX < -0.1 || normalizedX > 1.1 || normalizedY < -0.1 || normalizedY > 1.1) {
      return null; // Don't render cursor when it's outside the window
    }
  }

  // Map to displayed video position (before zoom)
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

  // Apply the exact same zoom transformation as the video
  if (zoom.scale > 1) {
    // Build a zoom block with all required fields for the transform calculation
    const zoomBlock = {
      id: 'cursor-zoom-temp',
      startTime: 0,
      endTime: 1000,
      scale: zoom.scale,
      targetX: zoom.x,
      targetY: zoom.y,
      introMs: 500,
      outroMs: 500,
      mode: 'manual' as const
    };

    // Use the shared utility to calculate transform (matches VideoLayer exactly)
    const zoomTransform = calculateZoomTransform(
      zoomBlock,
      500, // Middle of zoom (fully zoomed)
      videoOffset.width,
      videoOffset.height,
      { x: zoom.panX || 0, y: zoom.panY || 0 }
    );

    // Apply the transformation to cursor position
    const transformedPos = applyZoomToPoint(cursorX, cursorY, videoOffset, zoomTransform);
    cursorX = transformedPos.x;
    cursorY = transformedPos.y;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
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
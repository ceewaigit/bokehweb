import React, { useMemo } from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CursorLayerProps } from './types';

// Map cursor types to image paths
const CURSOR_IMAGES: Record<string, string> = {
  arrow: '/cursors/arrow.png',
  pointer: '/cursors/pointingHand.png',
  text: '/cursors/iBeam.png',
  crosshair: '/cursors/crosshair.png',
  'closed-hand': '/cursors/closedHand.png',
  'open-hand': '/cursors/openHand.png',
  'resize-left': '/cursors/resizeLeft.png',
  'resize-right': '/cursors/resizeRight.png',
  'resize-up': '/cursors/resizeUp.png',
  'resize-down': '/cursors/resizeDown.png',
  'resize-left-right': '/cursors/resizeLeftRight.png',
  'resize-up-down': '/cursors/resizeUpDown.png',
  'not-allowed': '/cursors/operationNotAllowed.png',
  'context-menu': '/cursors/contextualMenu.png',
  copy: '/cursors/dragCopy.png',
  link: '/cursors/dragLink.png'
};

export const CursorLayer: React.FC<CursorLayerProps> = ({
  cursorEvents,
  clickEvents,
  currentFrame,
  fps,
  videoOffset,
  zoom = { scale: 1, x: 0.5, y: 0.5 }
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;

  // Determine current cursor type from events
  const cursorType = useMemo(() => {
    if (!cursorEvents || cursorEvents.length === 0) return 'arrow';

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

    return (closestEvent as any)?.cursorType || 'arrow';
  }, [cursorEvents, currentTimeMs]);

  // Get interpolated cursor position
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    // Find surrounding events
    let prevEvent = null;
    let nextEvent = null;

    for (let i = 0; i < cursorEvents.length; i++) {
      const event = cursorEvents[i];
      if (event.timestamp <= currentTimeMs) {
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

    const progress = (currentTimeMs - prevEvent.timestamp) / timeDiff;

    // Smooth interpolation
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

  if (!cursorPosition) return null;

  // Apply zoom transformation to cursor position
  let cursorX = cursorPosition.x;
  let cursorY = cursorPosition.y;

  if (zoom.scale > 1) {
    // When zoomed, adjust cursor position relative to zoom center
    const zoomCenterX = width * zoom.x;
    const zoomCenterY = height * zoom.y;

    // Scale cursor position around zoom center
    cursorX = zoomCenterX + (cursorX - zoomCenterX) * zoom.scale;
    cursorY = zoomCenterY + (cursorY - zoomCenterY) * zoom.scale;
  }

  // Adjust cursor position to video offset
  cursorX = videoOffset.x + (cursorX / width) * videoOffset.width;
  cursorY = videoOffset.y + (cursorY / height) * videoOffset.height;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Cursor using actual image files */}
      <Img
        src={CURSOR_IMAGES[cursorType] || CURSOR_IMAGES.arrow}
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          width: 32,
          height: 32,
          transform: 'scale(1.2)',
          zIndex: 100,
          pointerEvents: 'none'
        }}
      />

      {/* Click ripple animation */}
      {activeClick && (
        <ClickRipple
          x={cursorX}
          y={cursorY}
          timestamp={activeClick.timestamp}
          currentTimeMs={currentTimeMs}
          color="#007AFF"
        />
      )}
    </AbsoluteFill>
  );
};

// Click ripple component
const ClickRipple: React.FC<{
  x: number;
  y: number;
  timestamp: number;
  currentTimeMs: number;
  color: string;
}> = ({ x, y, timestamp, currentTimeMs, color }) => {
  const progress = (currentTimeMs - timestamp) / 300; // 300ms animation

  const scale = interpolate(
    progress,
    [0, 1],
    [0.5, 2],
    {
      extrapolateRight: 'clamp'
    }
  );

  const opacity = interpolate(
    progress,
    [0, 0.5, 1],
    [0.8, 0.4, 0],
    {
      extrapolateRight: 'clamp'
    }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 40,
        height: 40,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        backgroundColor: `${color}33`,
        pointerEvents: 'none',
        zIndex: 99
      }}
    />
  );
};
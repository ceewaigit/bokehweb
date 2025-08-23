import React, { useMemo, useRef, useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import type { CursorLayerProps } from './types';
import {
  CursorType,
  CURSOR_HOTSPOTS,
  getCursorImagePath,
  electronToCustomCursor
} from '../../lib/effects/cursor-types';
import { calculateZoomTransform, applyZoomToPoint } from './utils/zoom-transform';
import { smoothStep } from '../../lib/utils/easing';

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
  
  // Store previous positions for motion trail and smoothing
  const positionHistoryRef = useRef<Array<{x: number, y: number, time: number}>>([]);
  const lastFrameRef = useRef<number>(-1);

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

    const electronType = closestEvent?.cursorType || 'default';
    return electronToCustomCursor(electronType);
  }, [cursorEvents, currentTimeMs]);

  // Smooth easing function for gliding effect
  const easeInOutQuart = (t: number) => 
    t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

  // Get interpolated cursor position with smooth gliding
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    const targetTime = currentTimeMs;

    // Find primary surrounding events
    let prevEvent = null;
    let nextEvent = null;
    let prevPrevEvent = null; // For velocity calculation

    for (let i = 0; i < cursorEvents.length; i++) {
      const event = cursorEvents[i];
      if (event.timestamp <= targetTime) {
        prevPrevEvent = prevEvent;
        prevEvent = event;
      } else if (!nextEvent) {
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
      // Use last known position without jump
      return {
        x: prevEvent.x,
        y: prevEvent.y
      };
    }

    // Calculate base interpolation
    const timeDiff = nextEvent.timestamp - prevEvent.timestamp;
    if (timeDiff === 0) {
      return {
        x: prevEvent.x,
        y: prevEvent.y
      };
    }

    // Handle large jumps (teleports/screen changes)
    const distanceX = Math.abs(nextEvent.x - prevEvent.x);
    const distanceY = Math.abs(nextEvent.y - prevEvent.y);
    
    if (distanceX > 500 || distanceY > 500) {
      const rawProgress = (targetTime - prevEvent.timestamp) / timeDiff;
      return rawProgress < 0.5 ? 
        { x: prevEvent.x, y: prevEvent.y } : 
        { x: nextEvent.x, y: nextEvent.y };
    }

    const rawProgress = (targetTime - prevEvent.timestamp) / timeDiff;
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    
    // Apply smooth easing for gliding effect
    const easedProgress = easeInOutQuart(clampedProgress);
    
    // Calculate velocities for momentum-based smoothing
    let velocityX = 0;
    let velocityY = 0;
    
    if (prevPrevEvent && prevEvent) {
      const prevTimeDiff = prevEvent.timestamp - prevPrevEvent.timestamp;
      if (prevTimeDiff > 0) {
        velocityX = (prevEvent.x - prevPrevEvent.x) / prevTimeDiff;
        velocityY = (prevEvent.y - prevPrevEvent.y) / prevTimeDiff;
      }
    }

    // Calculate target velocities
    const targetVelocityX = (nextEvent.x - prevEvent.x) / timeDiff;
    const targetVelocityY = (nextEvent.y - prevEvent.y) / timeDiff;
    
    // Smooth velocity transitions for ice-like gliding
    const velocityBlend = smoothStep(clampedProgress);
    const smoothVelocityX = velocityX * (1 - velocityBlend) + targetVelocityX * velocityBlend;
    const smoothVelocityY = velocityY * (1 - velocityBlend) + targetVelocityY * velocityBlend;
    
    // Calculate position with velocity influence for smoother motion
    const baseX = prevEvent.x + (nextEvent.x - prevEvent.x) * easedProgress;
    const baseY = prevEvent.y + (nextEvent.y - prevEvent.y) * easedProgress;
    
    // Add subtle momentum influence for gliding effect
    const momentumFactor = 0.05 * (1 - clampedProgress); // Decreases as we approach target
    const momentumX = smoothVelocityX * momentumFactor * timeDiff;
    const momentumY = smoothVelocityY * momentumFactor * timeDiff;

    return {
      x: baseX + momentumX,
      y: baseY + momentumY
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

  // Get capture dimensions from first event
  const firstEvent = cursorEvents[0];
  const captureWidth = firstEvent?.captureWidth || videoWidth;
  const captureHeight = firstEvent?.captureHeight || videoHeight;

  // Normalize and map cursor position to video
  const normalizedX = cursorPosition.x / captureWidth;
  const normalizedY = cursorPosition.y / captureHeight;
  let cursorX = videoOffset.x + normalizedX * videoOffset.width;
  let cursorY = videoOffset.y + normalizedY * videoOffset.height;
  
  // Update position history for motion trail calculation
  useEffect(() => {
    if (frame !== lastFrameRef.current && cursorPosition) {
      lastFrameRef.current = frame;
      
      // Add current position to history
      positionHistoryRef.current.push({
        x: cursorX,
        y: cursorY,
        time: currentTimeMs
      });
      
      // Keep only recent positions (last 100ms for trail effect)
      const cutoffTime = currentTimeMs - 100;
      positionHistoryRef.current = positionHistoryRef.current.filter(
        pos => pos.time > cutoffTime
      );
    }
  }, [frame, cursorX, cursorY, currentTimeMs, cursorPosition]);
  
  // Calculate motion velocity for blur effect
  const motionVelocity = useMemo(() => {
    const history = positionHistoryRef.current;
    if (history.length < 2) return { speed: 0, angle: 0 };
    
    const recent = history[history.length - 1];
    const prev = history[Math.max(0, history.length - 5)]; // Look back a few frames
    
    if (!recent || !prev) return { speed: 0, angle: 0 };
    
    const deltaX = recent.x - prev.x;
    const deltaY = recent.y - prev.y;
    const deltaTime = Math.max(1, recent.time - prev.time);
    
    const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    
    return { speed: Math.min(speed * 50, 20), angle }; // Cap max blur
  }, [frame]);

  // Apply cursor size from effects (default to 3.0 to match UI)
  const cursorSize = cursorEffects?.size ?? 3.0;

  // Apply cursor hotspot offset for accurate positioning
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];
  
  // The cursor hotspot offset should match how we scale the cursor image
  // The cursor image is rendered at dimensions * cursorSize
  // So the hotspot should also be scaled by cursorSize
  cursorX -= hotspot.x * cursorSize;
  cursorY -= hotspot.y * cursorSize;

  // Apply zoom transformation if needed
  if (zoom.scale > 1) {
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

    const zoomTransform = calculateZoomTransform(
      zoomBlock,
      500,
      videoOffset.width,
      videoOffset.height,
      { x: zoom.panX || 0, y: zoom.panY || 0 }
    );

    const transformedPos = applyZoomToPoint(cursorX, cursorY, videoOffset, zoomTransform);
    cursorX = transformedPos.x;
    cursorY = transformedPos.y;
  }

  // Create motion blur filter based on velocity
  const motionBlurFilter = useMemo(() => {
    const baseFilter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.25)) drop-shadow(0 1px 3px rgba(0,0,0,0.15))';
    
    if (motionVelocity.speed < 2) {
      return baseFilter;
    }
    
    // Add directional blur based on motion
    const blurAmount = Math.min(motionVelocity.speed, 8);
    return `${baseFilter} blur(${blurAmount * 0.15}px)`;
  }, [motionVelocity]);

  // Get cursor dimensions for rendering
  const dimensions = CURSOR_DIMENSIONS[cursorType];

  // Generate motion trail for smooth gliding effect
  const motionTrail = useMemo(() => {
    if (motionVelocity.speed < 3) return null;
    
    const trailCount = Math.min(Math.floor(motionVelocity.speed / 2), 5);
    const trails = [];
    
    for (let i = 1; i <= trailCount; i++) {
      const opacity = 0.15 * (1 - i / (trailCount + 1));
      const offset = i * 3;
      const offsetX = -Math.cos(motionVelocity.angle * Math.PI / 180) * offset;
      const offsetY = -Math.sin(motionVelocity.angle * Math.PI / 180) * offset;
      
      trails.push(
        <Img
          key={`trail-${i}`}
          src={getCursorImagePath(cursorType)}
          style={{
            position: 'absolute',
            left: cursorX + offsetX,
            top: cursorY + offsetY,
            width: dimensions.width * cursorSize,
            height: dimensions.height * cursorSize,
            transform: `scale(${clickScale * (1 - i * 0.1)})`,
            transformOrigin: `${CURSOR_HOTSPOTS[cursorType].x * cursorSize}px ${CURSOR_HOTSPOTS[cursorType].y * cursorSize}px`,
            opacity,
            zIndex: 99 - i,
            pointerEvents: 'none',
            filter: `blur(${i * 0.5}px)`,
            willChange: 'transform, left, top, opacity'
          }}
        />
      );
    }
    
    return trails;
  }, [motionVelocity, cursorX, cursorY, cursorType, cursorSize, clickScale]);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Motion trail for gliding effect */}
      {motionTrail}
      
      {/* Main cursor */}
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
          filter: motionBlurFilter,
          imageRendering: 'crisp-edges',
          willChange: 'transform, left, top',
          transition: 'none' // Disable CSS transitions for smoother frame-by-frame animation
        }}
      />
    </AbsoluteFill>
  );
};
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

  // Professional easing for Screen Studio quality smoothing
  const screenStudioEase = (t: number) => {
    // Custom easing that matches Screen Studio's professional feel
    if (t < 0.5) {
      return 4 * t * t * t;
    } else {
      const f = ((2 * t) - 2);
      return 1 + f * f * f / 2;
    }
  };

  // Get interpolated cursor position with professional smoothing
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    const targetTime = currentTimeMs;
    
    // Collect multiple events for better smoothing (look-ahead window)
    const windowSize = 150; // ms window for analysis
    const relevantEvents = cursorEvents.filter(e => 
      Math.abs(e.timestamp - targetTime) <= windowSize
    ).sort((a, b) => a.timestamp - b.timestamp);

    // Find surrounding events for interpolation
    let prevEvent = null;
    let nextEvent = null;
    let futureEvents = []; // Look ahead for trajectory prediction

    for (let i = 0; i < cursorEvents.length; i++) {
      const event = cursorEvents[i];
      if (event.timestamp <= targetTime) {
        prevEvent = event;
      } else if (!nextEvent) {
        nextEvent = event;
        // Collect future events for trajectory
        for (let j = i; j < Math.min(i + 3, cursorEvents.length); j++) {
          futureEvents.push(cursorEvents[j]);
        }
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

    const timeDiff = nextEvent.timestamp - prevEvent.timestamp;
    if (timeDiff === 0) {
      return {
        x: prevEvent.x,
        y: prevEvent.y
      };
    }

    // Detect movement patterns for adaptive smoothing
    const deltaX = nextEvent.x - prevEvent.x;
    const deltaY = nextEvent.y - prevEvent.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const speed = distance / timeDiff;
    
    // Adaptive smoothing based on movement type
    let smoothingFactor = 0.85; // Base smoothing
    
    // Quick movements get less smoothing to maintain responsiveness
    if (speed > 2) {
      smoothingFactor = 0.6;
    }
    // Very slow movements get maximum smoothing to eliminate shake
    else if (speed < 0.5) {
      smoothingFactor = 0.95;
    }
    
    // Handle teleports/jumps
    if (distance > 400) {
      const rawProgress = (targetTime - prevEvent.timestamp) / timeDiff;
      return rawProgress < 0.5 ? 
        { x: prevEvent.x, y: prevEvent.y } : 
        { x: nextEvent.x, y: nextEvent.y };
    }

    const rawProgress = (targetTime - prevEvent.timestamp) / timeDiff;
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    
    // Apply professional easing
    const easedProgress = screenStudioEase(clampedProgress);
    
    // Calculate predicted trajectory using future events
    let trajectoryX = deltaX / timeDiff;
    let trajectoryY = deltaY / timeDiff;
    
    if (futureEvents.length >= 2) {
      const futureVelX = (futureEvents[1].x - futureEvents[0].x) / 
                         (futureEvents[1].timestamp - futureEvents[0].timestamp);
      const futureVelY = (futureEvents[1].y - futureEvents[0].y) / 
                         (futureEvents[1].timestamp - futureEvents[0].timestamp);
      
      // Blend current and future velocities for smoother prediction
      trajectoryX = trajectoryX * 0.7 + futureVelX * 0.3;
      trajectoryY = trajectoryY * 0.7 + futureVelY * 0.3;
    }
    
    // Catmull-Rom spline for professional smoothness
    const t = easedProgress;
    const t2 = t * t;
    const t3 = t2 * t;
    
    // Calculate tangents for Catmull-Rom
    const tension = 0.5 * smoothingFactor;
    const v0x = trajectoryX * timeDiff * tension;
    const v0y = trajectoryY * timeDiff * tension;
    const v1x = trajectoryX * timeDiff * tension;
    const v1y = trajectoryY * timeDiff * tension;
    
    // Catmull-Rom coefficients
    const a = 2 * t3 - 3 * t2 + 1;
    const b = t3 - 2 * t2 + t;
    const c = -2 * t3 + 3 * t2;
    const d = t3 - t2;
    
    // Final smoothed position
    const smoothX = prevEvent.x * a + v0x * b + nextEvent.x * c + v1x * d;
    const smoothY = prevEvent.y * a + v0y * b + nextEvent.y * c + v1y * d;
    
    // Apply final smoothing filter to eliminate micro-jitter
    const alpha = smoothingFactor;
    const filteredX = prevEvent.x * (1 - alpha) + smoothX * alpha;
    const filteredY = prevEvent.y * (1 - alpha) + smoothY * alpha;

    return {
      x: smoothX,
      y: smoothY
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
  
  // Get cursor hotspot and dimensions
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];
  
  // Calculate the actual rendered size of the cursor
  const renderedWidth = dimensions.width * cursorSize;
  const renderedHeight = dimensions.height * cursorSize;

  // Track the effective zoom scale for scaling the cursor
  let effectiveZoomScale = 1;

  // Apply zoom transformation if needed
  if (zoom.scale > 1) {
    effectiveZoomScale = zoom.scale;
    
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
  
  // Apply hotspot offset WITHOUT scaling by zoom
  // The cursor position has already been transformed by zoom, so we only need
  // to offset by the rendered cursor size, not scaled again
  cursorX -= hotspot.x * renderedWidth;
  cursorY -= hotspot.y * renderedHeight;

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

  // Generate motion trail for smooth gliding effect (optimized for performance)
  const motionTrail = useMemo(() => {
    if (motionVelocity.speed < 4) return null; // Higher threshold to reduce renders
    
    const trailCount = Math.min(Math.floor(motionVelocity.speed / 3), 3); // Fewer trails for better performance
    const trails = [];
    
    for (let i = 1; i <= trailCount; i++) {
      const opacity = 0.08 * (1 - i / (trailCount + 1)); // Subtler opacity
      const offset = i * 4; // Slightly larger spacing
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
            transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
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
          transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
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
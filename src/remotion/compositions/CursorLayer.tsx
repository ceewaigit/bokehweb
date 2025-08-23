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
  
  // Heavy smoothing buffers for butter-smooth movement
  const smoothingBufferRef = useRef<Array<{x: number, y: number, time: number}>>([]);
  const filteredPositionRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const lastRawPositionRef = useRef<{x: number, y: number} | null>(null);
  const frameCountRef = useRef(0);

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

  // No need for complex filters - simple exponential smoothing works best

  // Get interpolated cursor position with ultra-heavy smoothing
  const cursorPosition = useMemo(() => {
    if (cursorEvents.length === 0) return null;

    const targetTime = currentTimeMs;
    
    // Find the raw position at current time
    let rawX = 0;
    let rawY = 0;
    let foundPosition = false;
    
    for (let i = 0; i < cursorEvents.length - 1; i++) {
      const curr = cursorEvents[i];
      const next = cursorEvents[i + 1];
      
      if (targetTime >= curr.timestamp && targetTime <= next.timestamp) {
        const t = (targetTime - curr.timestamp) / (next.timestamp - curr.timestamp);
        rawX = curr.x + (next.x - curr.x) * t;
        rawY = curr.y + (next.y - curr.y) * t;
        foundPosition = true;
        break;
      }
    }
    
    if (!foundPosition) {
      if (targetTime <= cursorEvents[0].timestamp) {
        rawX = cursorEvents[0].x;
        rawY = cursorEvents[0].y;
      } else {
        const last = cursorEvents[cursorEvents.length - 1];
        rawX = last.x;
        rawY = last.y;
      }
    }
    
    // Initialize filtered position on first frame
    if (!lastRawPositionRef.current) {
      lastRawPositionRef.current = { x: rawX, y: rawY };
      filteredPositionRef.current = { x: rawX, y: rawY };
      smoothingBufferRef.current = [];
    }
    
    // Detect large jumps (teleports)
    const lastRaw = lastRawPositionRef.current;
    const jumpDistance = Math.sqrt(
      Math.pow(rawX - lastRaw.x, 2) + Math.pow(rawY - lastRaw.y, 2)
    );
    
    if (jumpDistance > 400) {
      // Reset on large jumps
      filteredPositionRef.current = { x: rawX, y: rawY };
      smoothingBufferRef.current = [];
    } else {
      // Add to smoothing buffer
      smoothingBufferRef.current.push({ x: rawX, y: rawY, time: targetTime });
      
      // Keep buffer size limited (last 500ms of data for smoother averaging)
      const cutoffTime = targetTime - 500;
      smoothingBufferRef.current = smoothingBufferRef.current.filter(
        pos => pos.time > cutoffTime
      );
      
      if (smoothingBufferRef.current.length > 0) {
        // Apply heavy moving average with larger buffer for smoother movement
        const bufferSize = Math.min(smoothingBufferRef.current.length, 30); // Average over last 30 frames for ultra smoothness
        const recentBuffer = smoothingBufferRef.current.slice(-bufferSize);
        
        // Weighted moving average (more recent = higher weight)
        let weightedX = 0;
        let weightedY = 0;
        let totalWeight = 0;
        
        recentBuffer.forEach((pos, index) => {
          const weight = Math.pow(1.5, index); // Exponential weights
          weightedX += pos.x * weight;
          weightedY += pos.y * weight;
          totalWeight += weight;
        });
        
        const avgX = weightedX / totalWeight;
        const avgY = weightedY / totalWeight;
        
        // Simple but VERY heavy exponential smoothing is most effective
        const smoothingAlpha = 0.008; // ULTRA low alpha for maximum smoothing like skating on ice
        filteredPositionRef.current.x = filteredPositionRef.current.x + (avgX - filteredPositionRef.current.x) * smoothingAlpha;
        filteredPositionRef.current.y = filteredPositionRef.current.y + (avgY - filteredPositionRef.current.y) * smoothingAlpha;
        
        // Debug log to verify smoothing is working
        frameCountRef.current++;
        if (frameCountRef.current % 30 === 0) {
          const lag = Math.sqrt(
            Math.pow(filteredPositionRef.current.x - rawX, 2) + 
            Math.pow(filteredPositionRef.current.y - rawY, 2)
          );
          console.log('🎯 Smoothing Active:', 
            'Raw:', rawX.toFixed(0), rawY.toFixed(0),
            '→ Smooth:', filteredPositionRef.current.x.toFixed(0), filteredPositionRef.current.y.toFixed(0),
            '| Lag:', lag.toFixed(0) + 'px'
          );
        }
      }
    }
    
    lastRawPositionRef.current = { x: rawX, y: rawY };
    
    return {
      x: filteredPositionRef.current.x,
      y: filteredPositionRef.current.y
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
  
  // Calculate the base cursor position (where the cursor tip should be)
  let cursorTipX = videoOffset.x + normalizedX * videoOffset.width;
  let cursorTipY = videoOffset.y + normalizedY * videoOffset.height;
  
  // Update position history for motion trail calculation
  useEffect(() => {
    if (frame !== lastFrameRef.current && cursorPosition) {
      lastFrameRef.current = frame;
      
      // Add current position to history
      positionHistoryRef.current.push({
        x: cursorTipX,
        y: cursorTipY,
        time: currentTimeMs
      });
      
      // Keep only recent positions (last 100ms for trail effect)
      const cutoffTime = currentTimeMs - 100;
      positionHistoryRef.current = positionHistoryRef.current.filter(
        pos => pos.time > cutoffTime
      );
    }
  }, [frame, cursorTipX, cursorTipY, currentTimeMs, cursorPosition]);
  
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

  // Apply cursor size from effects (default to 4.0 to match UI)
  const cursorSize = cursorEffects?.size ?? 4.0;
  
  // Get cursor hotspot and dimensions
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];
  
  // Calculate the rendered size of the cursor (NOT scaled by zoom)
  // The cursor maintains consistent visual size regardless of zoom
  const renderedWidth = dimensions.width * cursorSize;
  const renderedHeight = dimensions.height * cursorSize;

  // Calculate cursor render position (top-left corner)
  // We need to apply hotspot offset BEFORE zoom transformation
  // because the cursor tip position needs to be transformed, not the corner
  let cursorX = cursorTipX - (hotspot.x * renderedWidth);
  let cursorY = cursorTipY - (hotspot.y * renderedHeight);

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

    // Transform ONLY the cursor tip position (not the corner)
    const transformedTip = applyZoomToPoint(cursorTipX, cursorTipY, videoOffset, zoomTransform);
    
    // Now apply the hotspot offset in screen space to get the final corner position
    cursorX = transformedTip.x - (hotspot.x * renderedWidth);
    cursorY = transformedTip.y - (hotspot.y * renderedHeight);
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
            width: renderedWidth,
            height: renderedHeight,
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
  }, [motionVelocity, cursorX, cursorY, cursorType, renderedWidth, renderedHeight, hotspot, clickScale]);

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
          width: renderedWidth,
          height: renderedHeight,
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
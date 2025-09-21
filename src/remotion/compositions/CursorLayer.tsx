import React, { useMemo, useRef, useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import type { CursorLayerProps } from './types';
import type { Clip } from '@/types/project';
import {
  CursorType,
  CURSOR_DIMENSIONS,
  CURSOR_HOTSPOTS,
  getCursorImagePath,
  electronToCustomCursor
} from '../../lib/effects/cursor-types';
import { calculateZoomTransform, applyZoomToPoint } from './utils/zoom-transform';

const getEventSourceTimestamp = (event: { sourceTimestamp?: number; timestamp: number }) =>
  typeof event.sourceTimestamp === 'number' ? event.sourceTimestamp : event.timestamp;

const mapTimelineToSourceTime = (clip: Clip | null | undefined, timelineMs: number): number => {
  if (!clip) return timelineMs;

  const sourceIn = clip.sourceIn || 0;
  const baseRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
  const periods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null;

  if (!periods) {
    const result = sourceIn + timelineMs * baseRate;
    const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate);
    return Math.max(sourceIn, Math.min(sourceOut, result));
  }

  let remainingTimeline = timelineMs;
  let currentSource = sourceIn;

  for (const period of periods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn);
    const periodEnd = Math.max(periodStart, period.sourceEndTime);

    if (currentSource < periodStart) {
      const gapDurationSource = periodStart - currentSource;
      const gapTimelineDuration = gapDurationSource / baseRate;

      if (remainingTimeline <= gapTimelineDuration) {
        const result = currentSource + remainingTimeline * baseRate;
        const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate);
        return Math.max(sourceIn, Math.min(sourceOut, result));
      }

      remainingTimeline -= gapTimelineDuration;
      currentSource = periodStart;
    }

    const effectiveSpeed = Math.max(0.0001, period.speedMultiplier);
    const periodDurationSource = periodEnd - periodStart;
    const periodTimelineDuration = periodDurationSource / effectiveSpeed;

    if (remainingTimeline <= periodTimelineDuration) {
      const result = periodStart + remainingTimeline * effectiveSpeed;
      const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate);
      return Math.max(sourceIn, Math.min(sourceOut, result));
    }

    remainingTimeline -= periodTimelineDuration;
    currentSource = periodEnd;
  }

  const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate);
  const result = currentSource + remainingTimeline * baseRate;
  return Math.max(sourceIn, Math.min(sourceOut, result));
};

export const CursorLayer: React.FC<CursorLayerProps> = ({
  cursorEvents,
  clickEvents,
  clip,
  fps,
  videoOffset,
  zoomBlocks,
  zoomState,
  videoWidth,
  videoHeight,
  cursorData
}) => {
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;
  const currentSourceTime = useMemo(() => mapTimelineToSourceTime(clip ?? null, currentTimeMs), [clip, currentTimeMs]);

  // Store previous positions for motion trail and smoothing
  const positionHistoryRef = useRef<Array<{ x: number, y: number, time: number }>>([]);
  const lastFrameRef = useRef<number>(-1);
  const lastMovementTimeRef = useRef<number>(0);
  const lastKnownPositionRef = useRef<{ x: number, y: number } | null>(null);
  const timelineIndexRef = useRef<{ index: number; time: number }>({ index: 0, time: Number.NEGATIVE_INFINITY });

  // Heavy smoothing buffers for butter-smooth movement
  const smoothingBufferRef = useRef<Array<{ x: number, y: number, time: number }>>([]);
  const filteredPositionRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastRawPositionRef = useRef<{ x: number, y: number } | null>(null);
  // Stabilize cursor type to avoid flicker (e.g., brief I-beam hovers)
  const stableCursorTypeRef = useRef<CursorType>(CursorType.ARROW);
  const pendingCursorTypeRef = useRef<{ type: CursorType; since: number } | null>(null);

  // Reset cached timeline index whenever event set changes
  useEffect(() => {
    timelineIndexRef.current = {
      index: 0,
      time: cursorEvents.length > 0 ? getEventSourceTimestamp(cursorEvents[0]) : Number.NEGATIVE_INFINITY
    };
  }, [cursorEvents]);

  const locateEventIndex = (sourceTime: number) => {
    const events = cursorEvents;
    if (events.length === 0) return 0;

    let { index, time: lastTime } = timelineIndexRef.current;
    index = Math.min(Math.max(index, 0), events.length - 1);

    const eventSourceTime = (eventIndex: number) => getEventSourceTimestamp(events[eventIndex]);

    if (sourceTime >= lastTime) {
      while (index < events.length - 1 && eventSourceTime(index + 1) <= sourceTime) {
        index++;
      }
    } else {
      while (index > 0 && eventSourceTime(index) > sourceTime) {
        index--;
      }

      if (eventSourceTime(index) > sourceTime) {
        let low = 0;
        let high = events.length - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (eventSourceTime(mid) <= sourceTime) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        index = Math.max(0, Math.min(events.length - 1, low - 1));
      }
    }

    timelineIndexRef.current = { index, time: sourceTime };
    return index;
  };

  // Determine current cursor type from events
  const cursorType = useMemo(() => {
    if (!cursorEvents || cursorEvents.length === 0) return stableCursorTypeRef.current;

    const selectedEvent = cursorEvents[locateEventIndex(currentSourceTime)] || cursorEvents[0];

    const desiredType = electronToCustomCursor(selectedEvent?.cursorType || 'default');

    // Hysteresis/debounce: only commit a type change if it persists for a small window
    const now = currentTimeMs;
    const COMMIT_DELAY_MS = 150; // prevents split-second I-beam flashes

    if (desiredType === stableCursorTypeRef.current) {
      // Same as current; clear any pending change
      pendingCursorTypeRef.current = null;
      return stableCursorTypeRef.current;
    }

    // If a different type is pending and matches, check if it's old enough to commit
    if (pendingCursorTypeRef.current && pendingCursorTypeRef.current.type === desiredType) {
      if (now - pendingCursorTypeRef.current.since >= COMMIT_DELAY_MS) {
        stableCursorTypeRef.current = desiredType;
        pendingCursorTypeRef.current = null;
      }
      return stableCursorTypeRef.current;
    }

    // Start pending window for the new desired type
    pendingCursorTypeRef.current = { type: desiredType, since: now };
    return stableCursorTypeRef.current;
  }, [cursorEvents, currentSourceTime, currentTimeMs]);

  // Check if cursor is idle
  const isIdle = useMemo(() => {
    if (!cursorData?.hideOnIdle) return false;

    // If no cursor events, never hide for idle
    if (cursorEvents.length === 0) return false;

    const idleTimeout = cursorData?.idleTimeout ?? 3000; // Default 3 seconds
    const timeSinceLastMovement = currentTimeMs - lastMovementTimeRef.current;

    return timeSinceLastMovement > idleTimeout;
  }, [currentTimeMs, cursorData?.hideOnIdle, cursorData?.idleTimeout, cursorEvents.length]);

  // Get interpolated cursor position with ultra-heavy smoothing
  const cursorPosition = useMemo(() => {
    // If no cursor events, return a default position (center of screen)
    if (cursorEvents.length === 0) {
      return { x: videoWidth / 2, y: videoHeight / 2 };
    }

    const targetTimelineTime = currentTimeMs;
    const targetSourceTime = currentSourceTime;

    const idx = locateEventIndex(targetSourceTime);
    const currEvent = cursorEvents[idx];
    const nextEvent = idx < cursorEvents.length - 1 ? cursorEvents[idx + 1] : undefined;

    const currSourceTime = getEventSourceTimestamp(currEvent);
    const nextSourceTime = nextEvent ? getEventSourceTimestamp(nextEvent) : undefined;

    let rawX = currEvent.x;
    let rawY = currEvent.y;

    if (
      nextEvent &&
      typeof nextSourceTime === 'number' &&
      nextSourceTime > currSourceTime &&
      targetSourceTime >= currSourceTime &&
      targetSourceTime <= nextSourceTime
    ) {
      const t = (targetSourceTime - currSourceTime) / (nextSourceTime - currSourceTime);
      rawX = currEvent.x + (nextEvent.x - currEvent.x) * t;
      rawY = currEvent.y + (nextEvent.y - currEvent.y) * t;
    } else if (targetSourceTime < currSourceTime && cursorEvents.length > 0) {
      const firstEvent = cursorEvents[0];
      rawX = firstEvent.x;
      rawY = firstEvent.y;
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

    if (jumpDistance > 300) {
      // Reset on large jumps
      filteredPositionRef.current = { x: rawX, y: rawY };
      smoothingBufferRef.current = [];
    } else {
      // Add to smoothing buffer
      smoothingBufferRef.current.push({ x: rawX, y: rawY, time: targetTimelineTime });

      // Keep buffer size limited (last 150ms of data)
      const cutoffTime = targetTimelineTime - 150;
      smoothingBufferRef.current = smoothingBufferRef.current.filter(
        pos => pos.time > cutoffTime
      );

      if (smoothingBufferRef.current.length > 0) {
        // Apply moving average with moderate buffer for smooth but responsive movement
        const bufferSize = Math.min(smoothingBufferRef.current.length, 8); // Average over last 8 frames
        const recentBuffer = smoothingBufferRef.current.slice(-bufferSize);

        // Weighted moving average (more recent = higher weight)
        let weightedX = 0;
        let weightedY = 0;
        let totalWeight = 0;

        recentBuffer.forEach((pos, index) => {
          const weight = Math.pow(2.0, index); // Stronger exponential weights for more recent positions
          weightedX += pos.x * weight;
          weightedY += pos.y * weight;
          totalWeight += weight;
        });

        const avgX = weightedX / totalWeight;
        const avgY = weightedY / totalWeight;

        // Exponential smoothing with adaptive alpha based on movement speed
        const movementDelta = Math.sqrt(
          Math.pow(avgX - filteredPositionRef.current.x, 2) +
          Math.pow(avgY - filteredPositionRef.current.y, 2)
        );

        // Adaptive smoothing: faster response for large movements, smoother for small movements
        let smoothingAlpha = 0.12; // Base smoothing for normal movement
        if (movementDelta < 10) {
          smoothingAlpha = 0.08; // Heavy smoothing for tiny movements (removes jitter)
        } else if (movementDelta > 100) {
          smoothingAlpha = 0.25; // Faster response for large movements
        }
        filteredPositionRef.current.x = filteredPositionRef.current.x + (avgX - filteredPositionRef.current.x) * smoothingAlpha;
        filteredPositionRef.current.y = filteredPositionRef.current.y + (avgY - filteredPositionRef.current.y) * smoothingAlpha;
      }
    }

    // Check for movement to update idle tracking
    if (lastKnownPositionRef.current) {
      const rawMovement = Math.sqrt(
        Math.pow(rawX - lastKnownPositionRef.current.x, 2) +
        Math.pow(rawY - lastKnownPositionRef.current.y, 2)
      );

      // If cursor moved more than 2 pixels in raw position, update last movement time
      if (rawMovement > 2) {
        lastMovementTimeRef.current = currentTimeMs;
      }
    } else {
      // Initialize on first frame
      lastMovementTimeRef.current = currentTimeMs;
    }

    // Update references for next frame
    lastRawPositionRef.current = { x: rawX, y: rawY };
    lastKnownPositionRef.current = { x: rawX, y: rawY };

    // Clamp the final position to stay within capture bounds
    const clampedX = Math.max(0, Math.min(videoWidth, filteredPositionRef.current.x));
    const clampedY = Math.max(0, Math.min(videoHeight, filteredPositionRef.current.y));

    return {
      x: clampedX,
      y: clampedY
    };
  }, [cursorEvents, currentTimeMs, currentSourceTime]);

  // Check for active click animation (only if click effects are enabled)
  const activeClick = useMemo(() => {
    // Check if click effects are enabled
    if (!cursorData?.clickEffects) return null;

    return clickEvents.find(click => {
      const clickDuration = 300; // ms for click animation
      return currentTimeMs >= click.timestamp &&
        currentTimeMs <= click.timestamp + clickDuration;
    });
  }, [clickEvents, currentTimeMs, cursorData?.clickEffects]);

  // Calculate click animation scale
  const clickScale = useMemo(() => {
    if (!activeClick) return 1;
    const clickProgress = Math.min(1, (currentTimeMs - activeClick.timestamp) / 200);
    // Click animation - shrinks to 0.8 then returns to normal
    if (clickProgress < 0.4) {
      // Quick shrink phase
      return 1 - (clickProgress / 0.4) * 0.2; // Shrink to 0.8
    } else {
      // Return to normal phase
      const returnProgress = (clickProgress - 0.4) / 0.6;
      return 0.8 + returnProgress * 0.2; // Grow from 0.8 back to 1.0
    }
  }, [activeClick, currentTimeMs]);

  // Get capture dimensions from first event
  const firstEvent = cursorEvents[0];
  const captureWidth = firstEvent?.captureWidth || videoWidth;
  const captureHeight = firstEvent?.captureHeight || videoHeight;

  // Normalize cursor position (0-1 range within the capture area)
  // Both cursorPosition.x/y and captureWidth/captureHeight are in physical pixels for consistency
  // Do not clamp; allow positions outside the capture area to show sides
  const normalizedX = cursorPosition ? (cursorPosition.x / captureWidth) : 0;
  const normalizedY = cursorPosition ? (cursorPosition.y / captureHeight) : 0;

  // Calculate the cursor position within the video content area (before zoom)
  // Simply map the normalized position to the video display area
  const cursorInVideoX = normalizedX * videoOffset.width;
  const cursorInVideoY = normalizedY * videoOffset.height;

  // Initialize cursor tip position in screen coordinates
  let cursorTipX = videoOffset.x + cursorInVideoX;
  let cursorTipY = videoOffset.y + cursorInVideoY;

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
  const cursorSize = cursorData?.size ?? 4.0;

  // Get cursor hotspot and dimensions
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];

  // Calculate the rendered size of the cursor (NOT scaled by zoom)
  // The cursor maintains consistent visual size regardless of zoom
  const renderedWidth = dimensions.width * cursorSize;
  const renderedHeight = dimensions.height * cursorSize;

  // Initialize cursor position
  let cursorX = cursorTipX;
  let cursorY = cursorTipY;

  // Apply zoom transformation EXACTLY like VideoLayer does
  if (zoomBlocks && zoomBlocks.length > 0) {
    // Find active zoom block - same as VideoLayer
    const activeBlock = zoomBlocks.find(
      block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
    );

    if (activeBlock) {
      // Calculate zoom transformation using the EXACT same parameters as VideoLayer
      // Use zoomState's x,y which are the mouse position at zoom start
      const zoomTransform = calculateZoomTransform(
        activeBlock,
        currentTimeMs,  // Use actual time, not fixed 500
        videoOffset.width,  // Use video dimensions, same as VideoLayer
        videoOffset.height,
        zoomState ? { x: zoomState.x, y: zoomState.y } : { x: 0.5, y: 0.5 },  // Use zoom center position
        zoomState ? zoomState.scale : undefined
      );

      // Apply the zoom to the cursor position
      const transformedPos = applyZoomToPoint(cursorTipX, cursorTipY, videoOffset, zoomTransform);
      cursorX = transformedPos.x;
      cursorY = transformedPos.y;
    }
  }


  // Apply hotspot offset AFTER transformation
  // This positions the cursor image so the hotspot aligns with the transformed tip position
  cursorX -= hotspot.x * renderedWidth;
  cursorY -= hotspot.y * renderedHeight;

  // Create motion blur filter based on velocity
  const motionBlurFilter = useMemo(() => {
    const baseFilter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.25)) drop-shadow(0 1px 3px rgba(0,0,0,0.15))';

    // Keep main cursor sharp at all times; rely on motion trails for perceived blur
    return baseFilter;
  }, []);

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

  // Early return if cursor is hidden or idle (after all hooks)
  if (!cursorPosition || isIdle) return null;

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

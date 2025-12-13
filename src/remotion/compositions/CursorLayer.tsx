import React, { useMemo, useRef, useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame, delayRender, continueRender, getRemotionEnvironment } from 'remotion';
import type { Effect, CursorEffectData, MouseEvent, ClickEvent, Recording } from '@/types/project';
import {
  CursorType,
  CURSOR_DIMENSIONS,
  CURSOR_HOTSPOTS,
  getCursorImagePath
} from '../../lib/effects/cursor-types';
import { calculateCursorState, type CursorState } from '../../lib/effects/utils/cursor-calculator';
import { normalizeClickEvents, normalizeMouseEvents } from './utils/event-normalizer';
import { useVideoPosition } from '../context/VideoPositionContext';
import { useTimeContext } from '../context/TimeContext';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import { applyCssTransformToPoint } from './utils/transform-point';
import { buildFrameLayout } from '@/lib/timeline/frame-layout';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';

// SINGLETON: Global cursor image cache - prevents redundant loading across all CursorLayer instances
class CursorImagePreloader {
  private static instance: CursorImagePreloader;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  private constructor() { }

  static getInstance(): CursorImagePreloader {
    if (!CursorImagePreloader.instance) {
      CursorImagePreloader.instance = new CursorImagePreloader();
    }
    return CursorImagePreloader.instance;
  }

  isPreloaded(): boolean {
    return this.isLoaded;
  }

  preload(): Promise<void> {
    // If already loaded, return immediately
    if (this.isLoaded) {
      return Promise.resolve();
    }

    // If currently loading, return the existing promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    const cursorTypesToPreload = [
      CursorType.ARROW,
      CursorType.IBEAM,
      CursorType.POINTING_HAND,
      CursorType.CLOSED_HAND,
      CursorType.OPEN_HAND,
      CursorType.CROSSHAIR
    ];

    const imagePromises = cursorTypesToPreload.map((type) => {
      return new Promise<void>((resolve) => {
        const src = getCursorImagePath(type);
        const img = new Image();

        // Also fetch to ensure browser cache (though Remotion may not use it)
        fetch(src, { cache: 'force-cache' }).catch(() => { });

        img.onload = () => {
          img.decode().then(() => resolve()).catch(() => resolve());
        };
        img.onerror = () => {
          console.warn(`Failed to preload cursor: ${type}`);
          resolve();
        };
        img.src = src;
      });
    });

    this.loadingPromise = Promise.all(imagePromises).then(() => {
      this.isLoaded = true;
      this.loadingPromise = null; // Clear the promise after loading
    });

    return this.loadingPromise;
  }
}

export interface CursorLayerProps {
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
}

export const CursorLayer: React.FC<CursorLayerProps> = ({
  effects,
  videoWidth,
  videoHeight
}) => {
  const { fps, clips, getRecording } = useTimeContext();
  const { isRendering } = getRemotionEnvironment();

  // Get ACTUAL video position from SharedVideoController (fixes coordinate mismatch!)
  const videoPositionContext = useVideoPosition();

  const frame = useCurrentFrame();

  const sortedClips = useMemo(() => {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
  }, [clips]);

  const frameLayout = useMemo(() => buildFrameLayout(sortedClips, fps), [sortedClips, fps]);

  const activeClipData = useMemo(() => {
    return getActiveClipDataAtFrame({
      frame,
      frameLayout,
      fps,
      effects,
      getRecording,
    });
  }, [effects, fps, frame, frameLayout, getRecording]);

  const prevClipData = useMemo(() => {
    if (frame <= 0) return null;
    return getActiveClipDataAtFrame({
      frame: frame - 1,
      frameLayout,
      fps,
      effects,
      getRecording,
    });
  }, [effects, fps, frame, frameLayout, getRecording]);

  const recording: Recording | null = activeClipData?.recording ?? null;
  const recordingId = recording?.id ?? null;

  const cursorEffect = useMemo(() => {
    return activeClipData ? EffectsFactory.getCursorEffect(activeClipData.effects) : undefined;
  }, [activeClipData]);

  const cursorData = (cursorEffect?.data as CursorEffectData | undefined);

  const rawCursorEvents = ((recording?.metadata as any)?.mouseEvents || []) as MouseEvent[];
  const rawClickEvents = ((recording?.metadata as any)?.clickEvents || []) as ClickEvent[];

  const cursorEvents = useMemo(() => normalizeMouseEvents(rawCursorEvents), [rawCursorEvents]);
  const clickEvents = useMemo(() => normalizeClickEvents(rawClickEvents), [rawClickEvents]);

  const currentSourceTime = activeClipData?.sourceTimeMs ?? 0;
  const prevSourceTimeMs =
    prevClipData?.recording?.id && recordingId && prevClipData.recording.id === recordingId
      ? prevClipData.sourceTimeMs
      : 0;

  // Cache cursor states by SOURCE TIME (milliseconds, not frame numbers)
  // This prevents cursor blinking during sped-up playback
  const frameStateCacheRef = useRef<Map<number, CursorState>>(new Map());
  const positionHistoryRef = useRef<Array<{ x: number, y: number, time: number }>>([]);
  const lastFrameRef = useRef<number>(-1);

  // SINGLETON: Pre-cache all cursor images once across all CursorLayer instances
  useEffect(() => {
    const preloader = CursorImagePreloader.getInstance();

    // Early return if already loaded (avoids unnecessary delayRender call)
    if (preloader.isPreloaded()) return;

    const handle = delayRender('Preloading cursor images (singleton)');

    preloader.preload()
      .then(() => {
        continueRender(handle);
      })
      .catch((err) => {
        console.error('Error preloading cursor images:', err);
        continueRender(handle);
      });
  }, []);

  const cursorState = useMemo(() => {
    const cache = frameStateCacheRef.current;

    // DETERMINISTIC CACHING: Use SOURCE TIME (ms) as cache key
    // Use Math.round() for consistent rounding (matches lookup below)
    const cacheKey = Math.round(currentSourceTime);

    // Check if already cached
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prevCacheKey = Math.round(prevSourceTimeMs);
    const previousState =
      prevClipData?.recording?.id && recordingId && prevClipData.recording.id === recordingId
        ? cache.get(prevCacheKey)
        : undefined;

    // Compute with previousState if available (fast path, ~90% faster)
    // Falls back to simulateSmoothingWithHistory only on true cache misses
    const newState = calculateCursorState(
      cursorData,
      cursorEvents,
      clickEvents,
      currentSourceTime,
      previousState, // Use cached state when available
      fps,
      isRendering
    );

    cache.set(cacheKey, newState);
    return newState;
  }, [clickEvents, cursorData, cursorEvents, currentSourceTime, fps, isRendering, prevClipData?.recording?.id, prevSourceTimeMs, recordingId]);

  useEffect(() => {
    frameStateCacheRef.current.clear();
  }, [cursorData, cursorEvents, clickEvents, fps]); // Removed clip?.id to prevent cache clear on split clips

  // Extract values from cursor state
  const cursorType = cursorState.type;
  const cursorPosition = cursorState.opacity > 0 ? { x: cursorState.x, y: cursorState.y } : null;

  // Calculate click animation scale from cursor state
  const clickScale = useMemo(() => {
    // Find most recent active click effect
    const recentClick = cursorState.clickEffects[0];
    if (!recentClick) return 1;

    const clickProgress = recentClick.progress;
    // Click animation - shrinks to 0.8 then returns to normal
    if (clickProgress < 0.4) {
      // Quick shrink phase
      return 1 - (clickProgress / 0.4) * 0.2; // Shrink to 0.8
    } else {
      // Return to normal phase
      const returnProgress = (clickProgress - 0.4) / 0.6;
      return 0.8 + returnProgress * 0.2; // Grow from 0.8 back to 1.0
    }
  }, [cursorState.clickEffects]);

  // Use SHARED video offset from SharedVideoController (fixes coordinate mismatch!)
  // This ensures cursor uses the EXACT SAME position as the video element
  const videoOffset = useMemo(() => {
    return {
      x: videoPositionContext.offsetX,
      y: videoPositionContext.offsetY,
      width: videoPositionContext.drawWidth,
      height: videoPositionContext.drawHeight,
    };
  }, [videoPositionContext.offsetX, videoPositionContext.offsetY, videoPositionContext.drawWidth, videoPositionContext.drawHeight]);

  // Get capture dimensions from first event - this is the SSOT for cursor coordinates
  // The cursor coordinates were recorded relative to these dimensions, so we MUST use them
  const firstEvent = cursorEvents[0];
  const captureWidth = firstEvent?.captureWidth ?? videoPositionContext.videoWidth;
  const captureHeight = firstEvent?.captureHeight ?? videoPositionContext.videoHeight;

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
        time: currentSourceTime
      });

      // Keep only recent positions (last 100ms for trail effect)
      const cutoffTime = currentSourceTime - 100;
      positionHistoryRef.current = positionHistoryRef.current.filter(
        pos => pos.time > cutoffTime
      );
    }
  }, [frame, cursorTipX, cursorTipY, cursorPosition, currentSourceTime]);

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

  // Apply cursor size from cursor state
  const cursorSize = cursorState.scale;

  // Get cursor hotspot and dimensions
  const hotspot = CURSOR_HOTSPOTS[cursorType];
  const dimensions = CURSOR_DIMENSIONS[cursorType];

  // Calculate cursor size to be TRULY RESOLUTION-AGNOSTIC.
  //
  // Problem: When we scale cursor by (drawWidth / sourceWidth), higher-resolution
  // source videos (4K, 1440p) produce smaller cursors because the denominator is larger.
  // For example: 960/1920 = 0.5 (1080p) vs 960/3840 = 0.25 (4K).
  //
  // Solution: Use a FIXED 1080p reference (1920px) as the denominator.
  // This makes cursor size depend ONLY on the display width, not source resolution.
  //
  // The cursor is designed at 1080p scale, so:
  // - At 1080p composition (1920 wide): scale = 1.0
  // - At 720p composition (1280 wide): scale = 0.67
  // - At 480p composition (854 wide): scale = 0.44
  //
  // This ensures the cursor appears the same visual size whether the source video
  // is 720p, 1080p, 4K, 8K, or any resolution - only the preview/export dimensions matter.
  const REFERENCE_WIDTH = 1920; // 1080p reference - cursor is designed at this scale

  const videoDisplayScale = useMemo(() => {
    // Use drawWidth (actual display size) divided by fixed reference
    // This makes sizing independent of source video resolution
    return videoOffset.width / REFERENCE_WIDTH;
  }, [videoOffset.width]);

  // Calculate the rendered size of the cursor - fixed size regardless of source resolution
  const renderedWidth = dimensions.width * cursorSize * videoDisplayScale;
  const renderedHeight = dimensions.height * cursorSize * videoDisplayScale;

  // Initialize cursor position
  let cursorX = cursorTipX;
  let cursorY = cursorTipY;

  // Apply the EXACT same CSS transform string as the video element.
  // This keeps ordering correct under combinations of zoom + 3D (perspective/tilt/skew).
  if (videoPositionContext.contentTransform) {
    const originX = videoOffset.x + videoOffset.width / 2;
    const originY = videoOffset.y + videoOffset.height / 2;
    const transformed = applyCssTransformToPoint(
      cursorX,
      cursorY,
      originX,
      originY,
      videoPositionContext.contentTransform
    );
    cursorX = transformed.x;
    cursorY = transformed.y;
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
    if (!cursorData || cursorData.gliding) return null;
    if (motionVelocity.speed < 4) return null; // Higher threshold to reduce renders

    const trailCount = Math.min(Math.floor(motionVelocity.speed / 3), 3); // Fewer trails for better performance
    const trails = [];

    for (let i = 1; i <= trailCount; i++) {
      const opacity = cursorState.opacity * (0.08 * (1 - i / (trailCount + 1))); // Subtler opacity
      const offset = i * 4; // Slightly larger spacing
      const offsetX = -Math.cos(motionVelocity.angle * Math.PI / 180) * offset;
      const offsetY = -Math.sin(motionVelocity.angle * Math.PI / 180) * offset;

      trails.push(
        <div
          key={`trail-${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${cursorX + offsetX}px, ${cursorY + offsetY}px, 0)`,
            opacity,
            zIndex: 99 - i,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
          }}
        >
          <Img
            src={getCursorImagePath(cursorType)}
            style={{
              width: renderedWidth,
              height: renderedHeight,
              transform: `scale(${clickScale * (1 - i * 0.1)})`,
              transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
              filter: `blur(${i * 0.5}px)`,
              willChange: 'transform',
            }}
          />
        </div>
      );
    }

    return trails;
  }, [motionVelocity, cursorX, cursorY, cursorType, renderedWidth, renderedHeight, hotspot, clickScale, cursorData, cursorState.opacity]);

  // Don't unmount when hidden - keep component mounted to prevent blinking
  // Instead, return transparent AbsoluteFill
  // Check if effect is enabled AND if cursor should be visible based on idle/position
  const shouldShowCursor = cursorEffect?.enabled !== false && cursorData && cursorPosition;

  if (!shouldShowCursor) {
    return <AbsoluteFill style={{ opacity: 0, pointerEvents: 'none', zIndex: 200 }} />;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 200 }}>
      {/* Motion trail for gliding effect */}
      {motionTrail}

      {/* Main cursor */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate3d(${cursorX}px, ${cursorY}px, 0)`,
          opacity: cursorState.opacity,
          zIndex: 100,
          pointerEvents: 'none',
          willChange: 'transform, opacity',
        }}
      >
        <Img
          src={getCursorImagePath(cursorType)}
          style={{
            width: renderedWidth,
            height: renderedHeight,
            transform: `scale(${clickScale})`,
            transformOrigin: `${hotspot.x * renderedWidth}px ${hotspot.y * renderedHeight}px`,
            filter: motionBlurFilter,
            imageRendering: 'auto',
            willChange: 'transform',
            transition: 'none' // Disable CSS transitions for smoother frame-by-frame animation
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

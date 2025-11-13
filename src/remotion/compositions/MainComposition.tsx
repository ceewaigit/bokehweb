import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import { KeystrokeLayer } from './KeystrokeLayer';
import type { MainCompositionProps } from './types';
import type { ZoomBlock } from '@/types/project';
import { EffectType } from '@/types/project';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale } from './utils/zoom-transform';
import { CinematicScrollCalculator } from '@/lib/effects/cinematic-scroll';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import { getSourceTimeForFrame } from './utils/source-time';

interface ZoomFrameState {
  blockId?: string;
  scale: number;
  x: number;
  y: number;
  panX: number;
  panY: number;
  timestamp: number;
}

const DEFAULT_ZOOM_STATE: ZoomFrameState = {
  scale: 1,
  x: 0.5,
  y: 0.5,
  panX: 0,
  panY: 0,
  timestamp: 0
};

const clampZoomCenter = (value: number) => Math.max(0.02, Math.min(0.98, value));

const easeOutCubic = (t: number) => {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
};

const computeAxisTarget = (
  currentCenter: number,
  focus: number | null | undefined,
  safeHalfExtent: number
): { target: number; needsAdjustment: boolean } => {
  if (typeof focus !== 'number') {
    return { target: currentCenter, needsAdjustment: false };
  }

  const safeMin = currentCenter - safeHalfExtent;
  const safeMax = currentCenter + safeHalfExtent;

  if (focus < safeMin) {
    return { target: focus + safeHalfExtent, needsAdjustment: true };
  }
  if (focus > safeMax) {
    return { target: focus - safeHalfExtent, needsAdjustment: true };
  }

  return { target: currentCenter, needsAdjustment: false };
};

const smoothAxisTowardTarget = (
  currentCenter: number,
  targetCenter: number,
  safeHalfExtent: number,
  needsAdjustment: boolean
): number => {
  if (!needsAdjustment) {
    return currentCenter;
  }

  const delta = targetCenter - currentCenter;
  if (Math.abs(delta) < 0.0001) {
    return targetCenter;
  }

  const normalizedDelta = Math.min(1, Math.abs(delta) / Math.max(safeHalfExtent, 0.0001));
  const response = 0.12 + (0.45 - 0.12) * easeOutCubic(normalizedDelta);
  return currentCenter + delta * response;
};
import { normalizeClickEvents, normalizeMouseEvents } from './utils/event-normalizer';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  nextClip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents,
  scrollEvents,
  videoWidth,
  videoHeight,
  frameOffset = 0
}) => {
  const normalizedCursorEvents = useMemo(() => normalizeMouseEvents(cursorEvents), [cursorEvents]);
  const normalizedClickEvents = useMemo(() => normalizeClickEvents(clickEvents), [clickEvents]);

  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const absoluteFrame = frameOffset > 0 && frame < frameOffset
    ? frame + frameOffset
    : frame;

  const sourceTimeMs = useMemo(
    () => getSourceTimeForFrame(absoluteFrame, fps, clip),
    [absoluteFrame, fps, clip]
  );

  const resolveSourceTimeForFrame = useCallback((frameIndex: number) => {
    return getSourceTimeForFrame(frameIndex, fps, clip);
  }, [clip, fps]);

  const zoomStateCacheRef = useRef<Map<number, ZoomFrameState>>(new Map());

  const sourceIn = clip?.sourceIn ?? 0;
  const sourceOut = (clip?.sourceOut != null && isFinite(clip.sourceOut))
    ? clip.sourceOut
    : (clip ? sourceIn + clip.duration * (clip.playbackRate || 1) : Number.MAX_SAFE_INTEGER);

  // Extract active effects from the array
  // Effects should be in source space for consistent comparison
  const activeEffects = effects?.filter(e =>
    e.enabled &&
    sourceTimeMs >= e.startTime &&
    sourceTimeMs <= e.endTime
  ) || [];

  // Find specific effect types using EffectsFactory
  const backgroundEffect = EffectsFactory.getBackgroundEffect(activeEffects);
  const cursorEffect = EffectsFactory.getCursorEffect(activeEffects);
  const keystrokeEffect = EffectsFactory.getKeystrokeEffect(activeEffects);
  const zoomEffects = EffectsFactory.getZoomEffects(activeEffects);


  // Extract background padding using type-safe getter
  const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;
  const padding = backgroundData?.padding || 0;
  const videoPosition = calculateVideoPosition(width, height, videoWidth, videoHeight, padding);

  // Convert zoom effects to zoom blocks - effects are already in source space
  const zoomEnabled = zoomEffects.length > 0;
  const zoomBlocks: ZoomBlock[] = zoomEffects.map(effect => {
    const data = EffectsFactory.getZoomData(effect) || { scale: 2, targetX: 0.5, targetY: 0.5, introMs: 300, outroMs: 300, smoothing: 0.1 };
    // Effects are already in source space, use times directly
    return {
      id: effect.id,
      startTime: effect.startTime,  // Source space
      endTime: effect.endTime,      // Source space
      scale: data.scale ?? 2,
      targetX: data.targetX,
      targetY: data.targetY,
      introMs: data.introMs,
      outroMs: data.outroMs,
      smoothing: data.smoothing
    };
  });


  const computeZoomStateForFrame = useCallback((frameIndex: number, previousState?: ZoomFrameState): ZoomFrameState => {
    const sourceTimeForFrame = resolveSourceTimeForFrame(frameIndex);

    if (!zoomEnabled || !zoomBlocks || zoomBlocks.length === 0) {
      return { ...DEFAULT_ZOOM_STATE, timestamp: sourceTimeForFrame };
    }

    const activeBlock = zoomBlocks.find(
      (block) => sourceTimeForFrame >= block.startTime && sourceTimeForFrame <= block.endTime
    );

    if (!activeBlock) {
      return { ...DEFAULT_ZOOM_STATE, timestamp: sourceTimeForFrame };
    }

    const blockDuration = Math.max(1, activeBlock.endTime - activeBlock.startTime);
    const elapsed = sourceTimeForFrame - activeBlock.startTime;
    const introMs = activeBlock.introMs || 500;
    const outroMs = activeBlock.outroMs || 500;
    const targetScaleForBlock = activeBlock.scale || 2;
    const scale = calculateZoomScale(
      elapsed,
      blockDuration,
      targetScaleForBlock,
      introMs,
      outroMs
    );

    const captureWidth = videoWidth || 1;
    const captureHeight = videoHeight || 1;

    const predictiveMousePos = zoomPanCalculator.predictMousePosition(normalizedCursorEvents, sourceTimeForFrame, 220);
    const currentMousePos = zoomPanCalculator.interpolateMousePosition(normalizedCursorEvents, sourceTimeForFrame);
    const fallbackStartMouse = zoomPanCalculator.interpolateMousePosition(normalizedCursorEvents, activeBlock.startTime);
    const focusPoint = predictiveMousePos || currentMousePos || fallbackStartMouse;
    const normalizedFocus = focusPoint
      ? {
        x: focusPoint.x / captureWidth,
        y: focusPoint.y / captureHeight
      }
      : null;

    const previousIsSameBlock = previousState && previousState.blockId === activeBlock.id;
    let baseCenterX = previousIsSameBlock ? previousState!.x : (normalizedFocus?.x ?? 0.5);
    let baseCenterY = previousIsSameBlock ? previousState!.y : (normalizedFocus?.y ?? 0.5);

    baseCenterX = clampZoomCenter(baseCenterX);
    baseCenterY = clampZoomCenter(baseCenterY);

    const viewHalfWidth = 0.5 / Math.max(scale, 1);
    const viewHalfHeight = 0.5 / Math.max(scale, 1);
    const safeHalfWidth = viewHalfWidth * 0.6;
    const safeHalfHeight = viewHalfHeight * 0.6;

    const axisX = computeAxisTarget(baseCenterX, normalizedFocus?.x, safeHalfWidth);
    const axisY = computeAxisTarget(baseCenterY, normalizedFocus?.y, safeHalfHeight);

    const nextCenterX = clampZoomCenter(
      smoothAxisTowardTarget(baseCenterX, axisX.target, safeHalfWidth, axisX.needsAdjustment)
    );
    const nextCenterY = clampZoomCenter(
      smoothAxisTowardTarget(baseCenterY, axisY.target, safeHalfHeight, axisY.needsAdjustment)
    );

    return {
      blockId: activeBlock.id,
      scale,
      x: nextCenterX,
      y: nextCenterY,
      panX: 0,
      panY: 0,
      timestamp: sourceTimeForFrame
    };
  }, [resolveSourceTimeForFrame, normalizedCursorEvents, videoWidth, videoHeight, zoomBlocks, zoomEnabled]);

  const completeZoomState = useMemo(() => {
    const cache = zoomStateCacheRef.current;
    const targetFrame = Math.max(0, Math.floor(absoluteFrame));

    const cached = cache.get(targetFrame);
    if (cached) {
      return cached;
    }

    let startFrame = targetFrame;
    while (startFrame > 0 && !cache.has(startFrame - 1)) {
      startFrame -= 1;
    }

    let previousState: ZoomFrameState | undefined = startFrame > 0 ? cache.get(startFrame - 1) : cache.get(startFrame);

    for (let frameIdx = startFrame; frameIdx <= targetFrame; frameIdx++) {
      const existing = cache.get(frameIdx);
      if (existing) {
        previousState = existing;
        continue;
      }

      const computed = computeZoomStateForFrame(frameIdx, previousState);
      cache.set(frameIdx, computed);
      previousState = computed;
    }

    return cache.get(targetFrame) ?? DEFAULT_ZOOM_STATE;
  }, [absoluteFrame, computeZoomStateForFrame]);

  useEffect(() => {
    zoomStateCacheRef.current.clear();
  }, [zoomBlocks, normalizedCursorEvents, videoWidth, videoHeight, clip?.id]);

  // Initialize cinematic scroll calculator
  const scrollCalculatorRef = useRef<{ calculator: CinematicScrollCalculator; preset: string } | null>(null);

  // Compute cinematic scroll effects when enabled
  const cinematicScrollState = useMemo(() => {
    const anno = (effects || []).find(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled)
    if (!anno || !scrollEvents || scrollEvents.length === 0) {
      scrollCalculatorRef.current = null;
      return null;
    }

    // Get preset from annotation data or use 'medium' as default
    const preset = (anno.data as any)?.preset || 'medium';

    // Create or update calculator when preset changes
    if (!scrollCalculatorRef.current || scrollCalculatorRef.current.preset !== preset) {
      scrollCalculatorRef.current = {
        calculator: new CinematicScrollCalculator({ preset }),
        preset
      };
    }

    // Update and get current state
    const state = scrollCalculatorRef.current.calculator.update(scrollEvents, sourceTimeMs);

    // Get parallax layers for multi-depth effect
    const layers = scrollCalculatorRef.current.calculator.getParallaxLayers(state);

    return { state, layers };
  }, [effects, scrollEvents, sourceTimeMs])



  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Layer */}
      {backgroundEffect && (
        <Sequence from={0}>
          <BackgroundLayer
            backgroundData={EffectsFactory.getBackgroundData(backgroundEffect) || undefined}
            videoWidth={width}
            videoHeight={height}
          />
        </Sequence>
      )}

      {/* Video Layer with effects - Always render to prevent unmounting */}
      <Sequence from={0}>
        <VideoLayer
          videoUrl={videoUrl || ''}
          clip={clip}
          nextClip={nextClip}
          effects={effects}
          zoomBlocks={zoomBlocks}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          zoomCenter={zoomEnabled ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
          cinematicScrollState={cinematicScrollState}
          computedScale={zoomEnabled ? completeZoomState.scale : undefined}
          sourceTimeMs={sourceTimeMs}
          frameOffset={frameOffset}
        />
      </Sequence>

      {/* Keystroke Layer - Show when enabled and keystrokes exist */}
      {keystrokeEffect && keystrokeEvents && keystrokeEvents.length > 0 && (
        <Sequence from={0}>
          <KeystrokeLayer
            keyboardEvents={keystrokeEvents}
            settings={EffectsFactory.getKeystrokeData(keystrokeEffect) || undefined}
          />
        </Sequence>
      )}

      {/* Cursor Layer - Only show when explicitly enabled */}
      {cursorEffect && (
        <Sequence from={0}>
          <CursorLayer
            cursorEvents={normalizedCursorEvents}
            clickEvents={normalizedClickEvents}
            clip={clip}
            fps={fps}
            videoOffset={{
              x: videoPosition.offsetX,
              y: videoPosition.offsetY,
              width: videoPosition.drawWidth,
              height: videoPosition.drawHeight
            }}
            zoomBlocks={zoomBlocks}
            zoomState={completeZoomState}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            cursorData={EffectsFactory.getCursorData(cursorEffect) || undefined}
            frameOffset={frameOffset}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};

import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import { KeystrokeLayer } from './KeystrokeLayer';
import type { MainCompositionProps } from './types';
import type { ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ZoomBlock } from '@/types/project';
import { EffectType } from '@/types/project';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale } from './utils/zoom-transform';
import { CinematicScrollCalculator } from '@/lib/effects/cinematic-scroll';
import { EffectsFactory } from '@/lib/effects/effects-factory';

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
  videoHeight
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Track zoom state per block for consistency
  const zoomStateRef = useRef<Map<string, {
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
    initialized: boolean
    scale?: number;
  }>>(new Map());

  // Calculate current time in milliseconds (clip-relative)
  const currentTimeMs = (frame / fps) * 1000;

  // Extract active effects from the array
  // Effects are already converted to clip-relative times
  const activeEffects = effects?.filter(e =>
    e.enabled &&
    currentTimeMs >= e.startTime &&
    currentTimeMs <= e.endTime
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

  // Convert zoom effects to zoom blocks
  const zoomEnabled = zoomEffects.length > 0;
  const zoomBlocks: ZoomBlock[] = zoomEffects.map(effect => {
    const data = EffectsFactory.getZoomData(effect) || { scale: 2, targetX: 0.5, targetY: 0.5, introMs: 300, outroMs: 300, smoothing: 0.1 };
    return {
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      scale: data.scale ?? 2,
      targetX: data.targetX,
      targetY: data.targetY,
      introMs: data.introMs,
      outroMs: data.outroMs,
      smoothing: data.smoothing
    };
  });


  // Calculate complete zoom state including dynamic pan
  const completeZoomState = useMemo(() => {
    let zoomState = { scale: 1, x: 0.5, y: 0.5, panX: 0, panY: 0 };

    if (zoomEnabled && clip) {
      // Choose the active zoom block strictly by time
      const activeZoomBlock = zoomBlocks.find(
        block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
      );

      if (activeZoomBlock) {
        let blockZoomState = zoomStateRef.current.get(activeZoomBlock.id);
        if (!blockZoomState) {
          let centerX = 0.5;
          let centerY = 0.5;

          const initial = (() => {
            const captureWidth = videoWidth;
            const captureHeight = videoHeight;

            // Use mouse position at block start
            const startMouse = zoomPanCalculator.interpolateMousePosition(cursorEvents, activeZoomBlock.startTime)
            if (startMouse) {
              return { cx: startMouse.x, cy: startMouse.y }
            }

            return { cx: captureWidth * 0.5, cy: captureHeight * 0.5 }
          })()

          centerX = initial.cx / videoWidth
          centerY = initial.cy / videoHeight

          blockZoomState = {
            centerX,
            centerY,
            panX: 0,
            panY: 0,
            initialized: true,
            scale: 1
          };
          zoomStateRef.current.set(activeZoomBlock.id, blockZoomState);
        }

        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = currentTimeMs - activeZoomBlock.startTime;
        const introMs = activeZoomBlock.introMs || 500;
        const outroMs = activeZoomBlock.outroMs || 500;

        // Precompute mouse inputs
        const captureWidth = videoWidth;
        const captureHeight = videoHeight;
        const mousePos = zoomPanCalculator.interpolateMousePosition(cursorEvents, currentTimeMs)

        // Always use mouse for focus
        let targetScaleForBlock = activeZoomBlock.scale || 2

        const smoothedScale = calculateZoomScale(
          elapsed,
          blockDuration,
          targetScaleForBlock,
          introMs,
          outroMs
        );

        let targetCenterX = blockZoomState.centerX;
        let targetCenterY = blockZoomState.centerY;

        if (mousePos) {
          targetCenterX = mousePos.x / captureWidth
          targetCenterY = mousePos.y / captureHeight
        }

        // Clamp away from hard edges slightly to avoid overshoot
        targetCenterX = Math.max(0.02, Math.min(0.98, targetCenterX))
        targetCenterY = Math.max(0.02, Math.min(0.98, targetCenterY))

        const centerSmoothing = 0.25;
        blockZoomState.centerX = blockZoomState.centerX + (targetCenterX - blockZoomState.centerX) * centerSmoothing;
        blockZoomState.centerY = blockZoomState.centerY + (targetCenterY - blockZoomState.centerY) * centerSmoothing;

        const panX = 0;
        const panY = 0;

        zoomState = {
          scale: smoothedScale,
          x: blockZoomState.centerX,
          y: blockZoomState.centerY,
          panX,
          panY
        };
        blockZoomState.scale = smoothedScale
      } else {
        const currentTime = currentTimeMs;
        const keysToDelete: string[] = [];
        zoomStateRef.current.forEach((_, blockId) => {
          const block = zoomBlocks.find(b => b.id === blockId);
          if (block && (currentTime < block.startTime - 5000 || currentTime > block.endTime + 5000)) {
            keysToDelete.push(blockId);
          }
        });
        keysToDelete.forEach(key => zoomStateRef.current.delete(key));
      }
    }

    return zoomState;
  }, [zoomEnabled, clip, zoomBlocks, currentTimeMs, cursorEvents, videoWidth, videoHeight]);

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
    const state = scrollCalculatorRef.current.calculator.update(scrollEvents, currentTimeMs);

    // Get parallax layers for multi-depth effect
    const layers = scrollCalculatorRef.current.calculator.getParallaxLayers(state);

    return { state, layers };
  }, [effects, scrollEvents, currentTimeMs])



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
            cursorEvents={cursorEvents}
            clickEvents={clickEvents}
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
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};
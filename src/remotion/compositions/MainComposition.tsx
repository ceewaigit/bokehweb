import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import { KeystrokeLayer } from './KeystrokeLayer';
import type { MainCompositionProps } from './types';
import type { ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ZoomBlock } from '@/types/project';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale, calculateZoomTransform, applyZoomToPoint } from './utils/zoom-transform';
import { CinematicScrollCalculator, createCinematicTransform, createBlurFilter } from '@/lib/effects/cinematic-scroll';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
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

  // Find specific effect types
  const backgroundEffect = activeEffects.find(e => e.type === 'background');
  const cursorEffect = activeEffects.find(e => e.type === 'cursor');
  const keystrokeEffect = activeEffects.find(e => e.type === 'keystroke');
  const zoomEffects = activeEffects.filter(e => e.type === 'zoom');


  // Extract background padding
  const padding = backgroundEffect ? (backgroundEffect.data as BackgroundEffectData).padding : 0;
  const videoPosition = calculateVideoPosition(width, height, videoWidth, videoHeight, padding);

  // Convert zoom effects to zoom blocks
  const zoomEnabled = zoomEffects.length > 0;
  const zoomBlocks: ZoomBlock[] = zoomEffects.map(effect => {
    const data = effect.data as ZoomEffectData;
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

  // Read zoom behavior settings (prefer active block; fallback to first)
  const zoomBehavior = useMemo(() => {
    // Determine active block at current time
    const active = zoomEffects.find(e => currentTimeMs >= e.startTime && currentTimeMs <= e.endTime)
    const source = active || zoomEffects[0]
    const data = (source?.data as ZoomEffectData) || ({} as any)

    return {
      id: source?.id,
      startTime: source?.startTime || 0,
      endTime: source?.endTime || 0,
      scale: data.scale || 2,
      introMs: data.introMs || 300,
      outroMs: data.outroMs || 300,
      followStrategy: data.followStrategy || 'mouse',
      mouseIdlePx: data.mouseIdlePx ?? 3
    }
  }, [zoomEffects, currentTimeMs])

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
    const anno = (effects || []).find(e => e.type === 'annotation' && (e as any).data?.kind === 'scrollCinematic' && e.enabled)
    if (!anno || !scrollEvents || scrollEvents.length === 0) {
      scrollCalculatorRef.current = null;
      return null;
    }

    // Get preset from annotation data or use 'medium' as default
    const preset = (anno.data as any)?.preset || 'medium';
    
    // Create or update calculator when preset changes
    if (!scrollCalculatorRef.current || scrollCalculatorRef.current.preset !== preset) {
      console.log('[CinematicScroll] Initializing with preset:', preset, 'Total scroll events:', scrollEvents.length);
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
            backgroundData={backgroundEffect.data as BackgroundEffectData}
            videoWidth={width}
            videoHeight={height}
          />
        </Sequence>
      )}

      {/* Video Layer with effects */}
      {videoUrl && (
        <Sequence from={0}>
          <VideoLayer
            videoUrl={videoUrl}
            effects={effects}
            zoomBlocks={zoomBlocks}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            zoomCenter={zoomEnabled ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
            cinematicScrollState={cinematicScrollState}
            computedScale={zoomEnabled ? completeZoomState.scale : undefined}
          />
        </Sequence>
      )}

      {/* Keystroke Layer - Show when enabled and keystrokes exist */}
      {keystrokeEffect && keystrokeEvents && keystrokeEvents.length > 0 && (
        <Sequence from={0}>
          <KeystrokeLayer
            keyboardEvents={keystrokeEvents}
            settings={keystrokeEffect.data as KeystrokeEffectData}
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
            cursorData={cursorEffect.data as CursorEffectData}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};
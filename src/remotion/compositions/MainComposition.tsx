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
import { calculateZoomScale } from './utils/zoom-transform';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents,
  videoWidth,
  videoHeight,
  captureArea
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
  }>>(new Map());

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Extract active effects from the array
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
      scale: data.scale,
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
      const clipRelativeTime = currentTimeMs;
      const activeZoomBlock = zoomBlocks.find(
        block => clipRelativeTime >= block.startTime && clipRelativeTime <= block.endTime
      );

      if (activeZoomBlock) {
        // Get or initialize zoom state for this specific zoom block
        let blockZoomState = zoomStateRef.current.get(activeZoomBlock.id);
        if (!blockZoomState) {
          // Initialize zoom center ONCE at the start of the zoom block
          let centerX = 0.5;
          let centerY = 0.5;

          // Get mouse position at zoom START (not current position)
          if (cursorEvents.length > 0) {
            const startMousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              activeZoomBlock.startTime // Use block start time, not current time
            );
            if (startMousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;
              centerX = startMousePos.x / captureWidth;
              centerY = startMousePos.y / captureHeight;
            }
          }

          blockZoomState = {
            centerX,
            centerY,
            panX: 0,
            panY: 0,
            initialized: true
          };
          zoomStateRef.current.set(activeZoomBlock.id, blockZoomState);
        }

        // Calculate zoom interpolation
        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = clipRelativeTime - activeZoomBlock.startTime;
        const introMs = activeZoomBlock.introMs || 500;
        const outroMs = activeZoomBlock.outroMs || 500;

        // Use deterministic zoom scale calculation
        const scale = calculateZoomScale(
          elapsed,
          blockDuration,
          activeZoomBlock.scale || 2,
          introMs,
          outroMs
        );

        // Calculate phase-based panning for cinematic effect
        let panX = 0;
        let panY = 0;

        if (elapsed < introMs) {
          // Intro phase: gradual panning introduction for smooth transition
          const introProgress = elapsed / introMs;

          // Start at 20% strength and ease to 80% for cinematic intro
          if (cursorEvents.length > 0 && blockZoomState) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;

              const cinematicPan = zoomPanCalculator.calculateCinematicZoomPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                blockZoomState.panX,
                blockZoomState.panY
              );

              // Smooth exponential curve for pan strength (20% to 80%)
              const panStrength = 0.2 + (0.6 * Math.pow(introProgress, 2));
              blockZoomState.panX = cinematicPan.x * panStrength;
              blockZoomState.panY = cinematicPan.y * panStrength;
            }
          }

          panX = blockZoomState.panX;
          panY = blockZoomState.panY;

        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase: maintain pan longer, then smoothly return to center
          const outroProgress = (elapsed - (blockDuration - outroMs)) / outroMs;

          if (blockZoomState) {
            // Keep following mouse for first 70% of outro for more natural feel
            if (outroProgress < 0.7 && cursorEvents.length > 0) {
              const mousePos = zoomPanCalculator.interpolateMousePosition(
                cursorEvents,
                currentTimeMs
              );

              if (mousePos) {
                const captureWidth = cursorEvents[0].captureWidth || videoWidth;
                const captureHeight = cursorEvents[0].captureHeight || videoHeight;

                const cinematicPan = zoomPanCalculator.calculateCinematicZoomPan(
                  mousePos.x,
                  mousePos.y,
                  captureWidth,
                  captureHeight,
                  scale,
                  blockZoomState.panX,
                  blockZoomState.panY
                );

                // Maintain 80% strength during outro follow phase
                blockZoomState.panX = cinematicPan.x * 0.8;
                blockZoomState.panY = cinematicPan.y * 0.8;
              }
            }

            // Smooth fade out in last 30% of outro with ease curve
            const fadeFactor = outroProgress < 0.7 ? 1 : Math.pow(1 - ((outroProgress - 0.7) / 0.3), 2);
            panX = blockZoomState.panX * fadeFactor;
            panY = blockZoomState.panY * fadeFactor;
          }

        } else {
          // Hold phase: full cinematic panning to follow mouse
          if (cursorEvents.length > 0 && blockZoomState) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;

              // Calculate smooth cinematic pan
              const cinematicPan = zoomPanCalculator.calculateCinematicZoomPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                blockZoomState.panX,
                blockZoomState.panY
              );

              // Update pan state
              blockZoomState.panX = cinematicPan.x;
              blockZoomState.panY = cinematicPan.y;

              panX = blockZoomState.panX;
              panY = blockZoomState.panY;
            }
          } else if (blockZoomState) {
            // Use existing pan if no mouse events
            panX = blockZoomState.panX;
            panY = blockZoomState.panY;
          }
        }

        // Use the fixed zoom center with cinematic pan
        zoomState = {
          scale,
          x: blockZoomState.centerX,
          y: blockZoomState.centerY,
          panX,  // Cinematic pan based on phase
          panY   // Cinematic pan based on phase
        };
      } else {
        // No active zoom block - clear any cached states for memory efficiency
        // Only keep states for blocks within 5 seconds of current time
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
  }, [zoomEnabled, clip, zoomBlocks, currentTimeMs, cursorEvents]);

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
            captureArea={captureArea}
            zoomCenter={completeZoomState.scale > 1 ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
            cinematicPan={completeZoomState.scale > 1 ? { x: completeZoomState.panX, y: completeZoomState.panY } : undefined}
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
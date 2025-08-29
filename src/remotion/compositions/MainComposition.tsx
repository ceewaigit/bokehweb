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
import { smoothStep } from '@/lib/utils/easing';

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

  // Track pan state with proper initialization per zoom block
  // Using a Map to store state per block ID for clean transitions
  const panStateRef = useRef<Map<string, { x: number; y: number; initialized: boolean }>>(new Map());

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
        // Get or initialize pan state for this specific zoom block
        let blockPanState = panStateRef.current.get(activeZoomBlock.id);
        if (!blockPanState) {
          blockPanState = { x: 0, y: 0, initialized: false };
          panStateRef.current.set(activeZoomBlock.id, blockPanState);
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
        
        // Initialize pan variables
        let panX = 0;
        let panY = 0;

        // Initialize pan position based on mouse position at zoom start
        if (!blockPanState.initialized) {
          let targetX = 0.5;
          let targetY = 0.5;
          if (cursorEvents.length > 0) {
            const startMousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              activeZoomBlock.startTime
            );
            if (startMousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;
              targetX = startMousePos.x / captureWidth;
              targetY = startMousePos.y / captureHeight;
            }
          }
          
          const initialPan = zoomPanCalculator.calculateInitialPan(
            targetX,
            targetY,
            activeZoomBlock.scale || 2
          );
          blockPanState.x = initialPan.x;
          blockPanState.y = initialPan.y;
          blockPanState.initialized = true;
        }

        if (elapsed < introMs) {
          // Intro phase - smoothly interpolate pan
          const introProgress = Math.min(1, elapsed / introMs);
          const easedProgress = smoothStep(introProgress);

          // During intro, gently ease into any pan offset
          if (cursorEvents.length > 0 && blockPanState) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;

              // Calculate pan with reduced responsiveness during zoom
              const targetPan = zoomPanCalculator.calculateSmoothPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                blockPanState.x,
                blockPanState.y
              );

              // Smoothly blend to target during intro
              const blendFactor = easedProgress * 0.3; // Max 30% responsiveness during intro
              blockPanState.x = blockPanState.x + (targetPan.x - blockPanState.x) * blendFactor;
              blockPanState.y = blockPanState.y + (targetPan.y - blockPanState.y) * blendFactor;
              
              panX = blockPanState.x;
              panY = blockPanState.y;
            }
          }
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase - smoothly return to center
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = Math.min(1, outroElapsed / outroMs);
          const easedProgress = smoothStep(outroProgress);

          // Smoothly transition pan back to center during outro
          if (blockPanState) {
            const fadeOutPan = 1 - easedProgress;
            panX = blockPanState.x * fadeOutPan;
            panY = blockPanState.y * fadeOutPan;
          }
          
        } else {
          // Hold phase - use edge-based panning

          // Get interpolated mouse position at current time
          const mousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            currentTimeMs
          );

          if (mousePos && cursorEvents.length > 0) {
            // Get capture dimensions from the first event
            const captureWidth = cursorEvents[0].captureWidth || videoWidth;
            const captureHeight = cursorEvents[0].captureHeight || videoHeight;
            
            // Use edge-based pan calculator with block-specific state
            if (blockPanState) {
              const panOffset = zoomPanCalculator.calculateSmoothPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                blockPanState.x,
                blockPanState.y
              );

              // Update pan position with smooth interpolation
              blockPanState.x = panOffset.x;
              blockPanState.y = panOffset.y;
              
              panX = blockPanState.x;
              panY = blockPanState.y;
            }
          } else if (blockPanState) {
            // No mouse events, use current pan
            panX = blockPanState.x;
            panY = blockPanState.y;
          }
        }

        // Get mouse position at zoom START for zoom center (not current position)
        // This ensures zoom centers on where the mouse was when zoom started
        let x = 0.5;
        let y = 0.5;
        if (cursorEvents.length > 0) {
          const zoomStartMousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            activeZoomBlock.startTime  // Use zoom block start time, not current time
          );
          if (zoomStartMousePos) {
            const captureWidth = cursorEvents[0].captureWidth || videoWidth;
            const captureHeight = cursorEvents[0].captureHeight || videoHeight;
            x = zoomStartMousePos.x / captureWidth;
            y = zoomStartMousePos.y / captureHeight;
          }
        }

        zoomState = {
          scale,
          x,
          y,
          panX,
          panY
        };
      } else {
        // No active zoom block - no pan needed
        // Pan state is preserved per block for consistency
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
            preCalculatedPan={completeZoomState.scale > 1 ? { x: completeZoomState.panX, y: completeZoomState.panY } : undefined}
            mousePosition={completeZoomState.scale > 1 ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
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
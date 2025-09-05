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
      // Find active zoom block using clip-relative time
      const activeZoomBlock = zoomBlocks.find(
        block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
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
        const elapsed = currentTimeMs - activeZoomBlock.startTime;
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

        // Dynamically center on the CURRENT mouse position each frame
        const captureWidth = cursorEvents[0]?.captureWidth || videoWidth;
        const captureHeight = cursorEvents[0]?.captureHeight || videoHeight;

        let targetCenterX = blockZoomState.centerX;
        let targetCenterY = blockZoomState.centerY;

        if (cursorEvents.length > 0) {
          const mousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            currentTimeMs
          );
          if (mousePos) {
            targetCenterX = mousePos.x / captureWidth;
            targetCenterY = mousePos.y / captureHeight;
          }
        }

        // Smooth the center a bit for cinematic feel
        const centerSmoothing = 0.25; // lower = smoother
        blockZoomState.centerX = blockZoomState.centerX + (targetCenterX - blockZoomState.centerX) * centerSmoothing;
        blockZoomState.centerY = blockZoomState.centerY + (targetCenterY - blockZoomState.centerY) * centerSmoothing;

        // No clamping: allow center to go beyond content to show the sides

        // No additional pan needed when centering on mouse directly
        const panX = 0;
        const panY = 0;

        // Use the dynamic zoom center without extra pan
        zoomState = {
          scale,
          x: blockZoomState.centerX,
          y: blockZoomState.centerY,
          panX,
          panY
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
            zoomCenter={zoomEnabled ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
            cinematicPan={zoomEnabled ? { x: 0, y: 0 } : undefined}
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
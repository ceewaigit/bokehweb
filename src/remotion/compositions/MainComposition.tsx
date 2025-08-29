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
import { calculateZoomScale, resetZoomSmoothing } from './utils/zoom-transform';
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

  // Track dynamic pan state for each zoom block
  const smoothPanRef = useRef({ 
    x: 0, 
    y: 0, 
    lastBlockId: null as string | null,
    initialized: false
  });

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
        // Reset pan and smoothing when entering a new zoom block
        if (smoothPanRef.current.lastBlockId !== activeZoomBlock.id) {
          smoothPanRef.current.x = 0;
          smoothPanRef.current.y = 0;
          smoothPanRef.current.lastBlockId = activeZoomBlock.id;
          smoothPanRef.current.initialized = false; // Force re-initialization for new block
          resetZoomSmoothing(); // Reset spring smoothing for new block
        }

        // Calculate zoom interpolation
        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = clipRelativeTime - activeZoomBlock.startTime;
        const introMs = activeZoomBlock.introMs || 500;
        const outroMs = activeZoomBlock.outroMs || 500;

        // Use shared zoom scale calculation with spring smoothing
        const scale = calculateZoomScale(
          elapsed,
          blockDuration,
          activeZoomBlock.scale || 2,
          introMs,
          outroMs,
          true // Enable spring smoothing for buttery smooth zoom
        );
        
        // Initialize pan variables
        let panX = 0;
        let panY = 0;

        // Initialize pan position based on current mouse position at the start
        if (elapsed === 0 || !smoothPanRef.current.initialized) {
          // Get mouse position at the start of the zoom block
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
          smoothPanRef.current.x = initialPan.x;
          smoothPanRef.current.y = initialPan.y;
          smoothPanRef.current.initialized = true;
        }

        if (elapsed < introMs) {
          // Intro phase - gentle pan with damping
          const introProgress = elapsed / introMs;
          const dampingFactor = smoothStep(introProgress) * 0.5; // Reduced pan intensity during zoom

          // Get current mouse position for subtle panning
          if (cursorEvents.length > 0) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;

              // Calculate edge-based pan with damping
              const targetPan = zoomPanCalculator.calculateSmoothPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                smoothPanRef.current.x,
                smoothPanRef.current.y
              );

              // Apply damping to reduce pan intensity during zoom transition
              smoothPanRef.current.x = smoothPanRef.current.x + (targetPan.x - smoothPanRef.current.x) * dampingFactor;
              smoothPanRef.current.y = smoothPanRef.current.y + (targetPan.y - smoothPanRef.current.y) * dampingFactor;
              
              panX = smoothPanRef.current.x;
              panY = smoothPanRef.current.y;
            }
          }
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase - smoothly return to center
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = outroElapsed / outroMs;
          const easedProgress = smoothStep(outroProgress); // Gentler easing for pan

          // Smoothly transition pan back to center during outro
          const fadeOutPan = 1 - easedProgress;
          panX = smoothPanRef.current.x * fadeOutPan;
          panY = smoothPanRef.current.y * fadeOutPan;
          
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
            
            // Use edge-based pan calculator
            const panOffset = zoomPanCalculator.calculateSmoothPan(
              mousePos.x,
              mousePos.y,
              captureWidth,
              captureHeight,
              scale,
              smoothPanRef.current.x,
              smoothPanRef.current.y
            );

            // Update pan position directly (calculator handles smoothing)
            smoothPanRef.current.x = panOffset.x;
            smoothPanRef.current.y = panOffset.y;
            
            panX = smoothPanRef.current.x;
            panY = smoothPanRef.current.y;
          } else {
            // No mouse events, use current pan
            panX = smoothPanRef.current.x;
            panY = smoothPanRef.current.y;
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
        // No active zoom block - reset state
        if (smoothPanRef.current.lastBlockId !== null) {
          smoothPanRef.current.x = 0;
          smoothPanRef.current.y = 0;
          smoothPanRef.current.lastBlockId = null;
          smoothPanRef.current.initialized = false;
        }
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
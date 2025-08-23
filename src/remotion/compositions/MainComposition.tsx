import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import type { MainCompositionProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale, easeInOutQuint } from './utils/zoom-transform';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents: _keystrokeEvents, // Not yet implemented
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

  // Calculate video position for cursor layer
  const padding = effects?.background?.padding || 0;
  const videoPosition = calculateVideoPosition(width, height, videoWidth, videoHeight, padding);

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Get zoom state if zoom is enabled
  const zoomEnabled = effects?.zoom?.enabled;
  const zoomBlocks = effects?.zoom?.blocks || [];

  // Calculate complete zoom state including dynamic pan
  const completeZoomState = useMemo(() => {
    let zoomState = { scale: 1, x: 0.5, y: 0.5, panX: 0, panY: 0 };

    if (zoomEnabled && clip) {
      const clipRelativeTime = currentTimeMs;
      const activeZoomBlock = zoomBlocks.find(
        block => clipRelativeTime >= block.startTime && clipRelativeTime <= block.endTime
      );

      if (activeZoomBlock) {
        // Reset pan when entering a new zoom block
        if (smoothPanRef.current.lastBlockId !== activeZoomBlock.id) {
          smoothPanRef.current.x = 0;
          smoothPanRef.current.y = 0;
          smoothPanRef.current.lastBlockId = activeZoomBlock.id;
          smoothPanRef.current.initialized = false; // Force re-initialization for new block
        }

        // Calculate zoom interpolation
        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = clipRelativeTime - activeZoomBlock.startTime;
        const introMs = activeZoomBlock.introMs || 500;
        const outroMs = activeZoomBlock.outroMs || 500;

        // Use shared zoom scale calculation
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

        // Initialize pan position based on zoom block target at the start
        if (elapsed === 0 || !smoothPanRef.current.initialized) {
          const initialPan = zoomPanCalculator.calculateInitialPan(
            activeZoomBlock.targetX || 0.5,
            activeZoomBlock.targetY || 0.5,
            activeZoomBlock.scale || 2
          );
          smoothPanRef.current.x = initialPan.x;
          smoothPanRef.current.y = initialPan.y;
          smoothPanRef.current.initialized = true;
        }

        if (elapsed < introMs) {
          // Intro phase - edge-based panning with smooth intro

          // Get current mouse position for edge-based panning
          if (cursorEvents.length > 0) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const captureWidth = cursorEvents[0].captureWidth || videoWidth;
              const captureHeight = cursorEvents[0].captureHeight || videoHeight;

              // Calculate edge-based pan with current scale
              const targetPan = zoomPanCalculator.calculateSmoothPan(
                mousePos.x,
                mousePos.y,
                captureWidth,
                captureHeight,
                scale,
                smoothPanRef.current.x,
                smoothPanRef.current.y
              );

              // Smoothly update pan during intro
              smoothPanRef.current.x = targetPan.x;
              smoothPanRef.current.y = targetPan.y;
              
              panX = smoothPanRef.current.x;
              panY = smoothPanRef.current.y;
            }
          }
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase - smoothly return to center with ultra-smooth easing
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = outroElapsed / outroMs;
          const easedProgress = easeInOutQuint(outroProgress);

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

        // Use the initial target position for the zoom center
        const x = activeZoomBlock.targetX || 0.5;
        const y = activeZoomBlock.targetY || 0.5;

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
      <Sequence from={0}>
        <BackgroundLayer
          effects={effects?.background}
          videoWidth={width}
          videoHeight={height}
        />
      </Sequence>

      {/* Video Layer with effects */}
      {videoUrl && (
        <Sequence from={0}>
          <VideoLayer
            videoUrl={videoUrl}
            effects={effects}
            zoom={effects?.zoom}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            captureArea={captureArea}
            preCalculatedPan={completeZoomState.scale > 1 ? { x: completeZoomState.panX, y: completeZoomState.panY } : undefined}
          />
        </Sequence>
      )}

      {/* Cursor Layer */}
      {cursorEvents.length > 0 && effects?.cursor?.visible !== false && (
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
            zoom={effects?.zoom}  // Pass the same zoom config as VideoLayer
            zoomState={completeZoomState}  // Also pass the calculated state for pan
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            cursorEffects={effects?.cursor}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};
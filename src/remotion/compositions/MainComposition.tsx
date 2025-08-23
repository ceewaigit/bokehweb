import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import type { MainCompositionProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale, smoothStep } from './utils/zoom-transform';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents: _keystrokeEvents, // Not yet implemented
  videoWidth,
  videoHeight
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Track dynamic pan state separately for each zoom block with target tracking
  const smoothPanRef = useRef({ 
    x: 0, 
    y: 0, 
    targetX: 0,
    targetY: 0,
    lastBlockId: null as string | null,
    lastMouseTime: 0
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
          smoothPanRef.current.targetX = 0;
          smoothPanRef.current.targetY = 0;
          smoothPanRef.current.lastBlockId = activeZoomBlock.id;
          smoothPanRef.current.lastMouseTime = currentTimeMs;
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

        if (elapsed < introMs) {
          // Intro phase - calculate pan with immediate start
          const introProgress = elapsed / introMs;
          const easedProgress = smoothStep(introProgress);

          // Calculate pan from the very start for smooth unified motion
          if (cursorEvents.length > 0) {
            const mousePos = zoomPanCalculator.interpolateMousePosition(
              cursorEvents,
              currentTimeMs
            );

            if (mousePos) {
              const screenWidth = cursorEvents[0].screenWidth;
              const screenHeight = cursorEvents[0].screenHeight;

              // Calculate target pan with current scale
              const targetPan = zoomPanCalculator.calculateSmoothPan(
                mousePos.x,
                mousePos.y,
                screenWidth,
                screenHeight,
                scale,
                smoothPanRef.current.x,
                smoothPanRef.current.y
              );

              // Store targets and apply smooth interpolation
              smoothPanRef.current.targetX = targetPan.x;
              smoothPanRef.current.targetY = targetPan.y;
              
              // Apply pan with intro easing and additional smoothing
              const panIntroFactor = easedProgress * 0.8; // Slightly slower pan intro
              smoothPanRef.current.x += (smoothPanRef.current.targetX - smoothPanRef.current.x) * panIntroFactor * 0.3;
              smoothPanRef.current.y += (smoothPanRef.current.targetY - smoothPanRef.current.y) * panIntroFactor * 0.3;
              
              panX = smoothPanRef.current.x;
              panY = smoothPanRef.current.y;
            }
          }
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase - scale is already calculated above
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = outroElapsed / outroMs;
          const easedProgress = smoothStep(outroProgress);

          // Smoothly transition pan back to center during outro
          const fadeOutPan = 1 - easedProgress;
          panX = smoothPanRef.current.x * fadeOutPan;
          panY = smoothPanRef.current.y * fadeOutPan;
        } else {
          // Hold phase - scale is already calculated, just handle pan

          // Get interpolated mouse position at current time
          const mousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            currentTimeMs
          );

          if (mousePos && cursorEvents.length > 0) {
            // Get screen dimensions from the first event (they're consistent)
            const screenWidth = cursorEvents[0].screenWidth;
            const screenHeight = cursorEvents[0].screenHeight;

            // Calculate time delta for smooth interpolation
            const timeDelta = currentTimeMs - smoothPanRef.current.lastMouseTime;
            smoothPanRef.current.lastMouseTime = currentTimeMs;
            
            // Use smooth pan calculator with velocity prediction
            const panOffset = zoomPanCalculator.calculateSmoothPan(
              mousePos.x,
              mousePos.y,
              screenWidth,
              screenHeight,
              scale,
              smoothPanRef.current.x,
              smoothPanRef.current.y
            );

            // Store targets
            smoothPanRef.current.targetX = panOffset.x;
            smoothPanRef.current.targetY = panOffset.y;
            
            // Apply smooth interpolation with adaptive smoothing based on time delta
            const smoothingFactor = Math.min(0.15, Math.max(0.08, timeDelta / 100)); // Adaptive smoothing
            smoothPanRef.current.x += (smoothPanRef.current.targetX - smoothPanRef.current.x) * smoothingFactor;
            smoothPanRef.current.y += (smoothPanRef.current.targetY - smoothPanRef.current.y) * smoothingFactor;
            
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
          smoothPanRef.current.targetX = 0;
          smoothPanRef.current.targetY = 0;
          smoothPanRef.current.lastBlockId = null;
          smoothPanRef.current.lastMouseTime = 0;
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
            zoom={completeZoomState}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            cursorEffects={effects?.cursor}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};
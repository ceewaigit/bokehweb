import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import type { MainCompositionProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';

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
  
  // Track dynamic pan state separately for each zoom block
  const smoothPanRef = useRef({ x: 0, y: 0, lastBlockId: null as string | null });

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
        }

        // Calculate zoom interpolation
        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = clipRelativeTime - activeZoomBlock.startTime;

        // Apply intro/outro transitions with consistent easing
        let scale = activeZoomBlock.scale || 2;
        let panX = 0;
        let panY = 0;

        const introMs = activeZoomBlock.introMs || 400;
        const outroMs = activeZoomBlock.outroMs || 400;

        if (elapsed < introMs) {
          // Intro phase - smooth zoom in
          const introProgress = elapsed / introMs;
          const easedProgress = easeOutExpo(introProgress);
          scale = 1 + (scale - 1) * easedProgress;
          
          // Start panning gradually during intro
          if (introProgress > 0.3) {  // Start pan after 30% of intro
            const panProgress = (introProgress - 0.3) / 0.7;
            panX = smoothPanRef.current.x * easeOutExpo(panProgress);
            panY = smoothPanRef.current.y * easeOutExpo(panProgress);
          }
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase - smooth zoom out
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = outroElapsed / outroMs;
          const easedProgress = easeInExpo(outroProgress);
          scale = activeZoomBlock.scale - (activeZoomBlock.scale - 1) * easedProgress;
          
          // Fade out pan during outro
          panX = smoothPanRef.current.x * (1 - easedProgress);
          panY = smoothPanRef.current.y * (1 - easedProgress);
        } else {
          // Hold phase - full zoom with dynamic pan
          scale = activeZoomBlock.scale || 2;
          
          // Get interpolated mouse position at current time
          const mousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            currentTimeMs
          );
          
          if (mousePos && cursorEvents.length > 0) {
            // Get screen dimensions from the first event (they're consistent)
            const screenWidth = cursorEvents[0].screenWidth;
            const screenHeight = cursorEvents[0].screenHeight;
            
            // Use simplified smooth pan calculator
            const panOffset = zoomPanCalculator.calculateSmoothPan(
              mousePos.x,
              mousePos.y,
              screenWidth,
              screenHeight,
              scale,
              smoothPanRef.current.x,
              smoothPanRef.current.y
            );
            
            // Update smooth pan state
            smoothPanRef.current.x = panOffset.x;
            smoothPanRef.current.y = panOffset.y;
            panX = panOffset.x;
            panY = panOffset.y;
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
            startFrom={clip?.sourceIn ? clip.sourceIn / 1000 : 0}
            endAt={clip?.sourceOut ? clip.sourceOut / 1000 : undefined}
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

// Easing functions for smooth transitions
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInExpo(t: number): number {
  return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
}
import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import type { MainCompositionProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/zoom-pan-calculator';

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
  
  // Track dynamic pan state across frames
  const smoothPanRef = useRef({ x: 0, y: 0 });

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
        // Calculate zoom interpolation
        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = clipRelativeTime - activeZoomBlock.startTime;

        // Apply intro/outro transitions
        let scale = activeZoomBlock.scale || 2;
        let x = activeZoomBlock.targetX || 0.5;
        let y = activeZoomBlock.targetY || 0.5;

        const introMs = activeZoomBlock.introMs || 300;
        const outroMs = activeZoomBlock.outroMs || 300;

        if (elapsed < introMs) {
          // Intro phase
          const introProgress = elapsed / introMs;
          scale = 1 + (scale - 1) * easeOutExpo(introProgress);
          x = 0.5 + (x - 0.5) * easeOutExpo(introProgress);
          y = 0.5 + (y - 0.5) * easeOutExpo(introProgress);
        } else if (elapsed > blockDuration - outroMs) {
          // Outro phase
          const outroElapsed = elapsed - (blockDuration - outroMs);
          const outroProgress = outroElapsed / outroMs;
          scale = activeZoomBlock.scale - (activeZoomBlock.scale - 1) * outroProgress;
          x = activeZoomBlock.targetX + (0.5 - activeZoomBlock.targetX) * outroProgress;
          y = activeZoomBlock.targetY + (0.5 - activeZoomBlock.targetY) * outroProgress;
        } else {
          // Hold phase - calculate dynamic pan
          scale = activeZoomBlock.scale || 2;
          
          // Get interpolated mouse position at current time
          const mousePos = zoomPanCalculator.interpolateMousePosition(
            cursorEvents,
            currentTimeMs
          );
          
          if (mousePos && cursorEvents.length > 0) {
            // Get the most recent mouse event for screen dimensions
            let currentEvent = cursorEvents[0];
            for (let i = cursorEvents.length - 1; i >= 0; i--) {
              if (cursorEvents[i].timestamp <= currentTimeMs) {
                currentEvent = cursorEvents[i];
                break;
              }
            }
            const screenWidth = currentEvent.screenWidth;
            const screenHeight = currentEvent.screenHeight;
            
            // Normalize mouse position to 0-1 range
            const normalizedMouseX = mousePos.x / screenWidth;
            const normalizedMouseY = mousePos.y / screenHeight;
            
            // Calculate offset from center (0.5, 0.5) - this is where we want to pan to
            const targetPanX = normalizedMouseX - 0.5;
            const targetPanY = normalizedMouseY - 0.5;
            
            // Apply smoothing for fluid motion
            const smoothingFactor = 0.3;
            smoothPanRef.current.x += (targetPanX - smoothPanRef.current.x) * smoothingFactor;
            smoothPanRef.current.y += (targetPanY - smoothPanRef.current.y) * smoothingFactor;
          }
        }

        zoomState = { 
          scale, 
          x, 
          y, 
          panX: smoothPanRef.current.x,
          panY: smoothPanRef.current.y
        };
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
            mouseEvents={cursorEvents}
            preCalculatedPan={completeZoomState.scale > 1 ? { x: completeZoomState.panX, y: completeZoomState.panY } : undefined}
          />
        </Sequence>
      )}

      {/* Cursor Layer */}
      {cursorEvents.length > 0 && (
        <Sequence from={0}>
          <CursorLayer
            cursorEvents={cursorEvents}
            clickEvents={clickEvents}
            currentFrame={frame}
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

// Easing function for smooth transitions
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
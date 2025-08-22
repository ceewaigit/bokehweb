import React, { useRef } from 'react';
import { Video, AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/zoom-pan-calculator';

export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  startFrom = 0,
  endAt,
  effects,
  zoom,
  videoWidth,
  videoHeight,
  mouseEvents = []
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Track previous pan position for smooth ice-like interpolation
  const smoothPanRef = useRef({ x: 0, y: 0 });
  const smoothPan = smoothPanRef.current;

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Calculate video position using shared utility
  const padding = effects?.background?.padding || 0;
  const { drawWidth, drawHeight, offsetX, offsetY } = calculateVideoPosition(
    width,
    height,
    videoWidth,
    videoHeight,
    padding
  );

  // Apply zoom if enabled
  let transform = '';

  if (zoom?.enabled && zoom.blocks) {
    // Find active zoom block
    const activeBlock = zoom.blocks.find(
      block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
    );

    if (activeBlock) {
      const blockDuration = activeBlock.endTime - activeBlock.startTime;
      const elapsed = currentTimeMs - activeBlock.startTime;

      // Calculate zoom interpolation with easing
      let scale = 1;

      const introMs = activeBlock.introMs || 300;
      const outroMs = activeBlock.outroMs || 300;

      console.log('[VideoLayer] Zoom block active:', {
        blockId: activeBlock.id,
        targetX: activeBlock.targetX,
        targetY: activeBlock.targetY,
        scale: activeBlock.scale,
        elapsed,
        introMs,
        outroMs,
        currentTimeMs
      });

      if (elapsed < introMs) {
        // Intro phase - zoom in with smoother easing
        const progress = elapsed / introMs;
        // Use smoother easing for more natural zoom like Screen Studio
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        scale = interpolate(
          progress,
          [0, 1],
          [1, activeBlock.scale || 2],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easeOutCubic
          }
        );
      } else if (elapsed > blockDuration - outroMs) {
        // Outro phase - zoom out with smoother return
        const outroElapsed = elapsed - (blockDuration - outroMs);
        const progress = outroElapsed / outroMs;
        // Use smoother easing for natural zoom out
        const easeInOutCubic = (t: number) => t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
        scale = interpolate(
          progress,
          [0, 1],
          [activeBlock.scale || 2, 1],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easeInOutCubic
          }
        );
      } else {
        // Hold phase - implement dynamic panning based on mouse position
        scale = activeBlock.scale || 2;

        // Get interpolated mouse position at current time
        const mousePos = zoomPanCalculator.interpolateMousePosition(
          mouseEvents,
          currentTimeMs
        );

        if (mousePos && mouseEvents.length > 0) {
          // Get the most recent mouse event for screen dimensions
          // Find the last event before or at current time
          let currentEvent = mouseEvents[0];
          for (let i = mouseEvents.length - 1; i >= 0; i--) {
            if (mouseEvents[i].timestamp <= currentTimeMs) {
              currentEvent = mouseEvents[i];
              break;
            }
          }
          const screenWidth = currentEvent.screenWidth;
          const screenHeight = currentEvent.screenHeight;

          console.log('[VideoLayer] Hold phase debug:', {
            mousePos,
            currentEvent: {
              x: currentEvent.x,
              y: currentEvent.y,
              screenWidth: currentEvent.screenWidth,
              screenHeight: currentEvent.screenHeight,
              timestamp: currentEvent.timestamp
            },
            videoSize: { videoWidth, videoHeight },
            canvasSize: { width, height },
            scale
          });

          // Calculate dynamic pan offset based on current mouse position
          // Use screen dimensions, not video dimensions
          const panOffset = zoomPanCalculator.calculatePanOffset(
            mousePos.x,
            mousePos.y,
            screenWidth,
            screenHeight,
            scale,
            smoothPan.x,
            smoothPan.y
          );

          console.log('[VideoLayer] Pan calculation:', {
            panOffset,
            smoothPanBefore: { ...smoothPan },
            normalizedMousePos: {
              x: mousePos.x / screenWidth,
              y: mousePos.y / screenHeight
            }
          });

          // Update smooth pan with very responsive movement to keep mouse in frame
          const iceSmoothingFactor = 0.25; // Much higher for immediate camera response
          smoothPan.x += (panOffset.x - smoothPan.x) * iceSmoothingFactor;
          smoothPan.y += (panOffset.y - smoothPan.y) * iceSmoothingFactor;

          console.log('[VideoLayer] Smooth pan after:', { ...smoothPan });

          // Apply initial target position plus dynamic pan
          const baseTargetX = (activeBlock.targetX || 0.5) - 0.5;
          const baseTargetY = (activeBlock.targetY || 0.5) - 0.5;

          // Combine base position with smooth dynamic pan
          const dynamicTargetX = baseTargetX + smoothPan.x;
          const dynamicTargetY = baseTargetY + smoothPan.y;

          console.log('[VideoLayer] Final transform:', {
            baseTarget: { x: baseTargetX, y: baseTargetY },
            dynamicTarget: { x: dynamicTargetX, y: dynamicTargetY },
            scaleMinusOne: scale - 1,
            width,
            height
          });
        }
      }

      // The zoom should be relative to the video content, not the canvas
      // We need to consider that the video is positioned at offsetX, offsetY
      // and has size drawWidth x drawHeight

      // Calculate the zoom center point in video coordinates (0-1)
      // IMPORTANT: activeBlock.targetX/Y are already normalized (0-1)
      const zoomCenterX = activeBlock.targetX || 0.5;
      const zoomCenterY = activeBlock.targetY || 0.5;

      // The zoom center is where we want to focus (0-1 normalized)
      // Convert to pixel coordinates relative to video container
      const zoomPointX = zoomCenterX * drawWidth;
      const zoomPointY = zoomCenterY * drawHeight;
      
      // Calculate the center of the video container
      const centerX = drawWidth / 2;
      const centerY = drawHeight / 2;
      
      // Calculate offset from center to zoom point
      const offsetFromCenterX = zoomPointX - centerX;
      const offsetFromCenterY = zoomPointY - centerY;
      
      // When scaling from center, point moves by (scale - 1) * offset
      // To keep it in place, translate in opposite direction
      const scaleCompensationX = -offsetFromCenterX * (scale - 1);
      const scaleCompensationY = -offsetFromCenterY * (scale - 1);

      // Add dynamic pan offset (if mouse has moved from original cluster)
      const panX = smoothPan.x * drawWidth;
      const panY = smoothPan.y * drawHeight;

      // Apply transform - translate needs to be divided by scale when scale is applied first
      const finalTranslateX = (scaleCompensationX + panX) / scale;
      const finalTranslateY = (scaleCompensationY + panY) / scale;
      transform = `scale(${scale}) translate(${finalTranslateX}px, ${finalTranslateY}px)`;

      console.log('[VideoLayer] Transform calculation:', {
        zoomCenter: { x: zoomCenterX, y: zoomCenterY },
        scaleCompensation: { x: scaleCompensationX, y: scaleCompensationY },
        pan: { x: panX, y: panY },
        translateBeforeScale: { x: scaleCompensationX + panX, y: scaleCompensationY + panY },
        translateAfterScale: { x: finalTranslateX, y: finalTranslateY },
        scale,
        smoothPan,
        activeBlockTarget: { x: activeBlock.targetX, y: activeBlock.targetY }
      });
    }
  }

  // Apply corner radius if specified
  const cornerRadius = effects?.video?.cornerRadius || 0;
  const borderRadiusStyle = cornerRadius > 0 ? `${cornerRadius}px` : '0';

  // Apply shadow if enabled
  const shadowStyle = effects?.video?.shadow?.enabled
    ? {
      filter: `drop-shadow(${effects.video.shadow.offset.x}px ${effects.video.shadow.offset.y}px ${effects.video.shadow.blur}px ${effects.video.shadow.color})`
    }
    : {};

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: drawWidth,
          height: drawHeight,
          borderRadius: borderRadiusStyle,
          overflow: 'hidden',
          transform,
          transformOrigin: '50% 50%',
          ...shadowStyle
        }}
      >
        <Video
          src={videoUrl}
          startFrom={startFrom * fps}
          endAt={endAt ? endAt * fps : undefined}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
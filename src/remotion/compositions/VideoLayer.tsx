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
      let translateX = 0;
      let translateY = 0;

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

        // Get interpolated mouse position for smooth intro
        const mousePos = zoomPanCalculator.interpolateMousePosition(
          mouseEvents,
          currentTimeMs
        );
        
        let targetX = (activeBlock.targetX || 0.5) - 0.5;
        let targetY = (activeBlock.targetY || 0.5) - 0.5;
        
        if (mousePos && progress > 0.3) {
          // Start following mouse after 30% of intro for smoother transition
          const panOffset = zoomPanCalculator.calculatePanOffset(
            mousePos.x,
            mousePos.y,
            videoWidth,
            videoHeight,
            scale
          );
          
          // Blend between initial target and mouse position
          const blendFactor = (progress - 0.3) / 0.7;
          targetX = targetX * (1 - blendFactor) + (targetX + panOffset.x * 0.5) * blendFactor;
          targetY = targetY * (1 - blendFactor) + (targetY + panOffset.y * 0.5) * blendFactor;
        }
        
        translateX = interpolate(progress, [0, 1], [0, -targetX * width * (scale - 1)]);
        translateY = interpolate(progress, [0, 1], [0, -targetY * height * (scale - 1)]);
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

        // Get current mouse position for smooth transition out
        const mousePos = zoomPanCalculator.interpolateMousePosition(
          mouseEvents,
          currentTimeMs
        );
        
        let currentX = (activeBlock.targetX || 0.5) - 0.5;
        let currentY = (activeBlock.targetY || 0.5) - 0.5;
        
        if (mousePos && progress < 0.7) {
          // Continue following mouse during early outro
          const panOffset = zoomPanCalculator.calculatePanOffset(
            mousePos.x,
            mousePos.y,
            videoWidth,
            videoHeight,
            scale
          );
          
          // Gradually reduce mouse influence during outro
          const influenceFactor = 1 - (progress / 0.7);
          currentX += panOffset.x * influenceFactor * 0.5;
          currentY += panOffset.y * influenceFactor * 0.5;
        }
        
        translateX = interpolate(progress, [0, 1], [-currentX * width * (activeBlock.scale - 1), 0]);
        translateY = interpolate(progress, [0, 1], [-currentY * height * (activeBlock.scale - 1), 0]);
      } else {
        // Hold phase - implement dynamic panning based on mouse position
        scale = activeBlock.scale || 2;
        
        // Get interpolated mouse position at current time
        const mousePos = zoomPanCalculator.interpolateMousePosition(
          mouseEvents,
          currentTimeMs
        );
        
        if (mousePos && mouseEvents.length > 0) {
          // Get the screen dimensions from mouse events (accounts for scaling)
          const currentEvent = mouseEvents.find(e => e.timestamp <= currentTimeMs) || mouseEvents[0];
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
          
          // Update smooth pan with ice-like movement (high smoothing)
          const iceSmoothingFactor = 0.08; // Lower = more ice-like
          smoothPan.x += (panOffset.x - smoothPan.x) * iceSmoothingFactor;
          smoothPan.y += (panOffset.y - smoothPan.y) * iceSmoothingFactor;
          
          console.log('[VideoLayer] Smooth pan after:', { ...smoothPan });
          
          // Apply initial target position plus dynamic pan
          const baseTargetX = (activeBlock.targetX || 0.5) - 0.5;
          const baseTargetY = (activeBlock.targetY || 0.5) - 0.5;
          
          // Combine base position with smooth dynamic pan
          const dynamicTargetX = baseTargetX + smoothPan.x;
          const dynamicTargetY = baseTargetY + smoothPan.y;
          
          translateX = -dynamicTargetX * width * (scale - 1);
          translateY = -dynamicTargetY * height * (scale - 1);
          
          console.log('[VideoLayer] Final transform:', {
            baseTarget: { x: baseTargetX, y: baseTargetY },
            dynamicTarget: { x: dynamicTargetX, y: dynamicTargetY },
            translate: { x: translateX, y: translateY },
            scaleMinusOne: scale - 1,
            width,
            height
          });
        } else {
          // Fallback if no mouse data
          const targetX = (activeBlock.targetX || 0.5) - 0.5;
          const targetY = (activeBlock.targetY || 0.5) - 0.5;
          translateX = -targetX * width * (scale - 1);
          translateY = -targetY * height * (scale - 1);
        }
      }

      // The zoom should be relative to the video content, not the canvas
      // We need to consider that the video is positioned at offsetX, offsetY
      // and has size drawWidth x drawHeight
      
      // Calculate the zoom center point in video coordinates (0-1)
      const zoomCenterX = activeBlock.targetX || 0.5;
      const zoomCenterY = activeBlock.targetY || 0.5;
      
      // Calculate the translation needed to keep the zoom center in place
      // Formula: We want to move the zoom center to the center of the viewport
      // Then scale, then move back
      const translateToCenter = {
        x: (0.5 - zoomCenterX) * drawWidth,
        y: (0.5 - zoomCenterY) * drawHeight
      };
      
      // Add dynamic pan offset
      const panX = smoothPan.x * drawWidth * (scale - 1) / scale;
      const panY = smoothPan.y * drawHeight * (scale - 1) / scale;
      
      // Combine translations
      const finalTranslateX = translateToCenter.x + panX;
      const finalTranslateY = translateToCenter.y + panY;
      
      transform = `translate(${finalTranslateX}px, ${finalTranslateY}px) scale(${scale})`;
      
      console.log('[VideoLayer] Transform calculation:', {
        zoomCenter: { x: zoomCenterX, y: zoomCenterY },
        translateToCenter,
        pan: { x: panX, y: panY },
        finalTranslate: { x: finalTranslateX, y: finalTranslateY },
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
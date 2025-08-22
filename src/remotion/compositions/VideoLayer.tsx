import React, { useMemo } from 'react';
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

      if (elapsed < introMs) {
        // Intro phase - zoom in with dynamic mouse tracking
        const progress = elapsed / introMs;
        scale = interpolate(
          progress,
          [0, 1],
          [1, activeBlock.scale || 2],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: (t: number) => 1 - Math.pow(2, -10 * t) // easeOutExpo
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
        // Outro phase - zoom out with smooth return
        const outroElapsed = elapsed - (blockDuration - outroMs);
        const progress = outroElapsed / outroMs;
        scale = interpolate(
          progress,
          [0, 1],
          [activeBlock.scale || 2, 1],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: (t: number) => t * t // easeInQuad for smooth outro
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
        
        if (mousePos) {
          // Calculate dynamic pan offset based on current mouse position
          const panOffset = zoomPanCalculator.calculatePanOffset(
            mousePos.x,
            mousePos.y,
            videoWidth,
            videoHeight,
            scale
          );
          
          // Apply initial target position plus dynamic pan
          const baseTargetX = (activeBlock.targetX || 0.5) - 0.5;
          const baseTargetY = (activeBlock.targetY || 0.5) - 0.5;
          
          // Combine base position with dynamic pan
          const dynamicTargetX = baseTargetX + panOffset.x;
          const dynamicTargetY = baseTargetY + panOffset.y;
          
          translateX = -dynamicTargetX * width * (scale - 1);
          translateY = -dynamicTargetY * height * (scale - 1);
        } else {
          // Fallback to static position if no mouse data
          const targetX = (activeBlock.targetX || 0.5) - 0.5;
          const targetY = (activeBlock.targetY || 0.5) - 0.5;
          translateX = -targetX * width * (scale - 1);
          translateY = -targetY * height * (scale - 1);
        }
      }

      // Apply transform to the video itself, not the container
      // The translate values need to be adjusted for the actual video size
      const actualTranslateX = translateX * (drawWidth / width);
      const actualTranslateY = translateY * (drawHeight / height);
      transform = `scale(${scale}) translate(${actualTranslateX}px, ${actualTranslateY}px)`;
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
          transformOrigin: 'center center',
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
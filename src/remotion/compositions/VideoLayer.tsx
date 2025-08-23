import React from 'react';
import { Video, AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';

export const VideoLayer: React.FC<VideoLayerProps & { preCalculatedPan?: { x: number; y: number } }> = ({
  videoUrl,
  startFrom = 0,
  endAt,
  effects,
  zoom,
  videoWidth,
  videoHeight,
  preCalculatedPan
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Use pre-calculated pan from MainComposition
  const smoothPan = preCalculatedPan || { x: 0, y: 0 };

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

      // Calculate zoom interpolation with consistent easing
      let scale = 1;

      const introMs = activeBlock.introMs || 400;
      const outroMs = activeBlock.outroMs || 400;

      // Easing functions matching MainComposition
      const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const easeInExpo = (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);

      if (elapsed < introMs) {
        // Intro phase - zoom in smoothly
        const progress = elapsed / introMs;
        scale = interpolate(
          progress,
          [0, 1],
          [1, activeBlock.scale || 2],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easeOutExpo
          }
        );
      } else if (elapsed > blockDuration - outroMs) {
        // Outro phase - zoom out smoothly
        const outroElapsed = elapsed - (blockDuration - outroMs);
        const progress = outroElapsed / outroMs;
        scale = interpolate(
          progress,
          [0, 1],
          [activeBlock.scale || 2, 1],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easeInExpo
          }
        );
      } else {
        // Hold phase - maintain zoom scale
        scale = activeBlock.scale || 2;
      }

      // Calculate the zoom center point in video coordinates (0-1)
      const zoomCenterX = activeBlock.targetX || 0.5;
      const zoomCenterY = activeBlock.targetY || 0.5;

      // Convert to pixel coordinates relative to video container
      const zoomPointX = zoomCenterX * drawWidth;
      const zoomPointY = zoomCenterY * drawHeight;
      
      // Calculate the center of the video container
      const centerX = drawWidth / 2;
      const centerY = drawHeight / 2;
      
      // Calculate offset from center to zoom point
      const offsetFromCenterX = zoomPointX - centerX;
      const offsetFromCenterY = zoomPointY - centerY;
      
      // Scale compensation to keep zoom point fixed
      const scaleCompensationX = -offsetFromCenterX * (scale - 1);
      const scaleCompensationY = -offsetFromCenterY * (scale - 1);

      // Add the dynamic pan offset (already scaled properly from MainComposition)
      const panX = smoothPan.x * drawWidth * scale;  // Scale pan with zoom
      const panY = smoothPan.y * drawHeight * scale;  // Scale pan with zoom

      // Apply transform - translate first, then scale
      // This ensures pan movement is applied correctly
      const translateX = scaleCompensationX + panX;
      const translateY = scaleCompensationY + panY;
      transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
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
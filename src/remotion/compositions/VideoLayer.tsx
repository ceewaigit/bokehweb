import React from 'react';
import { Video, AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';

export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  startFrom = 0,
  endAt,
  effects,
  zoom,
  currentFrame
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Get actual padding from effects or use default
  const padding = effects?.background?.padding || 0;
  
  // Calculate video position with padding - maintain aspect ratio
  const availableWidth = width - (padding * 2);
  const availableHeight = height - (padding * 2);
  
  // Assume 16:9 aspect ratio for the video (we should get this from metadata)
  const videoAspectRatio = 16 / 9;
  const containerAspectRatio = availableWidth / availableHeight;
  
  let drawWidth: number;
  let drawHeight: number;
  let offsetX: number;
  let offsetY: number;
  
  if (videoAspectRatio > containerAspectRatio) {
    // Video is wider than container - fit by width
    drawWidth = availableWidth;
    drawHeight = availableWidth / videoAspectRatio;
    offsetX = padding;
    offsetY = padding + (availableHeight - drawHeight) / 2;
  } else {
    // Video is taller than container - fit by height
    drawHeight = availableHeight;
    drawWidth = availableHeight * videoAspectRatio;
    offsetX = padding + (availableWidth - drawWidth) / 2;
    offsetY = padding;
  }

  // Apply zoom if enabled
  let transform = '';
  let clipPath = '';

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
        // Intro phase - zoom in
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

        const targetX = (activeBlock.targetX || 0.5) - 0.5;
        const targetY = (activeBlock.targetY || 0.5) - 0.5;
        translateX = interpolate(progress, [0, 1], [0, -targetX * width * (scale - 1)]);
        translateY = interpolate(progress, [0, 1], [0, -targetY * height * (scale - 1)]);
      } else if (elapsed > blockDuration - outroMs) {
        // Outro phase - zoom out
        const outroElapsed = elapsed - (blockDuration - outroMs);
        const progress = outroElapsed / outroMs;
        scale = interpolate(
          progress,
          [0, 1],
          [activeBlock.scale || 2, 1],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          }
        );

        const targetX = (activeBlock.targetX || 0.5) - 0.5;
        const targetY = (activeBlock.targetY || 0.5) - 0.5;
        translateX = interpolate(progress, [0, 1], [-targetX * width * (activeBlock.scale - 1), 0]);
        translateY = interpolate(progress, [0, 1], [-targetY * height * (activeBlock.scale - 1), 0]);
      } else {
        // Hold phase
        scale = activeBlock.scale || 2;
        const targetX = (activeBlock.targetX || 0.5) - 0.5;
        const targetY = (activeBlock.targetY || 0.5) - 0.5;
        translateX = -targetX * width * (scale - 1);
        translateY = -targetY * height * (scale - 1);

        // Smart panning can be added here if needed
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
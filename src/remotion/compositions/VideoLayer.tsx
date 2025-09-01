import React from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';

export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  effects,
  zoomBlocks,
  videoWidth,
  videoHeight,
  captureArea,
  zoomCenter,
  cinematicPan
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Use fixed zoom center and optional pan from MainComposition
  const fixedZoomCenter = zoomCenter || { x: 0.5, y: 0.5 };
  const smoothPan = cinematicPan || { x: 0, y: 0 };

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Get background effect for padding and styling
  const backgroundEffect = effects?.find(e =>
    e.type === 'background' &&
    e.enabled &&
    currentTimeMs >= e.startTime &&
    currentTimeMs <= e.endTime
  );
  const backgroundData = backgroundEffect?.data as any
  const padding = backgroundData?.padding || 0;
  const cornerRadius = backgroundData?.cornerRadius || 0;
  const shadowIntensity = backgroundData?.shadowIntensity || 0;

  // Calculate video position using shared utility
  const { drawWidth, drawHeight, offsetX, offsetY } = calculateVideoPosition(
    width,
    height,
    videoWidth,
    videoHeight,
    padding
  );

  // Apply zoom if enabled
  let transform = '';

  if (zoomBlocks && zoomBlocks.length > 0) {
    // Find active zoom block
    const activeBlock = zoomBlocks.find(
      block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
    );

    // Calculate zoom transformation with fixed center and cinematic pan
    const zoomTransform = calculateZoomTransform(
      activeBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      fixedZoomCenter,  // Fixed zoom center for stable zoom
      smoothPan  // Cinematic pan for edge following
    );

    // Generate transform string
    transform = getZoomTransformString(zoomTransform);
  }

  // Simple video style - always show full video with contain
  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const
  };

  // Calculate shadow based on intensity (0-100)
  const shadowOpacity = (shadowIntensity / 100) * 0.5;
  const shadowBlur = 25 + (shadowIntensity / 100) * 25;
  const shadowSpread = -12 + (shadowIntensity / 100) * 6;

  return (
    <AbsoluteFill>
      {/* Shadow layer - rendered separately to ensure visibility */}
      {shadowIntensity > 0 && (
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: drawWidth,
            height: drawHeight,
            borderRadius: `${cornerRadius}px`,
            boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px ${shadowSpread}px rgba(0, 0, 0, ${shadowOpacity}), 0 ${shadowBlur * 0.6}px ${shadowBlur * 1.2}px ${shadowSpread * 0.66}px rgba(0, 0, 0, ${shadowOpacity * 0.8})`,
            transform,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
            willChange: 'transform' // GPU acceleration hint
          }}
        />
      )}
      {/* Video container */}
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: drawWidth,
          height: drawHeight,
          borderRadius: `${cornerRadius}px`,
          overflow: 'hidden',
          transform,
          transformOrigin: '50% 50%',
          willChange: 'transform' // GPU acceleration hint
        }}
      >
        <Video
          src={videoUrl}
          style={videoStyle}
          volume={1}
          muted={false}
          onError={(e) => {
            console.error('Video playback error in VideoLayer:', e)
            // Don't throw - let Remotion handle gracefully
          }}
          // Performance optimization
          acceptableTimeShiftInSeconds={0.1}
        />
      </div>
    </AbsoluteFill>
  );
};
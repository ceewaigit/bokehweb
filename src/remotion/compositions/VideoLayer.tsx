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
  preCalculatedPan,
  mousePosition
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Use pre-calculated pan from MainComposition
  const smoothPan = preCalculatedPan || { x: 0, y: 0 };

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Get background effect for padding
  const backgroundEffect = effects?.find(e => 
    e.type === 'background' && 
    e.enabled &&
    currentTimeMs >= e.startTime && 
    currentTimeMs <= e.endTime
  );
  const padding = backgroundEffect ? (backgroundEffect.data as any).padding : 0;
  
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

    // Calculate zoom transformation using shared utility
    const zoomTransform = calculateZoomTransform(
      activeBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      smoothPan,
      mousePosition  // Pass current mouse position for dynamic zoom target
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

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: drawWidth,
          height: drawHeight,
          borderRadius: '12px',
          overflow: 'hidden',
          transform,
          transformOrigin: '50% 50%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)'
        }}
      >
        <Video
          src={videoUrl}
          style={videoStyle}
          onError={(e) => {
            console.error('Video playback error in VideoLayer:', e)
            // Don't throw - let Remotion handle gracefully
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
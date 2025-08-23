import React from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';

export const VideoLayer: React.FC<VideoLayerProps & { 
  preCalculatedPan?: { x: number; y: number },
  mousePosition?: { x: number; y: number }  // Current mouse position for zoom target
}> = ({
  videoUrl,
  effects,
  zoom,
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

  // Apply corner radius if specified
  const cornerRadius = effects?.video?.cornerRadius || 0;
  const borderRadiusStyle = cornerRadius > 0 ? `${cornerRadius}px` : '0';

  // Apply shadow if enabled
  const shadowStyle = effects?.video?.shadow?.enabled
    ? {
      filter: `drop-shadow(${effects.video.shadow.offset.x}px ${effects.video.shadow.offset.y}px ${effects.video.shadow.blur}px ${effects.video.shadow.color})`
    }
    : {};

  // Determine video style based on capture area (area selection vs full recording)
  // Only treat as area selection if it has x,y coordinates (not at origin) or explicit width/height different from video
  const isAreaSelection = captureArea && 
    typeof captureArea.x === 'number' && 
    typeof captureArea.y === 'number' &&
    typeof captureArea.width === 'number' && 
    typeof captureArea.height === 'number' &&
    (captureArea.x > 0 || captureArea.y > 0 || 
     (captureArea.width !== videoWidth || captureArea.height !== videoHeight));

  const videoStyle: React.CSSProperties = isAreaSelection ? (() => {
    // Area selection: scale and position to show only the selected region
    const scale = Math.min(drawWidth / captureArea.width, drawHeight / captureArea.height);
    return {
      position: 'absolute' as const,
      width: videoWidth * scale,
      height: videoHeight * scale,
      left: -(captureArea.x * scale) + (drawWidth - captureArea.width * scale) / 2,
      top: -(captureArea.y * scale) + (drawHeight - captureArea.height * scale) / 2,
      objectFit: 'none' as const
    };
  })() : {
    // Full screen/window: show entire video
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const  // Show full video without cropping
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
          borderRadius: borderRadiusStyle,
          overflow: 'hidden',
          transform,
          transformOrigin: '50% 50%',
          ...shadowStyle
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
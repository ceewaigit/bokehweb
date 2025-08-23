import React from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';

export const VideoLayer: React.FC<VideoLayerProps & { preCalculatedPan?: { x: number; y: number } }> = ({
  videoUrl,
  effects,
  zoom,
  videoWidth,
  videoHeight,
  captureArea,
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

    // Calculate zoom transformation using shared utility
    const zoomTransform = calculateZoomTransform(
      activeBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      smoothPan
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

  // Apply cropping for window/area recordings
  let videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const
  };

  // Only apply capture area cropping for area selections
  console.log('🎬 VideoLayer render - Capture area:', captureArea, 'Video dimensions:', videoWidth, 'x', videoHeight)
  
  // Only crop if we have a specific capture area (for area selections)
  // No capture area = full screen or window recording
  if (captureArea && captureArea.width > 0 && captureArea.height > 0) {
    // This is an area selection - apply cropping
    const scale = Math.min(drawWidth / captureArea.width, drawHeight / captureArea.height);
    
    videoStyle = {
      position: 'absolute' as const,
      width: videoWidth * scale,
      height: videoHeight * scale,
      left: -(captureArea.x * scale) + (drawWidth - captureArea.width * scale) / 2,
      top: -(captureArea.y * scale) + (drawHeight - captureArea.height * scale) / 2,
      objectFit: 'none' as const
    };
    
    console.log('📏 Applying area selection cropping:', {
      captureArea,
      scale,
      videoStyle,
      drawDimensions: { drawWidth, drawHeight }
    })
  } else {
    console.log('✅ Full screen/window recording - using full video (no cropping)', {
      captureArea,
      videoWidth,
      videoHeight
    })
  }

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
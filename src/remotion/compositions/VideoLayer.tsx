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

  // Calculate video cropping for area/window selection
  let videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const
  };

  if (captureArea && captureArea.width > 0 && captureArea.height > 0) {
    // The video captured the full screen, but we only want to show the window/area
    // We need to crop and scale the video to show only the capture area
    
    // Calculate the scale needed to fit the capture area into the draw area
    const scaleX = drawWidth / captureArea.width;
    const scaleY = drawHeight / captureArea.height;
    
    // Use uniform scale to maintain aspect ratio
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate the scaled dimensions of the full video
    const scaledVideoWidth = videoWidth * scale;
    const scaledVideoHeight = videoHeight * scale;
    
    // Calculate offset to show only the capture area
    // The capture area x,y are in screen coordinates
    const offsetLeft = -(captureArea.x * scale);
    const offsetTop = -(captureArea.y * scale);
    
    // Center the cropped area if it's smaller than the container
    const cropWidth = captureArea.width * scale;
    const cropHeight = captureArea.height * scale;
    const centerOffsetX = (drawWidth - cropWidth) / 2;
    const centerOffsetY = (drawHeight - cropHeight) / 2;
    
    videoStyle = {
      position: 'absolute',
      width: scaledVideoWidth,
      height: scaledVideoHeight,
      left: offsetLeft + centerOffsetX,
      top: offsetTop + centerOffsetY,
      objectFit: 'none' as const
    };
    
    console.log('Cropping video for capture area:', {
      captureArea,
      scale,
      scaledVideoWidth,
      scaledVideoHeight,
      offsetLeft,
      offsetTop
    });
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
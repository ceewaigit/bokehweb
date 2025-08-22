import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import type { MainCompositionProps } from './types';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents,
  videoWidth,
  videoHeight
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Calculate video position based on padding - must match VideoLayer calculation
  const padding = effects?.background?.padding || 0;
  
  // Calculate video position with padding - maintain aspect ratio
  const availableWidth = width - (padding * 2);
  const availableHeight = height - (padding * 2);
  
  // Use actual video aspect ratio
  const videoAspectRatio = videoWidth / videoHeight;
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
  
  const videoPosition = { drawWidth, drawHeight, offsetX, offsetY };

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

  // Get zoom state if zoom is enabled
  const zoomEnabled = effects?.zoom?.enabled;
  const zoomBlocks = effects?.zoom?.blocks || [];

  // Find active zoom block
  let zoomState = { scale: 1, x: 0.5, y: 0.5 };
  if (zoomEnabled && clip) {
    const clipRelativeTime = currentTimeMs;
    const activeZoomBlock = zoomBlocks.find(
      block => clipRelativeTime >= block.startTime && clipRelativeTime <= block.endTime
    );

    if (activeZoomBlock) {
      // Calculate zoom interpolation
      const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
      const blockProgress = (clipRelativeTime - activeZoomBlock.startTime) / blockDuration;

      // Apply intro/outro transitions
      let scale = activeZoomBlock.scale || 2;
      let x = activeZoomBlock.targetX || 0.5;
      let y = activeZoomBlock.targetY || 0.5;

      const introMs = activeZoomBlock.introMs || 300;
      const outroMs = activeZoomBlock.outroMs || 300;
      const elapsed = clipRelativeTime - activeZoomBlock.startTime;

      if (elapsed < introMs) {
        // Intro phase
        const introProgress = elapsed / introMs;
        scale = 1 + (scale - 1) * easeOutExpo(introProgress);
        x = 0.5 + (x - 0.5) * easeOutExpo(introProgress);
        y = 0.5 + (y - 0.5) * easeOutExpo(introProgress);
      } else if (elapsed > blockDuration - outroMs) {
        // Outro phase
        const outroElapsed = elapsed - (blockDuration - outroMs);
        const outroProgress = outroElapsed / outroMs;
        scale = activeZoomBlock.scale - (activeZoomBlock.scale - 1) * outroProgress;
        x = activeZoomBlock.targetX + (0.5 - activeZoomBlock.targetX) * outroProgress;
        y = activeZoomBlock.targetY + (0.5 - activeZoomBlock.targetY) * outroProgress;
      }

      zoomState = { scale, x, y };
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Layer */}
      <Sequence from={0}>
        <BackgroundLayer
          effects={effects?.background}
          videoWidth={width}
          videoHeight={height}
        />
      </Sequence>

      {/* Video Layer with effects */}
      {videoUrl && (
        <Sequence from={0}>
          <VideoLayer
            videoUrl={videoUrl}
            startFrom={clip?.sourceIn ? clip.sourceIn / 1000 : 0}
            endAt={clip?.sourceOut ? clip.sourceOut / 1000 : undefined}
            effects={effects}
            zoom={effects?.zoom}
            currentFrame={frame}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
          />
        </Sequence>
      )}

      {/* Cursor Layer */}
      {cursorEvents.length > 0 && (
        <Sequence from={0}>
          <CursorLayer
            cursorEvents={cursorEvents}
            clickEvents={clickEvents}
            currentFrame={frame}
            fps={fps}
            videoOffset={{
              x: videoPosition.offsetX,
              y: videoPosition.offsetY,
              width: videoPosition.drawWidth,
              height: videoPosition.drawHeight
            }}
            zoom={zoomState}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};

// Easing function for smooth transitions
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
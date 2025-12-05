/**
 * Shared Video Controller - Maintains a single video element across all clips
 *
 * This component eliminates video blinking between clips by keeping one video
 * element mounted and dynamically updating its properties as the timeline progresses.
 *
 * Key responsibilities:
 * - Determine active clip at current frame
 * - Calculate source time and video playback parameters
 * - Apply all transforms (zoom, 3D screen effects, cinematic)
 * - Render single video element with effects
 */

import React, { useMemo } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { VideoPositionProvider } from '../context/VideoPositionContext';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { calculateScreenTransform } from './utils/screen-transform';
import { useVideoUrl } from '../hooks/useVideoUrl';
import { EffectType } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import type { Effect } from '@/types/project';
import { useZoomState } from '../hooks/useZoomState';

export interface SharedVideoControllerProps {
  videoWidth: number;
  videoHeight: number;
  effects: Effect[];
  videoUrls?: Record<string, string>;
  children?: React.ReactNode;
}

export const SharedVideoController: React.FC<SharedVideoControllerProps> = ({
  videoWidth,
  videoHeight,
  effects,
  videoUrls,
  children,
}) => {
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fps, getClipAtTimelinePosition, getRecording } = useTimeContext();

  // Calculate current timeline position in milliseconds
  const currentTimeMs = (currentFrame / fps) * 1000;

  // Find active clip at current timeline position
  const activeClipData = useMemo(() => {
    const clip = getClipAtTimelinePosition(currentTimeMs);

    if (!clip) {
      return null;
    }

    const recording = getRecording(clip.recordingId);
    if (!recording) return null;

    // Calculate source time (time in original recording)
    const clipElapsedMs = currentTimeMs - clip.startTime;
    const sourceTimeMs = (clip.sourceIn || 0) + clipElapsedMs * (clip.playbackRate || 1);

    // Filter effects to only those that overlap with this clip's timeline range
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    const filteredEffects = effects.filter(effect => {
      return effect.startTime < clipEnd && effect.endTime > clipStart;
    });

    return {
      clip,
      recording,
      sourceTimeMs,
      effects: filteredEffects,
    };
  }, [currentTimeMs, getClipAtTimelinePosition, getRecording, effects, fps]);

  // Use custom hook for video URL resolution (SRP)
  const videoUrl = useVideoUrl({
    recording: activeClipData?.recording,
    videoUrls
  });

  // Use custom hook for zoom state calculation (SRP)
  // Must be called unconditionally at top level
  const { activeZoomBlock: calculatedZoomBlock, zoomCenter: calculatedZoomCenter } = useZoomState({
    effects: activeClipData?.effects || [],
    sourceTimeMs: activeClipData?.sourceTimeMs || 0,
    recording: activeClipData?.recording
  });

  // All hooks must be called before any conditional returns
  // Calculate all values with proper null handling
  const renderData = useMemo(() => {
    if (!activeClipData || !videoUrl) {
      return null;
    }

    const { clip, recording, sourceTimeMs, effects: clipEffects } = activeClipData;

    // Get background effect for padding and styling
    const backgroundEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Background, sourceTimeMs);
    const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;
    const padding = backgroundData?.padding || 0;
    const cornerRadius = backgroundData?.cornerRadius || 0;
    const shadowIntensity = backgroundData?.shadowIntensity || 0;

    // Calculate video position with padding
    const { drawWidth, drawHeight, offsetX, offsetY } = calculateVideoPosition(
      width,
      height,
      videoWidth,
      videoHeight,
      padding
    );

    // Calculate zoom transformation
    const zoomTransform = calculateZoomTransform(
      calculatedZoomBlock,
      sourceTimeMs,
      drawWidth,
      drawHeight,
      calculatedZoomCenter,
      undefined // computedScale not needed
    );
    const transform = getZoomTransformString(zoomTransform);

    // Calculate 3D screen effect transform (SRP)
    const extra3DTransform = calculateScreenTransform(clipEffects, sourceTimeMs);

    return {
      clip,
      recording,
      videoUrl,
      sourceTimeMs,
      clipEffects,
      activeZoomBlock: calculatedZoomBlock,
      zoomCenter: calculatedZoomCenter,
      backgroundData,
      padding,
      cornerRadius,
      shadowIntensity,
      drawWidth,
      drawHeight,
      offsetX,
      offsetY,
      transform,
      extra3DTransform,
      zoomTransform,
    };
  }, [activeClipData, videoUrl, width, height, videoWidth, videoHeight, calculatedZoomBlock, calculatedZoomCenter]);

  // Debug logging to understand video rendering issues
  console.log('[SharedVideoController] Debug:', {
    currentFrame,
    currentTimeMs,
    clipFound: !!activeClipData?.clip,
    clipId: activeClipData?.clip?.id,
    sourceIn: activeClipData?.clip?.sourceIn,
    sourceOut: activeClipData?.clip?.sourceOut,
    playbackRate: activeClipData?.clip?.playbackRate,
    videoUrl,
    renderDataExists: !!renderData,
  });

  // If no active clip, render empty frame
  if (!renderData) {
    console.warn('[SharedVideoController] No renderData - returning black frame', {
      activeClipDataExists: !!activeClipData,
      videoUrlExists: !!videoUrl,
    });
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  const {
    clip,
    videoUrl: finalVideoUrl,
    padding,
    cornerRadius,
    shadowIntensity,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    transform,
    extra3DTransform,
    zoomTransform,
  } = renderData;

  // Build context value to share with CursorLayer and other overlays
  const videoPositionValue = {
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    zoomTransform,
    padding,
    videoWidth,
    videoHeight,
  };

  // Combine all transforms
  const combinedTransform = `${transform}${extra3DTransform}`.trim();

  // Calculate shadow
  const shadowOpacity = (shadowIntensity / 100) * 0.5;
  const shadowBlur = 25 + (shadowIntensity / 100) * 25;

  const dropShadow =
    shadowIntensity > 0
      ? `drop-shadow(0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0, 0, 0, ${shadowOpacity})) drop-shadow(0 ${shadowBlur * 0.6}px ${shadowBlur * 1.2}px rgba(0, 0, 0, ${shadowOpacity * 0.8}))`
      : '';

  // Calculate video start/end positions based on clip source range
  // Convert from milliseconds to FRAMES (Remotion Video expects frames)
  const startFrom = ((clip.sourceIn || 0) * fps) / 1000;
  const calculatedSourceOut =
    clip.sourceOut != null && isFinite(clip.sourceOut)
      ? clip.sourceOut
      : (clip.sourceIn || 0) + clip.duration * (clip.playbackRate || 1);
  const endAt = (calculatedSourceOut * fps) / 1000;

  // Calculate clip timing for Sequence wrapper
  // This fixes the startFrom/endAt calculation when Video is not inside a per-clip Sequence
  const clipStartFrame = Math.round((clip.startTime / 1000) * fps);
  const clipDurationFrames = Math.max(1, Math.round((clip.duration / 1000) * fps));

  // Debug: Log video playback parameters
  console.log('[SharedVideoController] Video params:', {
    clipId: clip.id,
    startFrom,
    endAt,
    playbackRate: clip.playbackRate,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    calculatedSourceOut,
    clipStartFrame,
    clipDurationFrames,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    fps,
  });

  // Simple video style
  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  };

  // Use Video for preview (smooth scrubbing), OffthreadVideo for rendering (avoids Chrome buffer overflow)
  const { isRendering } = getRemotionEnvironment();
  const VideoComponent = isRendering ? OffthreadVideo : Video;

  return (
    <VideoPositionProvider value={videoPositionValue}>
      <AbsoluteFill style={{ zIndex: 50 }}>
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: drawWidth,
            height: drawHeight,
            borderRadius: `${cornerRadius}px`,
            overflow: 'hidden',
            transform: `translate3d(0,0,0) ${combinedTransform}`,
            transformOrigin: '50% 50%',
            filter: dropShadow || undefined,
            willChange: 'transform, filter',
            backfaceVisibility: 'hidden' as const,
          }}
        >
          {/* Sequence wrapper fixes startFrom/endAt calculation for split clips */}
          {/* Without this, Video at composition level uses absolute frame, causing seek past EOF */}
          <Sequence from={clipStartFrame} durationInFrames={clipDurationFrames} name={`Video-${clip.id}`}>
            <VideoComponent
              // Preview: Video (smooth scrubbing), Rendering: OffthreadVideo (FFmpeg, no Chrome buffer overflow)
              src={finalVideoUrl}
              style={videoStyle}
              volume={1}
              muted={false}
              pauseWhenBuffering={false}
              crossOrigin="anonymous"
              startFrom={startFrom}
              endAt={endAt}
              playbackRate={clip.playbackRate || 1}
              onError={(e) => {
                const errorMsg = `Video failed to load: ${finalVideoUrl}`;
                console.error('[SharedVideoController] Video playback error:', {
                  error: e,
                  videoUrl: finalVideoUrl,
                  clipId: clip.id,
                  message: e instanceof Error ? e.message : 'Unknown error',
                });
                // STABILITY FIX: Throw error to stop rendering with corrupt video
                // This prevents silent export failures with black frames
                throw new Error(errorMsg);
              }}
            />
          </Sequence>
        </div>
      </AbsoluteFill>
      {/* Render overlay children (ClipSequences with cursor, keystrokes, etc.) */}
      {children}
    </VideoPositionProvider>
  );
};


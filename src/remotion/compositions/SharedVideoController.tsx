/**
 * Shared Video Controller - Multi-Video Architecture
 *
 * This component prevents video blinking between clips by rendering one video
 * element per unique recording, ALL kept mounted simultaneously.
 * Only CSS visibility toggles which video is shown.
 *
 * Key responsibilities:
 * - Render one persistent video per unique recording (no remounting!)
 * - Toggle visibility based on active clip's recording
 * - Calculate startFrom per-recording for correct frame display
 * - Apply all transforms (zoom, 3D screen effects, cinematic)
 */

import React, { useMemo } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { VideoPositionProvider } from '../context/VideoPositionContext';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { calculateScreenTransform } from './utils/screen-transform';
import { EffectType } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import type { Effect, Recording, Clip } from '@/types/project';
import { useZoomState } from '../hooks/useZoomState';
import { RecordingStorage } from '@/lib/storage/recording-storage';

export interface SharedVideoControllerProps {
  videoWidth: number;
  videoHeight: number;
  effects: Effect[];
  videoUrls?: Record<string, string>;
  children?: React.ReactNode;
}

/**
 * Calculate a STABLE startFrom for a recording that works for ALL clips using it.
 * 
 * KEY INSIGHT: startFrom must be constant throughout playback to avoid seeks.
 * We calculate it based on the FIRST clip using this recording, ensuring the
 * video plays continuously from composition start.
 * 
 * For the video to show the correct frame at any point:
 * - At composition frame F, Remotion shows: startFrom + F * playbackRate
 * - For clip starting at clipStartFrame with sourceIn at sourceInFrame:
 *   startFrom + clipStartFrame * playbackRate = sourceInFrame
 *   startFrom = sourceInFrame - clipStartFrame * playbackRate
 */
function calculateStableRecordingParams(
  recording: Recording,
  allClips: Clip[],
  fps: number
): { startFrom: number; endAt: number; playbackRate: number } {
  // Find the FIRST clip using this recording (ordered by timeline position)
  const clipsSorted = allClips
    .filter(c => c.recordingId === recording.id)
    .sort((a, b) => a.startTime - b.startTime);

  if (clipsSorted.length === 0) {
    // No clips use this recording - shouldn't happen, but return defaults
    return {
      startFrom: 0,
      endAt: Math.round((recording.duration || 60000) * fps / 1000),
      playbackRate: 1
    };
  }

  // Use the first clip to establish the stable offset
  const firstClip = clipsSorted[0];
  const clipStartFrame = Math.round((firstClip.startTime / 1000) * fps);
  const safeSourceIn = Math.max(0, firstClip.sourceIn || 0);
  const sourceInFrame = Math.round((safeSourceIn * fps) / 1000);
  const playbackRate = firstClip.playbackRate || 1;

  // Calculate stable startFrom: at clipStartFrame, video shows sourceInFrame
  const startFrom = Math.max(0, Math.round(sourceInFrame - clipStartFrame * playbackRate));

  // endAt: use recording duration to allow playing through all clips
  const endAt = Math.max(startFrom + 1, Math.round((recording.duration || 60000) * fps / 1000));

  return { startFrom, endAt, playbackRate };
}


/**
 * Resolve video URL for a recording (used outside of React hook context)
 */
function getVideoUrlForRecording(recording: Recording, videoUrls?: Record<string, string>): string | undefined {
  // Priority 1: Provided videoUrls (export mode)
  if (videoUrls && videoUrls[recording.id]) {
    return videoUrls[recording.id];
  }

  // Priority 2: Cached blob URL
  const cachedUrl = RecordingStorage.getBlobUrl(recording.id);
  if (cachedUrl) {
    return cachedUrl;
  }

  // Priority 3: video-stream protocol
  if (recording.filePath) {
    return `video-stream://local/${encodeURIComponent(recording.filePath)}`;
  }

  return `video-stream://${recording.id}`;
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
  const { fps, clips, getClipAtTimelinePosition, getRecording, recordingsMap } = useTimeContext();

  // Calculate current timeline position in milliseconds
  const currentTimeMs = (currentFrame / fps) * 1000;

  // Extract unique recordings from all clips (stable across frames)
  const uniqueRecordings = useMemo(() => {
    const seen = new Set<string>();
    const recordings: Recording[] = [];

    for (const clip of clips) {
      if (!seen.has(clip.recordingId)) {
        seen.add(clip.recordingId);
        const recording = recordingsMap.get(clip.recordingId);
        if (recording) {
          recordings.push(recording);
        }
      }
    }

    return recordings;
  }, [clips, recordingsMap]);

  // Find active clip at current timeline position
  const activeClipData = useMemo(() => {
    let clip = getClipAtTimelinePosition(currentTimeMs);

    // If no clip at current position, find the nearest one to prevent black frame
    if (!clip && clips.length > 0) {
      let prevClip = clips[0];
      let nextClip = clips[0];
      let foundPrev = false;
      let foundNext = false;

      for (const c of clips) {
        const clipEnd = c.startTime + c.duration;
        if (clipEnd <= currentTimeMs) {
          if (!foundPrev || clipEnd > prevClip.startTime + prevClip.duration) {
            prevClip = c;
            foundPrev = true;
          }
        }
        if (c.startTime > currentTimeMs) {
          if (!foundNext || c.startTime < nextClip.startTime) {
            nextClip = c;
            foundNext = true;
          }
        }
      }

      clip = foundPrev ? prevClip : (foundNext ? nextClip : null);
    }

    if (!clip) {
      return null;
    }

    const recording = getRecording(clip.recordingId);
    if (!recording) return null;

    let clipElapsedMs = currentTimeMs - clip.startTime;
    clipElapsedMs = Math.max(0, Math.min(clipElapsedMs, clip.duration));
    const sourceTimeMs = (clip.sourceIn || 0) + clipElapsedMs * (clip.playbackRate || 1);

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
  }, [currentTimeMs, getClipAtTimelinePosition, getRecording, effects, clips]);

  // Get the active recording ID for visibility toggling
  const activeRecordingId = activeClipData?.recording.id || null;

  // Use custom hook for zoom state calculation
  const { activeZoomBlock: calculatedZoomBlock, zoomCenter: calculatedZoomCenter } = useZoomState({
    effects: effects,
    timelineMs: currentTimeMs,
    sourceTimeMs: activeClipData?.sourceTimeMs,
    recording: activeClipData?.recording,
  });

  // Calculate render data (position, transforms, etc.) for the active clip
  const renderData = useMemo(() => {
    if (!activeClipData) {
      return null;
    }

    const { clip, recording, sourceTimeMs, effects: clipEffects } = activeClipData;
    const backgroundEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Background, sourceTimeMs);
    const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;
    const padding = backgroundData?.padding || 0;
    const cornerRadius = backgroundData?.cornerRadius || 0;
    const shadowIntensity = backgroundData?.shadowIntensity || 0;

    const { drawWidth, drawHeight, offsetX, offsetY } = calculateVideoPosition(
      width,
      height,
      videoWidth,
      videoHeight,
      padding
    );

    const zoomTransform = calculateZoomTransform(
      calculatedZoomBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      calculatedZoomCenter,
      undefined
    );
    const transform = getZoomTransformString(zoomTransform);
    // Screen effects are in TIMELINE-space, so use currentTimeMs (not sourceTimeMs)
    const extra3DTransform = calculateScreenTransform(clipEffects, currentTimeMs);

    return {
      clip,
      recording,
      sourceTimeMs,
      clipEffects,
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
  }, [activeClipData, width, height, videoWidth, videoHeight, calculatedZoomBlock, calculatedZoomCenter, currentTimeMs]);

  // If no clips at all, render black frame
  if (!renderData || uniqueRecordings.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  const {
    clip,
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

  const combinedTransform = `${transform}${extra3DTransform}`.trim();

  const shadowOpacity = (shadowIntensity / 100) * 0.5;
  const shadowBlur = 25 + (shadowIntensity / 100) * 25;
  const dropShadow =
    shadowIntensity > 0
      ? `drop-shadow(0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0, 0, 0, ${shadowOpacity})) drop-shadow(0 ${shadowBlur * 0.6}px ${shadowBlur * 1.2}px rgba(0, 0, 0, ${shadowOpacity * 0.8}))`
      : '';

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
          {/* 
            MULTI-VIDEO FIX: Render one video per unique recording.
            All videos stay mounted - only visibility changes.
            This eliminates blinking caused by React remounting on recording change.
          */}
          {uniqueRecordings.map((recording) => {
            const isActive = recording.id === activeRecordingId;
            const videoUrl = getVideoUrlForRecording(recording, videoUrls);
            // Use STABLE params calculated from ALL clips - startFrom never changes!
            const { startFrom, endAt, playbackRate } = calculateStableRecordingParams(
              recording,
              clips,
              fps
            );

            return (
              <VideoComponent
                key={`video-${recording.id}`}
                src={videoUrl || ''}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain' as const,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  // CRITICAL: Use visibility instead of display/conditional rendering
                  // This keeps the video mounted and buffered while hidden
                  visibility: isActive ? 'visible' : 'hidden',
                  // Ensure hidden videos don't receive pointer events
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
                volume={isActive ? 1 : 0}
                muted={!isActive}
                pauseWhenBuffering={false}
                crossOrigin="anonymous"
                startFrom={startFrom}
                endAt={endAt}
                playbackRate={playbackRate}
                onError={(e) => {
                  if (isActive) {
                    console.error('[SharedVideoController] Video playback error:', {
                      error: e,
                      videoUrl,
                      recordingId: recording.id,
                    });
                  }
                }}
              />
            );
          })}
        </div>
      </AbsoluteFill>
      {children}
    </VideoPositionProvider>
  );
};

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

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Video, OffthreadVideo, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, getRemotionEnvironment, delayRender, continueRender, Freeze } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { VideoPositionProvider } from '../context/VideoPositionContext';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { calculateScreenTransform } from './utils/screen-transform';
import { EffectType } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import type { Effect, Recording } from '@/types/project';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import { buildFrameLayout } from '@/lib/timeline/frame-layout';
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame';
import { usePrecomputedCameraPath } from '@/remotion/hooks/usePrecomputedCameraPath';
export interface SharedVideoControllerProps {
  videoWidth: number;
  videoHeight: number;
  // Native source dimensions for zoom/crop math.
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  preferOffthreadVideo?: boolean;
  effects: Effect[];
  videoUrls?: Record<string, string>;
  children?: React.ReactNode;
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
  sourceVideoWidth,
  sourceVideoHeight,
  preferOffthreadVideo = true,
  effects,
  videoUrls,
  children,
}) => {
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fps, clips, getRecording, recordingsMap } = useTimeContext();
  const { isRendering } = getRemotionEnvironment();

  // Calculate current timeline position in milliseconds
  const currentTimeMs = (currentFrame / fps) * 1000;

  const sortedClips = useMemo(() => {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
  }, [clips]);

  const frameLayout = useMemo(() => buildFrameLayout(sortedClips, fps), [sortedClips, fps]);

  // Find active clip at current timeline position
  const activeClipData = useMemo(() => {
    return getActiveClipDataAtFrame({
      frame: currentFrame,
      frameLayout,
      fps,
      effects,
      getRecording,
    });
  }, [currentFrame, effects, fps, frameLayout, getRecording]);

  // Render-only: prevent blank first frame by waiting for the active video to be ready.
  // Without this, frame 0 can be captured before the browser has decoded the first frame.
  const renderReadyRef = useRef(!isRendering);
  const renderDelayHandleRef = useRef<number | null>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRenderReady = useCallback(() => {
    if (!isRendering) return;
    if (renderReadyRef.current) return;
    renderReadyRef.current = true;

    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    if (renderDelayHandleRef.current != null) {
      continueRender(renderDelayHandleRef.current);
      renderDelayHandleRef.current = null;
    }
  }, [isRendering]);

  // Enhanced handler that ensures the video frame is actually painted before continuing render.
  // onLoadedData/onCanPlay/onCanPlayThrough can fire before the frame is visible on screen.
  // We wait for onSeeked (which fires after seeking to startFrom) and use requestAnimationFrame
  // to ensure the browser has actually painted the frame.
  const handleVideoReady = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isRendering || renderReadyRef.current) return;

    const video = event.currentTarget;

    // Check video readyState - should be at least HAVE_CURRENT_DATA (2) to have a frame
    if (video.readyState < 2) {
      return; // Wait for more data
    }

    // Use requestVideoFrameCallback if available (Chrome/Edge) for precise frame timing
    // Otherwise fall back to double requestAnimationFrame to ensure paint
    if ('requestVideoFrameCallback' in video) {
      (video as any).requestVideoFrameCallback(() => {
        markRenderReady();
      });
    } else {
      // Double rAF ensures the browser has actually painted the frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markRenderReady();
        });
      });
    }
  }, [isRendering, markRenderReady]);

  useEffect(() => {
    if (!isRendering) return;
    if (renderReadyRef.current) return;
    if (currentFrame !== 0) return;

    if (renderDelayHandleRef.current == null) {
      renderDelayHandleRef.current = delayRender('Waiting for first video to load');
    }

    if (!readyTimeoutRef.current) {
      // Safety valve to avoid hanging renders if the media element never fires events.
      readyTimeoutRef.current = setTimeout(() => {
        markRenderReady();
      }, 15000);
    }

    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      // Ensure we never leave a render handle hanging during unmount/teardown.
      if (renderDelayHandleRef.current != null) {
        continueRender(renderDelayHandleRef.current);
        renderDelayHandleRef.current = null;
      }
    };
  }, [currentFrame, isRendering, markRenderReady]);

  // ALWAYS use precomputed camera path for both preview and export.
  // This ensures identical camera behavior - what you see in preview is exactly what exports.
  // Uses stable videoWidth/videoHeight (not composition dimensions) so preview matches export.
  const precomputedCamera = usePrecomputedCameraPath({
    enabled: true,
    currentFrame,
    frameLayout,
    fps,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    effects,
    getRecording,
  });

  // Always use precomputed values - guarantees preview matches export exactly
  const calculatedZoomBlock = precomputedCamera?.activeZoomBlock;
  const calculatedZoomCenter = precomputedCamera?.zoomCenter ?? { x: 0.5, y: 0.5 };

  // Calculate render data (position, transforms, etc.) for the active clip
  const renderData = useMemo(() => {
    if (!activeClipData) {
      return null;
    }

    const { clip, recording, sourceTimeMs, effects: clipEffects } = activeClipData;
    const backgroundEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Background, sourceTimeMs);
    const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null;
    const padding = backgroundData?.padding || 0;
    // RESOLUTION-AGNOSTIC: Use fixed 1080p reference for consistent padding across all source resolutions
    const REFERENCE_WIDTH = 1920;
    const REFERENCE_HEIGHT = 1080;
    const scaleFactor = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
    const paddingScaled = padding * scaleFactor;
    const cornerRadius = (backgroundData?.cornerRadius || 0) * scaleFactor;
    const shadowIntensity = backgroundData?.shadowIntensity || 0;

    const { drawWidth, drawHeight, offsetX, offsetY } = calculateVideoPosition(
      width,
      height,
      sourceVideoWidth ?? videoWidth,
      sourceVideoHeight ?? videoHeight,
      paddingScaled
    );

    const zoomTransform = calculateZoomTransform(
      calculatedZoomBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      calculatedZoomCenter,
      undefined,
      paddingScaled
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
      scaleFactor,
      drawWidth,
      drawHeight,
      offsetX,
      offsetY,
      transform,
      extra3DTransform,
      zoomTransform,
    };
  }, [activeClipData, width, height, videoWidth, videoHeight, sourceVideoWidth, sourceVideoHeight, calculatedZoomBlock, calculatedZoomCenter, currentTimeMs]);

  // If no clips at all, render black frame
  if (!renderData || sortedClips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  const {
    clip,
    padding,
    cornerRadius,
    shadowIntensity,
    scaleFactor,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    transform,
    extra3DTransform,
    zoomTransform,
  } = renderData;

  const combinedTransform = `${transform}${extra3DTransform}`.trim();
  const contentTransform = `translate3d(0,0,0) ${combinedTransform}`.trim();

  const videoPositionValue = {
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    zoomTransform,
    contentTransform,
    padding,
    videoWidth: sourceVideoWidth ?? videoWidth,
    videoHeight: sourceVideoHeight ?? videoHeight,
  };

  const shadowOpacity = (shadowIntensity / 100) * 0.5;
  // Scale shadow blur for resolution-agnostic sizing
  const baseShadowBlur = 25 + (shadowIntensity / 100) * 25;
  const shadowBlur = baseShadowBlur * scaleFactor;
  const dropShadow =
    shadowIntensity > 0
      ? `drop-shadow(0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0, 0, 0, ${shadowOpacity})) drop-shadow(0 ${shadowBlur * 0.6}px ${shadowBlur * 1.2}px rgba(0, 0, 0, ${shadowOpacity * 0.8}))`
      : '';

  const VideoComponent = (isRendering && preferOffthreadVideo) ? OffthreadVideo : Video;
  // Some boundaries decode slower (keyframe distance varies), so we pre-mount the next clip
  // (hidden, muted) for a short window to avoid flashes at clip boundaries.
  const PRELOAD_FRAMES = Math.max(2, Math.round(fps * 0.35));

  return (
    <VideoPositionProvider value={videoPositionValue}>
      {/* Video layer (bottom). Overlays are rendered above via `children`. */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: drawWidth,
            height: drawHeight,
            // Allow the video to pan outside its base draw area during zoom
            // so preview padding/background can be revealed.
            overflow: zoomTransform && zoomTransform.scale > 1.001 ? 'visible' : 'hidden',
            transform: `translate3d(0,0,0) ${combinedTransform}`,
            transformOrigin: '50% 50%',
            filter: dropShadow || undefined,
            willChange: 'transform, filter',
            backfaceVisibility: 'hidden' as const,
          }}
        >
          {/* Correctness-first: render one video per clip inside its own <Sequence>.
              This avoids the “single linear mapping per recording” assumption that breaks after typing-speed splits. */}
          {frameLayout.map(({ clip: clipForVideo, startFrame, durationFrames }) => {
            const recording = recordingsMap.get(clipForVideo.recordingId);
            if (!recording) return null;
            const videoUrl = getVideoUrlForRecording(recording, videoUrls);

            const playbackRate = clipForVideo.playbackRate && clipForVideo.playbackRate > 0 ? clipForVideo.playbackRate : 1;
            const sourceInMs = Math.max(0, clipForVideo.sourceIn || 0);
            const sourceOutMs =
              clipForVideo.sourceOut ?? (sourceInMs + (clipForVideo.duration || 0) * playbackRate);
            const sourceInFrame = Math.round((sourceInMs * fps) / 1000);
            const sourceOutFrame = Math.round((sourceOutMs * fps) / 1000);

            const originalStartFrom = Math.max(0, sourceInFrame);
            // Ensure the video segment is long enough for the timeline duration (after rounding).
            // If `durationFrames` (timeline) slightly exceeds the source frame span due to rounding,
            // the video can end early and appear to "disappear" for the remaining frames.
            const expectedSourceFrames = Math.max(1, Math.ceil(durationFrames * playbackRate));
            const computedEndAt = originalStartFrom + expectedSourceFrames;
            const endAt = Math.max(originalStartFrom + 1, sourceOutFrame, computedEndAt);

            // Calculate preload window
            // We clamp to 0 to avoid negative start frames for the sequence
            const actualPreloadStart = Math.max(0, startFrame - PRELOAD_FRAMES);
            const actualPreloadDuration = startFrame - actualPreloadStart;
            const isPreloading = currentFrame < startFrame;
            const overlapFrames = Math.min(2, durationFrames);
            const preloadDurationWithOverlap = actualPreloadDuration + overlapFrames;
            const shouldRenderPreload = currentFrame < startFrame + overlapFrames;

            const shouldMarkReady = isRendering && currentFrame === 0 && startFrame === 0;

            return (
              <React.Fragment key={`clip-video-fragment-${clipForVideo.id}`}>
                {/* Preload phase - hidden, muted, frozen at first frame.
                    Keep it around for a couple frames into the clip to cover decode/keyframe hiccups
                    that otherwise show up as a flash/blink at clip boundaries. */}
                {shouldRenderPreload && actualPreloadDuration > 0 && (
                  <Sequence from={actualPreloadStart} durationInFrames={preloadDurationWithOverlap}>
                    <Freeze frame={0}>
                      <VideoComponent
                        src={videoUrl || ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain' as const,
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          borderRadius: `${cornerRadius}px`,
                          pointerEvents: 'none',
                          opacity: isPreloading ? 0 : 1,
                        }}
                        volume={0}
                        muted={true}
                        pauseWhenBuffering={false}
                        crossOrigin="anonymous"
                        startFrom={originalStartFrom}
                        endAt={endAt}
                        playbackRate={playbackRate}
                      />
                    </Freeze>
                  </Sequence>
                )}

                {/* Active phase - normal video playback with audio */}
                <Sequence from={startFrame} durationInFrames={durationFrames}>
                  <VideoComponent
                    src={videoUrl || ''}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain' as const,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      borderRadius: `${cornerRadius}px`,
                      pointerEvents: 'none',
                    }}
                    volume={1}
                    muted={false}
                    pauseWhenBuffering={isRendering ? true : false}
                    crossOrigin="anonymous"
                    startFrom={originalStartFrom}
                    endAt={endAt}
                    playbackRate={playbackRate}
                    {...(shouldMarkReady ? ({
                      onLoadedData: handleVideoReady,
                      onCanPlay: handleVideoReady,
                      onSeeked: handleVideoReady,
                    } as any) : {})}
                    onError={(e) => {
                      console.error('[SharedVideoController] Per-clip video playback error:', {
                        error: e,
                        videoUrl,
                        recordingId: recording.id,
                        clipId: clipForVideo.id,
                      });
                    }}
                  />
                </Sequence>
              </React.Fragment>
            );
          })}
        </div>
      </AbsoluteFill>
      {/* Overlay layers (top) */}
      <AbsoluteFill style={{ zIndex: 20 }}>
        {children}
      </AbsoluteFill>
    </VideoPositionProvider>
  );
};

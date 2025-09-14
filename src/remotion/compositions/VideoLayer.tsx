import React, { useMemo, useEffect } from 'react';
import { OffthreadVideo, AbsoluteFill, Series, useCurrentFrame, useVideoConfig, useBufferState } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { createCinematicTransform, createBlurFilter } from '@/lib/effects/cinematic-scroll';

export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  clip,
  nextClip,
  effects,
  zoomBlocks,
  videoWidth,
  videoHeight,
  zoomCenter,
  cinematicScrollState,
  computedScale
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const buffer = useBufferState();

  // Calculate the correct start frame based on clip's sourceIn
  const currentSourceInMs = clip ? (clip.sourceIn || 0) : 0;
  const currentStartFrame = Math.round((currentSourceInMs / 1000) * fps);

  // Calculate duration in frames for current clip
  const clipDurationInFrames = clip ? Math.round((clip.duration / 1000) * fps) : 0;

  // Calculate next clip's start frame and duration if it's a consecutive split
  const nextSourceInMs = nextClip ? (nextClip.sourceIn || 0) : 0;
  const nextStartFrame = Math.round((nextSourceInMs / 1000) * fps);
  const nextDurationInFrames = nextClip ? Math.round((nextClip.duration / 1000) * fps) : 0;

  // Check if next clip is consecutive (split from same recording)
  const isConsecutiveSplit = useMemo(() => {
    if (!clip || !nextClip) return false;
    if (clip.recordingId !== nextClip.recordingId) return false;
    const epsilon = 0.001;
    const currentEndTime = (clip.startTime || 0) + clip.duration;
    const nextStartTime = nextClip.startTime || 0;
    return Math.abs(nextStartTime - currentEndTime) < epsilon;
  }, [clip, nextClip]);

  // Add buffer delay for smoother loading
  useEffect(() => {
    if (!clip) return;

    // Delay playback briefly to ensure video is ready
    const delayHandle = buffer.delayPlayback();

    // Small delay to allow decoder to initialize
    const timer = setTimeout(() => {
      delayHandle.unblock();
    }, 50); // 50ms delay

    return () => {
      clearTimeout(timer);
      delayHandle.unblock();
    };
  }, [clip?.id, buffer]);

  // Calculate current time in milliseconds (clip-relative)
  const currentTimeMs = (frame / fps) * 1000;

  // Use fixed zoom center from MainComposition
  const fixedZoomCenter = zoomCenter || { x: 0.5, y: 0.5 };

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
  let extra3DTransform = '';

  if (zoomBlocks && zoomBlocks.length > 0) {
    // Find active zoom block
    const activeBlock = zoomBlocks.find(
      block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
    );

    // Calculate zoom transformation with fixed center
    const zoomTransform = calculateZoomTransform(
      activeBlock,
      currentTimeMs,
      drawWidth,
      drawHeight,
      fixedZoomCenter,  // Fixed zoom center for stable zoom
      computedScale
    );

    // Generate transform string
    transform = getZoomTransformString(zoomTransform);
  }

  // Optional 3D screen effect: prefer screen blocks
  const screenBlock = effects?.find(e => e.type === 'screen' && e.enabled && currentTimeMs >= e.startTime && currentTimeMs <= e.endTime)
  const screenData: any = screenBlock?.data
  if (screenData) {
    const preset = screenData.preset as ('subtle' | 'medium' | 'dramatic' | 'window' | 'cinematic' | 'hero' | 'isometric' | 'flat' | 'tilt-left' | 'tilt-right') | undefined
    let tiltX = screenData.tiltX
    let tiltY = screenData.tiltY
    let perspective = screenData.perspective

    // Defaults per preset
    // Centering presets optionally add a slight y-tilt balance to keep horizon centered
    if (preset === 'subtle') { tiltX ??= -2; tiltY ??= 4; perspective ??= 1000 }
    if (preset === 'medium') { tiltX ??= -4; tiltY ??= 8; perspective ??= 900 }
    if (preset === 'dramatic') { tiltX ??= -8; tiltY ??= 14; perspective ??= 800 }
    if (preset === 'window') { tiltX ??= -3; tiltY ??= 12; perspective ??= 700 }

    // New presets
    if (preset === 'cinematic') { tiltX ??= -5; tiltY ??= 10; perspective ??= 850 }
    if (preset === 'hero') { tiltX ??= -10; tiltY ??= 16; perspective ??= 760 }
    if (preset === 'isometric') { tiltX ??= -25; tiltY ??= 25; perspective ??= 950 }
    if (preset === 'flat') { tiltX ??= 0; tiltY ??= 0; perspective ??= 1200 }
    if (preset === 'tilt-left') { tiltX ??= -6; tiltY ??= -10; perspective ??= 900 }
    if (preset === 'tilt-right') { tiltX ??= -6; tiltY ??= 10; perspective ??= 900 }

    // Easing for tilt intro/outro
    const introMs = typeof screenData.introMs === 'number' ? screenData.introMs : 400
    const outroMs = typeof screenData.outroMs === 'number' ? screenData.outroMs : 400
    const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const blockStart = screenBlock!.startTime
    const blockEnd = screenBlock!.endTime

    let easeFactor = 1
    if (currentTimeMs < blockStart + introMs) {
      const t = Math.max(0, currentTimeMs - blockStart) / Math.max(1, introMs)
      easeFactor = easeInOutCubic(Math.min(1, t))
    } else if (currentTimeMs > blockEnd - outroMs) {
      const t = Math.max(0, blockEnd - currentTimeMs) / Math.max(1, outroMs)
      easeFactor = easeInOutCubic(Math.min(1, t))
    }

    const easedTiltX = (tiltX ?? -4) * easeFactor
    const easedTiltY = (tiltY ?? 6) * easeFactor

    // Slight scale to keep edges visible while tilting
    const scaleComp = 1.03

    // Certain presets should be visually centered more aggressively
    // Use a compensating translate3d to keep content centered in frame
    let centerAdjust = ''
    if (preset === 'cinematic' || preset === 'hero' || preset === 'isometric' || preset === 'flat') {
      // Compute a small centering nudge based on tilt
      const tx = 0 // horizontal centering minimal to avoid cropping
      const ty = (Math.abs(easedTiltY ?? 0) > 0 ? -4 : 0) // nudge up a few pixels
      centerAdjust = ` translate3d(${tx}px, ${ty}px, 0)`
    }

    extra3DTransform = ` perspective(${(perspective ?? 900)}px) rotateX(${easedTiltX}deg) rotateY(${easedTiltY}deg) scale(${scaleComp})${centerAdjust}`
  }

  // Apply cinematic scroll transforms if available
  let cinematicTransform = '';
  let cinematicBlur: string | undefined;

  if (cinematicScrollState) {
    const { state, layers } = cinematicScrollState;
    cinematicTransform = createCinematicTransform(state);
    cinematicBlur = createBlurFilter(state.blur);

    // Log when transform is applied
    if (cinematicTransform) {
      console.log('[CinematicScroll] Applying transform to video:', {
        transform: cinematicTransform,
        blur: cinematicBlur || 'none'
      });
    }
  }

  const combinedTransform = `${transform}${extra3DTransform}`.trim();
  const finalTransform = cinematicTransform ? `${combinedTransform} ${cinematicTransform}` : combinedTransform;

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

  // Don't render anything if no video URL
  if (!videoUrl) {
    return <AbsoluteFill />
  }

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
            transform: finalTransform,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
            willChange: 'transform' // GPU acceleration hint
          }}
        />
      )}
      {/* Video container with viewport clipping */}
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: drawWidth,
          height: drawHeight,
          borderRadius: `${cornerRadius}px`,
          overflow: 'hidden',
          transform: finalTransform,
          transformOrigin: '50% 50%',
          filter: cinematicBlur,
          willChange: 'transform, filter' // GPU acceleration hint
        }}
      >
        {/* Use TransitionSeries for seamless clip transitions */}
        {isConsecutiveSplit && nextClip ? (
          // When we have consecutive splits, use TransitionSeries with crossfade
          <TransitionSeries>
            <TransitionSeries.Sequence durationInFrames={clipDurationInFrames}>
              <OffthreadVideo
                src={videoUrl}
                style={videoStyle}
                volume={1}
                muted={false}
                playbackRate={clip?.playbackRate || 1}
                startFrom={currentStartFrame}
                pauseWhenBuffering={true} // Critical: Pause when not ready
                onError={(e) => {
                  console.error('Video playback error in current clip:', e)
                }}
              />
            </TransitionSeries.Sequence>

            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: 2 })} // 2-frame crossfade
            />

            <TransitionSeries.Sequence durationInFrames={nextDurationInFrames}>
              <OffthreadVideo
                src={videoUrl}
                style={videoStyle}
                volume={1}
                muted={false}
                playbackRate={nextClip.playbackRate || 1}
                startFrom={nextStartFrame}
                pauseWhenBuffering={true} // Critical: Pause when not ready
                onError={(e) => {
                  console.error('Video playback error in next clip:', e)
                }}
              />
            </TransitionSeries.Sequence>
          </TransitionSeries>
        ) : (
          // Single clip without splits
          <OffthreadVideo
            src={videoUrl}
            style={videoStyle}
            volume={1}
            muted={false}
            playbackRate={clip?.playbackRate || 1}
            startFrom={currentStartFrame}
            pauseWhenBuffering={true} // Critical: Pause when not ready
            onError={(e) => {
              console.error('Video playback error:', e)
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
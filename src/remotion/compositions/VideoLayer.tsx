import React, { useMemo, useEffect } from 'react';
import { OffthreadVideo, AbsoluteFill, Series, useCurrentFrame, useVideoConfig, useBufferState } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { createCinematicTransform, createBlurFilter } from '@/lib/effects/cinematic-scroll';
import type { TimeRemapPeriod } from '@/types/project';
import { EffectType, ScreenEffectPreset } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';

// Calculate remapped source time based on time remap periods
function calculateRemappedSourceTime(
  elapsedMs: number,
  sourceIn: number,
  timeRemapPeriods?: TimeRemapPeriod[],
  playbackRate: number = 1
): number {
  // If no time remap periods, use simple calculation
  if (!timeRemapPeriods || timeRemapPeriods.length === 0) {
    return sourceIn + elapsedMs * playbackRate;
  }

  // Start from sourceIn
  let currentSourceTime = sourceIn;
  let remainingElapsed = elapsedMs;
  
  // Process each period in order
  for (const period of timeRemapPeriods) {
    const periodDuration = period.sourceEndTime - period.sourceStartTime;
    const periodPlaybackDuration = periodDuration / period.speedMultiplier;
    
    // If we're before this period starts
    if (currentSourceTime < period.sourceStartTime) {
      // Time before the period plays at normal rate
      const gapDuration = period.sourceStartTime - currentSourceTime;
      const gapPlaybackDuration = gapDuration / playbackRate;
      
      if (remainingElapsed <= gapPlaybackDuration) {
        // We're in the gap before this period
        return currentSourceTime + remainingElapsed * playbackRate;
      }
      
      // Move through the gap
      remainingElapsed -= gapPlaybackDuration;
      currentSourceTime = period.sourceStartTime;
    }
    
    // If we're within this period
    if (currentSourceTime >= period.sourceStartTime && currentSourceTime < period.sourceEndTime) {
      const remainingInPeriod = period.sourceEndTime - currentSourceTime;
      const remainingPlaybackInPeriod = remainingInPeriod / period.speedMultiplier;
      
      if (remainingElapsed <= remainingPlaybackInPeriod) {
        // We end within this period
        return currentSourceTime + remainingElapsed * period.speedMultiplier;
      }
      
      // Move through this period
      remainingElapsed -= remainingPlaybackInPeriod;
      currentSourceTime = period.sourceEndTime;
    }
  }
  
  // Any remaining time after all periods plays at normal rate
  return currentSourceTime + remainingElapsed * playbackRate;
}

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

  // Calculate the correct start frame based on clip's sourceIn (kept for reference)
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
  
  // Calculate remapped source time for time-variable playback
  const remappedSourceTime = useMemo(() => {
    if (!clip) return 0;
    
    // If clip has time remap periods, use them
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
      return calculateRemappedSourceTime(
        currentTimeMs,
        clip.sourceIn || 0,
        clip.timeRemapPeriods,
        clip.playbackRate || 1
      );
    }
    
    // Otherwise use simple calculation with playback rate
    const sourceIn = clip.sourceIn || 0;
    const rate = clip.playbackRate || 1;
    return sourceIn + currentTimeMs * rate;
  }, [clip, currentTimeMs]);
  
  // Convert remapped source time to frame for startFrom
  const startFromFrame = Math.round((remappedSourceTime / 1000) * fps);

  // Use fixed zoom center from MainComposition
  const fixedZoomCenter = zoomCenter || { x: 0.5, y: 0.5 };

  // Get background effect for padding and styling
  const backgroundEffect = effects ? EffectsFactory.getActiveEffectAtTime(
    effects,
    EffectType.Background,
    currentTimeMs
  ) : undefined;
  const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null
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
  const screenBlock = effects ? EffectsFactory.getActiveEffectAtTime(
    effects,
    EffectType.Screen,
    currentTimeMs
  ) : undefined;
  const screenData = screenBlock ? EffectsFactory.getScreenData(screenBlock) : null
  if (screenData) {
    const preset = screenData.preset
    let tiltX = screenData.tiltX
    let tiltY = screenData.tiltY
    let perspective = screenData.perspective

    // Defaults per preset
    // Centering presets optionally add a slight y-tilt balance to keep horizon centered
    if (preset === ScreenEffectPreset.Subtle) { tiltX ??= -2; tiltY ??= 4; perspective ??= 1000 }
    if (preset === ScreenEffectPreset.Medium) { tiltX ??= -4; tiltY ??= 8; perspective ??= 900 }
    if (preset === ScreenEffectPreset.Dramatic) { tiltX ??= -8; tiltY ??= 14; perspective ??= 800 }
    if (preset === ScreenEffectPreset.Window) { tiltX ??= -3; tiltY ??= 12; perspective ??= 700 }

    // New presets
    if (preset === ScreenEffectPreset.Cinematic) { tiltX ??= -5; tiltY ??= 10; perspective ??= 850 }
    if (preset === ScreenEffectPreset.Hero) { tiltX ??= -10; tiltY ??= 16; perspective ??= 760 }
    if (preset === ScreenEffectPreset.Isometric) { tiltX ??= -25; tiltY ??= 25; perspective ??= 950 }
    if (preset === ScreenEffectPreset.Flat) { tiltX ??= 0; tiltY ??= 0; perspective ??= 1200 }
    if (preset === ScreenEffectPreset.TiltLeft) { tiltX ??= -6; tiltY ??= -10; perspective ??= 900 }
    if (preset === ScreenEffectPreset.TiltRight) { tiltX ??= -6; tiltY ??= 10; perspective ??= 900 }

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
    if (preset === ScreenEffectPreset.Cinematic || preset === ScreenEffectPreset.Hero || preset === ScreenEffectPreset.Isometric || preset === ScreenEffectPreset.Flat) {
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
        {/* Single persistent video element with time remapping support */}
        <OffthreadVideo
          src={videoUrl}
          style={videoStyle}
          volume={1}
          muted={false}
          playbackRate={1} // Always 1 since we handle speed via startFrom
          startFrom={startFromFrame}
          pauseWhenBuffering={true}
          onError={(e) => {
            console.error('Video playback error:', e)
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
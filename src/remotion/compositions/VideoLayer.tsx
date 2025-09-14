import React, { useMemo } from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
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

  // Calculate source positions for both current and next clips
  // Use Math.round consistently for frame-perfect alignment
  const currentSourceInMs = clip ? (clip.sourceIn || 0) : 0;
  const currentStartFrame = Math.round((currentSourceInMs / 1000) * fps);
  
  // Pre-calculate next clip's position for buffering
  const nextSourceInMs = nextClip ? (nextClip.sourceIn || 0) : 0;
  const nextStartFrame = Math.round((nextSourceInMs / 1000) * fps);
  
  // Calculate current time in milliseconds (clip-relative)
  const currentTimeMs = (frame / fps) * 1000;
  
  // Calculate frames for precise boundary detection
  const totalFramesInClip = clip ? Math.round((clip.duration / 1000) * fps) : 0;
  const currentFrameInClip = frame; // Already clip-relative from Remotion
  const framesUntilEnd = totalFramesInClip - currentFrameInClip;
  
  // Pre-load much earlier (10 frames) but only show crossfade at the end (2 frames)
  const preloadFrames = 10;
  const crossfadeFrames = 2;
  
  // Check if next clip is a consecutive split (no gap between clips)
  const isConsecutiveSplit = useMemo(() => {
    if (!clip || !nextClip) return false;
    if (clip.recordingId !== nextClip.recordingId) return false; // Different recording
    
    // Check if clips are consecutive (next starts exactly when current ends)
    // Use small epsilon for floating point comparison
    const epsilon = 0.001;
    const currentEndTime = (clip.startTime || 0) + clip.duration;
    const nextStartTime = nextClip.startTime || 0;
    return Math.abs(nextStartTime - currentEndTime) < epsilon;
  }, [clip, nextClip]);
  
  // Detect if we should pre-load the next clip
  const shouldPreloadNext = useMemo(() => {
    if (!isConsecutiveSplit) return false;
    
    // Start preloading when within 10 frames of the end
    return framesUntilEnd <= preloadFrames && framesUntilEnd >= 0;
  }, [isConsecutiveSplit, framesUntilEnd, preloadFrames]);
  
  // Detect if we're in the crossfade zone (last 2 frames)
  const isInCrossfade = useMemo(() => {
    if (!shouldPreloadNext) return false;
    return framesUntilEnd <= crossfadeFrames && framesUntilEnd >= 0;
  }, [shouldPreloadNext, framesUntilEnd, crossfadeFrames]);
  
  // Calculate crossfade opacity for seamless transition
  const crossfadeOpacity = useMemo(() => {
    if (!isInCrossfade || !clip) return { current: 1, next: 0 };
    
    // Use frame-based calculation for precision
    const fadeProgress = (crossfadeFrames - framesUntilEnd) / crossfadeFrames;
    
    // Log for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log('[VideoLayer] Transition:', {
        currentFrame: currentFrameInClip,
        totalFrames: totalFramesInClip,
        framesUntilEnd,
        fadeProgress,
        opacity: { current: 1 - fadeProgress, next: fadeProgress },
        currentStartFrame,
        nextStartFrame,
        clipSourceIn: currentSourceInMs,
        nextClipSourceIn: nextSourceInMs,
        isConsecutive: isConsecutiveSplit
      });
    }
    
    return {
      current: Math.max(0, 1 - fadeProgress),
      next: Math.min(1, fadeProgress)
    };
  }, [isInCrossfade, clip, framesUntilEnd, crossfadeFrames, currentFrameInClip, totalFramesInClip, currentStartFrame, nextStartFrame, currentSourceInMs, nextSourceInMs, isConsecutiveSplit])

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
      {/* Video container with double buffering */}
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
        {/* Current video buffer */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: crossfadeOpacity.current,
            transition: isInCrossfade ? 'opacity 0.067s linear' : 'none', // Smooth transition only during crossfade
            zIndex: isInCrossfade ? 1 : 2, // Current video on top except during crossfade
          }}
        >
          <Video
            src={videoUrl}
            style={videoStyle}
            volume={1}
            muted={false}
            playbackRate={clip?.playbackRate || 1}
            startFrom={currentStartFrame}
            onError={(e) => {
              console.error('Video playback error in current buffer:', e)
            }}
          />
        </div>
        
        {/* Next video buffer - preload early but only show during crossfade */}
        {shouldPreloadNext && nextClip && (
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: crossfadeOpacity.next,
              visibility: isInCrossfade ? 'visible' : 'hidden', // Hidden until crossfade starts
              transition: isInCrossfade ? 'opacity 0.067s linear' : 'none',
              zIndex: isInCrossfade ? 2 : 1, // Next video on top during crossfade
            }}
          >
            <Video
              src={videoUrl}
              style={videoStyle}
              volume={1}
              muted={false}
              playbackRate={nextClip.playbackRate || 1}
              startFrom={nextStartFrame}
              onError={(e) => {
                console.error('Video playback error in next buffer:', e)
              }}
            />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
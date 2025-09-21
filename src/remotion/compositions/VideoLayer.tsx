import React, { useMemo } from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { createCinematicTransform, createBlurFilter } from '@/lib/effects/cinematic-scroll';
import { EffectType, ScreenEffectPreset } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';


export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  clip,
  nextClip,  // Keep for potential future use
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
  // Calculate current time in milliseconds (clip-relative)
  const currentTimeMs = (frame / fps) * 1000;

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

  // Memoize video position calculation to prevent recalculation every frame
  const { drawWidth, drawHeight, offsetX, offsetY } = useMemo(
    () => calculateVideoPosition(width, height, videoWidth, videoHeight, padding),
    [width, height, videoWidth, videoHeight, padding]
  );


  // Memoize zoom transformation to avoid recalculating when only frame changes
  const transform = useMemo(() => {
    if (!zoomBlocks || zoomBlocks.length === 0) return '';
    
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
    return getZoomTransformString(zoomTransform);
  }, [zoomBlocks, currentTimeMs, drawWidth, drawHeight, fixedZoomCenter, computedScale]);
  
  let extra3DTransform = '';

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
    const { state } = cinematicScrollState;
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
    console.error('VideoLayer: No video URL provided');
    return <AbsoluteFill />
  }

  // Simple URL normalization - let the protocol handler do the heavy lifting
  let finalVideoUrl = videoUrl;

  // Only convert if not already video-stream:// or http://
  if (!videoUrl.startsWith('video-stream://') && !videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
    // It's either file:// or a bare path - convert to video-stream://
    let pathToEncode = videoUrl;

    // Remove file:// prefix if present
    if (videoUrl.startsWith('file://')) {
      pathToEncode = videoUrl.replace('file://', '');
    }

    // The protocol handler will figure out the rest
    finalVideoUrl = `video-stream://local/${encodeURIComponent(pathToEncode)}`;
    console.log('[VideoLayer] Normalized URL', { from: videoUrl, to: finalVideoUrl });
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
        {/* Use Video component - more efficient with limited memory */}
        <Video
          src={finalVideoUrl}
          style={videoStyle}
          volume={1}
          muted={false}
          pauseWhenBuffering={false}
          crossOrigin="anonymous"
          onError={(e) => {
            console.error('Video playback error:', {
              error: e,
              videoUrl: finalVideoUrl,
              message: e instanceof Error ? e.message : 'Unknown error'
            });
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

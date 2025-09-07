import React from 'react';
import { Video, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoLayerProps } from './types';
import { calculateVideoPosition } from './utils/video-position';
import { calculateZoomTransform, getZoomTransformString } from './utils/zoom-transform';
import { createCinematicTransform, createBlurFilter } from '@/lib/effects/cinematic-scroll';

export const VideoLayer: React.FC<VideoLayerProps> = ({
  videoUrl,
  effects,
  zoomBlocks,
  videoWidth,
  videoHeight,
  zoomCenter,
  cinematicScrollState,
  computedScale,
  debugCaret
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Use fixed zoom center from MainComposition
  const fixedZoomCenter = zoomCenter || { x: 0.5, y: 0.5 };

  // Calculate current time in milliseconds
  const currentTimeMs = (frame / fps) * 1000;

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

    // Slight scale to keep edges visible while tilting
    const scaleComp = 1.03

    // Certain presets should be visually centered more aggressively
    // Use a compensating translate3d to keep content centered in frame
    let centerAdjust = ''
    if (preset === 'cinematic' || preset === 'hero' || preset === 'isometric' || preset === 'flat') {
      // Compute a small centering nudge based on tilt
      const tx = 0 // horizontal centering minimal to avoid cropping
      const ty = (Math.abs(tiltY ?? 0) > 0 ? -4 : 0) // nudge up a few pixels
      centerAdjust = ` translate3d(${tx}px, ${ty}px, 0)`
    }

    extra3DTransform = ` perspective(${(perspective ?? 900)}px) rotateX(${tiltX ?? -4}deg) rotateY(${tiltY ?? 6}deg) scale(${scaleComp})${centerAdjust}`
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
      {/* Video container */}
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
        <Video
          src={videoUrl}
          style={videoStyle}
          volume={1}
          muted={false}
          onError={(e) => {
            console.error('Video playback error in VideoLayer:', e)
            // Don't throw - let Remotion handle gracefully
          }}
          // Performance optimization
        />

        {/* Debug caret overlay inside the transformed container */}
        {debugCaret && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          >
            {/* Crosshair at caret center */}
            {(() => {
              const cx = (debugCaret.bounds ? debugCaret.x + (debugCaret.bounds.width || 0) * 0.5 : debugCaret.x) * (drawWidth / videoWidth)
              const cy = (debugCaret.bounds ? debugCaret.y + (debugCaret.bounds.height || 0) * 0.5 : debugCaret.y) * (drawHeight / videoHeight)
              const size = 12
              return (
                <>
                  <div style={{ position: 'absolute', left: cx - size, top: cy, width: size * 2, height: 1, background: 'rgba(0,255,0,0.9)' }} />
                  <div style={{ position: 'absolute', left: cx, top: cy - size, width: 1, height: size * 2, background: 'rgba(0,255,0,0.9)' }} />
                </>
              )
            })()}
            {/* Bounds box if available */}
            {debugCaret?.bounds && (
              <div
                style={{
                  position: 'absolute',
                  left: (debugCaret.bounds.x) * (drawWidth / videoWidth),
                  top: (debugCaret.bounds.y) * (drawHeight / videoHeight),
                  width: (debugCaret.bounds.width) * (drawWidth / videoWidth),
                  height: (debugCaret.bounds.height) * (drawHeight / videoHeight),
                  border: '1px solid rgba(0,255,0,0.9)'
                }}
              />
            )}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
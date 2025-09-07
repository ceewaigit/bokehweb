import React, { useRef, useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoLayer } from './VideoLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CursorLayer } from './CursorLayer';
import { KeystrokeLayer } from './KeystrokeLayer';
import type { MainCompositionProps } from './types';
import type { ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ZoomBlock } from '@/types/project';
import { calculateVideoPosition } from './utils/video-position';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import { calculateZoomScale, calculateZoomTransform, applyZoomToPoint } from './utils/zoom-transform';

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoUrl,
  clip,
  effects,
  cursorEvents,
  clickEvents,
  keystrokeEvents,
  scrollEvents,
  caretEvents,
  videoWidth,
  videoHeight
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Track zoom state per block for consistency
  const zoomStateRef = useRef<Map<string, {
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
    initialized: boolean
    scale?: number;
    focus?: 'caret' | 'mouse';
    lastCaretMs?: number;
    holdUntilMs?: number;
    heldMaxScale?: number;
  }>>(new Map());

  // Calculate current time in milliseconds (clip-relative)
  const currentTimeMs = (frame / fps) * 1000;

  // Extract active effects from the array
  // Effects are already converted to clip-relative times
  const activeEffects = effects?.filter(e =>
    e.enabled &&
    currentTimeMs >= e.startTime &&
    currentTimeMs <= e.endTime
  ) || [];

  // Find specific effect types
  const backgroundEffect = activeEffects.find(e => e.type === 'background');
  const cursorEffect = activeEffects.find(e => e.type === 'cursor');
  const keystrokeEffect = activeEffects.find(e => e.type === 'keystroke');
  const zoomEffects = activeEffects.filter(e => e.type === 'zoom');


  // Extract background padding
  const padding = backgroundEffect ? (backgroundEffect.data as BackgroundEffectData).padding : 0;
  const videoPosition = calculateVideoPosition(width, height, videoWidth, videoHeight, padding);

  // Convert zoom effects to zoom blocks
  const zoomEnabled = zoomEffects.length > 0;
  const zoomBlocks: ZoomBlock[] = zoomEffects.map(effect => {
    const data = effect.data as ZoomEffectData;
    const followStrategy = data.followStrategy || 'auto_mouse_first'
    const caretMinScale = 5.0
    const baseScale = (data.scale ?? 2)
    const effectiveScale = followStrategy === 'caret' ? Math.max(baseScale, caretMinScale) : baseScale
    return {
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      scale: effectiveScale,
      targetX: data.targetX,
      targetY: data.targetY,
      introMs: data.introMs,
      outroMs: data.outroMs,
      smoothing: data.smoothing
    };
  });

  // Read zoom behavior settings (prefer active block; fallback to first)
  const zoomBehavior = useMemo(() => {
    // Determine active block at current time
    const active = zoomEffects.find(e => currentTimeMs >= e.startTime && currentTimeMs <= e.endTime)
    const source = active || zoomEffects[0]
    const data = (source?.data as ZoomEffectData) || ({} as any)
    const followStrategy = data.followStrategy || 'auto_mouse_first'
    const caretMinScale = 5.0
    const baseScale = data.scale || 2
    const effectiveScale = followStrategy === 'caret' ? Math.max(baseScale, caretMinScale) : baseScale

    return {
      id: source?.id,
      startTime: source?.startTime || 0,
      endTime: source?.endTime || 0,
      scale: effectiveScale,
      introMs: data.introMs || 300,
      outroMs: data.outroMs || 300,
      followStrategy: followStrategy,
      mouseIdlePx: data.mouseIdlePx ?? 3,
      caretWindowMs: data.caretWindowMs ?? 300
    }
  }, [zoomEffects, currentTimeMs])

  // Calculate complete zoom state including dynamic pan
  const completeZoomState = useMemo(() => {
    let zoomState = { scale: 1, x: 0.5, y: 0.5, panX: 0, panY: 0 };

    if (zoomEnabled && clip) {
      // Choose the active zoom block strictly by time
      const activeZoomBlock = zoomBlocks.find(
        block => currentTimeMs >= block.startTime && currentTimeMs <= block.endTime
      );

      if (activeZoomBlock) {
        let blockZoomState = zoomStateRef.current.get(activeZoomBlock.id);
        if (!blockZoomState) {
          let centerX = 0.5;
          let centerY = 0.5;

          const initial = (() => {
            const captureWidth = videoWidth;
            const captureHeight = videoHeight;

            if (zoomBehavior.followStrategy === 'caret') {
              if (caretEvents && caretEvents.length > 0) {
                const idx = caretEvents.findIndex(e => e.timestamp > activeZoomBlock.startTime)
                const prev: any = idx > 0 ? caretEvents[idx - 1] : (caretEvents[caretEvents.length - 1]?.timestamp <= activeZoomBlock.startTime ? caretEvents[caretEvents.length - 1] : null)
                if (prev) return { cx: prev.bounds ? (prev.x + (prev.bounds.width || 0) * 0.5) : prev.x, cy: prev.bounds ? (prev.y + (prev.bounds.height || 0) * 0.5) : prev.y }
              }
            }

            // Mouse first (for mouse or auto); fallback to caret
            const startMouse = zoomPanCalculator.interpolateMousePosition(cursorEvents, activeZoomBlock.startTime)
            if (startMouse) {
              return { cx: startMouse.x, cy: startMouse.y }
            }

            // Fallback to caret if available
            if (caretEvents && caretEvents.length > 0) {
              const idx = caretEvents.findIndex(e => e.timestamp > activeZoomBlock.startTime)
              const prev = idx > 0 ? caretEvents[idx - 1] : (caretEvents[caretEvents.length - 1]?.timestamp <= activeZoomBlock.startTime ? caretEvents[caretEvents.length - 1] : null)
              if (prev) return { cx: (prev as any).bounds ? (prev.x + ((prev as any).bounds.width || 0) * 0.5) : prev.x, cy: (prev as any).bounds ? (prev.y + ((prev as any).bounds.height || 0) * 0.5) : prev.y }
            }

            return { cx: captureWidth * 0.5, cy: captureHeight * 0.5 }
          })()

          centerX = initial.cx / videoWidth
          centerY = initial.cy / videoHeight

          blockZoomState = {
            centerX,
            centerY,
            panX: 0,
            panY: 0,
            initialized: true,
            scale: 1,
            focus: undefined,
            lastCaretMs: undefined,
            holdUntilMs: undefined,
            heldMaxScale: undefined
          };
          zoomStateRef.current.set(activeZoomBlock.id, blockZoomState);
        }

        const blockDuration = activeZoomBlock.endTime - activeZoomBlock.startTime;
        const elapsed = currentTimeMs - activeZoomBlock.startTime;
        const introMs = activeZoomBlock.introMs || 500;
        const outroMs = activeZoomBlock.outroMs || 500;

        // Precompute mouse and caret inputs
        const captureWidth = videoWidth;
        const captureHeight = videoHeight;
        const mousePos = zoomPanCalculator.interpolateMousePosition(cursorEvents, currentTimeMs)
        const velocityWindowMs = 150
        const recentMouse = zoomPanCalculator.interpolateMousePosition(cursorEvents, currentTimeMs - velocityWindowMs)
        const idleThresholdPx = zoomBehavior.mouseIdlePx || 3
        const mouseIdle = mousePos && recentMouse ? (Math.hypot(mousePos.x - recentMouse.x, mousePos.y - recentMouse.y) < idleThresholdPx) : false

        let bestCaret: { t: number; x: number; y: number; bounds?: { x: number; y: number; width: number; height: number } } | null = null
        if (caretEvents && caretEvents.length > 0) {
          for (let i = caretEvents.length - 1; i >= 0; i--) {
            const e: any = caretEvents[i]
            if (e.timestamp <= currentTimeMs) { bestCaret = { t: e.timestamp, x: e.x, y: e.y, bounds: e.bounds }; break }
          }
        }
        const caretRecent = !!(bestCaret && currentTimeMs - bestCaret.t <= (zoomBehavior.caretWindowMs || 300))

        // Sticky caret hold logic to prevent pulsing while typing
        const caretHoldMs = Math.max((zoomBehavior.caretWindowMs || 300) + 300, 800)
        if (bestCaret) {
          blockZoomState.lastCaretMs = bestCaret.t
        }
        const holdActive = (blockZoomState.holdUntilMs ?? -1) > currentTimeMs

        // Decide which focus source to use with hysteresis
        let useCaretFocus = false
        if (zoomBehavior.followStrategy === 'caret') {
          useCaretFocus = caretRecent || holdActive
        } else if (zoomBehavior.followStrategy === 'mouse') {
          useCaretFocus = false
        } else {
          // auto_mouse_first: prefer mouse; switch to caret if mouse idle AND caret recent, then hold
          useCaretFocus = (blockZoomState.focus === 'caret' && holdActive) || (!!(caretRecent && mouseIdle))
        }

        // Update hold window when using caret
        if (useCaretFocus && blockZoomState.lastCaretMs != null) {
          const newHoldUntil = blockZoomState.lastCaretMs + caretHoldMs
          blockZoomState.holdUntilMs = Math.max(blockZoomState.holdUntilMs ?? 0, newHoldUntil)
          blockZoomState.focus = 'caret'
        } else if (!holdActive) {
          blockZoomState.focus = 'mouse'
          blockZoomState.heldMaxScale = undefined
        }

        // Determine target scale. Apply 5-7x and hold it (non-decreasing) while caret hold is active
        let targetScaleForBlock = activeZoomBlock.scale || 2
        if (useCaretFocus) {
          if (bestCaret && bestCaret.bounds && bestCaret.bounds.width > 0) {
            const desired = Math.min(7, Math.max(5, 0.9 * (videoWidth / bestCaret.bounds.width)))
            if (holdActive || blockZoomState.focus === 'caret') {
              blockZoomState.heldMaxScale = Math.max(blockZoomState.heldMaxScale ?? desired, desired)
              targetScaleForBlock = Math.max(desired, blockZoomState.heldMaxScale)
            } else {
              targetScaleForBlock = desired
            }
          } else {
            targetScaleForBlock = 5.0
          }
        }

        const rawScale = calculateZoomScale(
          elapsed,
          blockDuration,
          targetScaleForBlock,
          introMs,
          outroMs
        );

        // Smooth scale changes during hold phase to avoid jumps when caret width changes
        const inHoldPhase = !(elapsed < introMs || elapsed > blockDuration - outroMs)
        const prevScale = blockZoomState.scale ?? 1
        const smoothedScale = inHoldPhase ? (prevScale + (rawScale - prevScale) * 0.3) : rawScale

        let targetCenterX = blockZoomState.centerX;
        let targetCenterY = blockZoomState.centerY;

        if (useCaretFocus && bestCaret) {
          const cx = bestCaret.bounds ? (bestCaret.x + (bestCaret.bounds.width || 0) * 0.5) : bestCaret.x
          const cy = bestCaret.bounds ? (bestCaret.y + (bestCaret.bounds.height || 0) * 0.5) : bestCaret.y
          targetCenterX = cx / captureWidth
          targetCenterY = cy / captureHeight
          if (process.env.NODE_ENV !== 'production') {
            console.log('[CaretCenter]', {
              timeMs: currentTimeMs,
              blockId: activeZoomBlock.id,
              caretTime: bestCaret.t,
              caretPx: { x: cx, y: cy },
              caretNorm: { x: targetCenterX, y: targetCenterY },
              zoomTargetNorm: { x: targetCenterX, y: targetCenterY },
              zoomCenterNorm: { x: blockZoomState.centerX, y: blockZoomState.centerY },
              scale: targetScaleForBlock,
              video: { w: captureWidth, h: captureHeight }
            })
          }
        } else if (mousePos) {
          targetCenterX = mousePos.x / captureWidth
          targetCenterY = mousePos.y / captureHeight
        }

        // Clamp away from hard edges slightly to avoid overshoot
        targetCenterX = Math.max(0.02, Math.min(0.98, targetCenterX))
        targetCenterY = Math.max(0.02, Math.min(0.98, targetCenterY))

        const centerSmoothing = useCaretFocus ? 0.85 : 0.25;
        blockZoomState.centerX = blockZoomState.centerX + (targetCenterX - blockZoomState.centerX) * centerSmoothing;
        blockZoomState.centerY = blockZoomState.centerY + (targetCenterY - blockZoomState.centerY) * centerSmoothing;

        const panX = 0;
        const panY = 0;

        zoomState = {
          scale: smoothedScale,
          x: blockZoomState.centerX,
          y: blockZoomState.centerY,
          panX,
          panY
        };
        blockZoomState.scale = smoothedScale
      } else {
        const currentTime = currentTimeMs;
        const keysToDelete: string[] = [];
        zoomStateRef.current.forEach((_, blockId) => {
          const block = zoomBlocks.find(b => b.id === blockId);
          if (block && (currentTime < block.startTime - 5000 || currentTime > block.endTime + 5000)) {
            keysToDelete.push(blockId);
          }
        });
        keysToDelete.forEach(key => zoomStateRef.current.delete(key));
      }
    }

    return zoomState;
  }, [zoomEnabled, clip, zoomBlocks, currentTimeMs, cursorEvents, caretEvents, videoWidth, videoHeight]);

  // Compute optional cinematic scroll pan when enabled via annotation effect
  const scrollCinematic = useMemo(() => {
    const anno = (effects || []).find(e => e.type === 'annotation' && (e as any).data?.kind === 'scrollCinematic' && e.enabled)
    if (!anno || !scrollEvents || scrollEvents.length === 0) return { x: 0, y: 0 }

    let sumY = 0
    for (const ev of scrollEvents) {
      if (ev.timestamp <= currentTimeMs) sumY += ev.deltaY || 0
    }
    const normY = Math.max(-0.1, Math.min(0.1, sumY * 0.0005))
    if (Math.abs(normY) > 0.0001) {
      console.log('[CinematicScroll] active', { time: currentTimeMs, normY, sumY })
    }
    return { x: 0, y: normY }
  }, [effects, scrollEvents, currentTimeMs])

  const debugCaretOverlayEnabled = useMemo(() => {
    const anno = (effects || []).find(e => e.type === 'annotation' && (e as any).data?.kind === 'debugCaret' && e.enabled)
    return !!anno
  }, [effects])

  const lastCaretForDebug = useMemo(() => {
    if (!caretEvents || caretEvents.length === 0) return undefined
    let best: any = undefined
    for (let i = caretEvents.length - 1; i >= 0; i--) {
      const e: any = caretEvents[i]
      if (e.timestamp <= currentTimeMs) { best = e; break }
    }
    return best ? { x: best.x, y: best.y, bounds: best.bounds } : undefined
  }, [caretEvents, currentTimeMs])

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Layer */}
      {backgroundEffect && (
        <Sequence from={0}>
          <BackgroundLayer
            backgroundData={backgroundEffect.data as BackgroundEffectData}
            videoWidth={width}
            videoHeight={height}
          />
        </Sequence>
      )}

      {/* Video Layer with effects */}
      {videoUrl && (
        <Sequence from={0}>
          <VideoLayer
            videoUrl={videoUrl}
            effects={effects}
            zoomBlocks={zoomBlocks}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            zoomCenter={zoomEnabled ? { x: completeZoomState.x, y: completeZoomState.y } : undefined}
            cinematicPan={zoomEnabled ? { x: 0, y: 0 } : undefined}
            extraTranslate={{ x: 0, y: scrollCinematic.y * (calculateVideoPosition(width, height, videoWidth, videoHeight, padding).drawHeight) }}
            computedScale={zoomEnabled ? completeZoomState.scale : undefined}
            debugCaret={debugCaretOverlayEnabled ? lastCaretForDebug : undefined}
          />
        </Sequence>
      )}

      {/* Keystroke Layer - Show when enabled and keystrokes exist */}
      {keystrokeEffect && keystrokeEvents && keystrokeEvents.length > 0 && (
        <Sequence from={0}>
          <KeystrokeLayer
            keyboardEvents={keystrokeEvents}
            settings={keystrokeEffect.data as KeystrokeEffectData}
          />
        </Sequence>
      )}

      {/* Cursor Layer - Only show when explicitly enabled */}
      {cursorEffect && (
        <Sequence from={0}>
          <CursorLayer
            cursorEvents={cursorEvents}
            clickEvents={clickEvents}
            fps={fps}
            videoOffset={{
              x: videoPosition.offsetX,
              y: videoPosition.offsetY,
              width: videoPosition.drawWidth,
              height: videoPosition.drawHeight
            }}
            zoomBlocks={zoomBlocks}
            zoomState={completeZoomState}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            cursorData={cursorEffect.data as CursorEffectData}
          />
        </Sequence>
      )}

    </AbsoluteFill>
  );
};
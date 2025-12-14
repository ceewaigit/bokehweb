import React, { useEffect, useRef, useMemo } from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame } from 'remotion';
import { KeystrokeRenderer } from '@/lib/effects/keystroke-renderer';
import type { Effect, KeystrokeEffectData } from '@/types/project';
import { useClipContext } from '../context/ClipContext';
import { useSourceTime } from '../hooks/useTimeCoordinates';
import { useTimeContext } from '../context/TimeContext';
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects';

export interface KeystrokeLayerProps {
  keystrokeEffects: Effect[];
  videoWidth: number;
  videoHeight: number;
}

export const KeystrokeLayer: React.FC<KeystrokeLayerProps> = ({
  keystrokeEffects,
  videoWidth,
  videoHeight
}) => {
  const sourceTimeMs = useSourceTime();
  const { keystrokeEvents, clip } = useClipContext();
  const { width, height } = useVideoConfig();
  const { fps } = useTimeContext();
  const frame = useCurrentFrame();

  const frameDurationMs = useMemo(() => 1000 / fps, [fps]);

  const timelineTimeMs = useMemo(() => {
    return clip.startTime + ((frame + 0.5) / fps) * 1000;
  }, [clip.startTime, frame, fps]);

  const sortedKeystrokeEffects = useMemo(() => {
    return [...keystrokeEffects].sort((a, b) => a.startTime - b.startTime);
  }, [keystrokeEffects]);

  const activeEffect = useMemo(() => {
    const tolerance = frameDurationMs;
    return sortedKeystrokeEffects.find(
      (e) =>
        e.enabled &&
        timelineTimeMs + tolerance >= e.startTime &&
        timelineTimeMs <= e.endTime + tolerance
    );
  }, [sortedKeystrokeEffects, timelineTimeMs, frameDurationMs]);

  // Merge effect data with defaults - pass ALL settings
  const settings = useMemo<KeystrokeEffectData>(() => {
    const data = activeEffect?.data as KeystrokeEffectData | undefined;
    return {
      ...DEFAULT_KEYSTROKE_DATA,
      ...data
    };
  }, [activeEffect?.data]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KeystrokeRenderer | null>(null);
  // Track settings version to force re-render when they change
  const settingsVersionRef = useRef(0);

  const shouldRender = !!activeEffect && keystrokeEvents.length > 0;

  // Create/update renderer when settings change
  useEffect(() => {
    if (!shouldRender) {
      rendererRef.current = null;
      return;
    }

    // Always create a fresh renderer when settings change to ensure they're applied
    rendererRef.current = new KeystrokeRenderer(settings);
    settingsVersionRef.current++;

    if (canvasRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }

    rendererRef.current.setKeyboardEvents(keystrokeEvents);
  }, [shouldRender, settings, keystrokeEvents]);

  // Render keystrokes - includes settingsVersionRef to force re-render
  useEffect(() => {
    if (!shouldRender) return;
    if (!canvasRef.current || !rendererRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    rendererRef.current.render(sourceTimeMs, width, height);
  }, [shouldRender, sourceTimeMs, width, height, settingsVersionRef.current]);

  if (!shouldRender) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      />
    </AbsoluteFill>
  );
};

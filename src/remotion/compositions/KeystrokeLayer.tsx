import React, { useEffect, useRef, useMemo } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { KeystrokeRenderer } from '@/lib/effects/keystroke-renderer';
import type { Effect, KeystrokeEffectData } from '@/types/project';
import { KeystrokePosition } from '@/types/project';
import { useClipContext } from '../context/ClipContext';
import { useSourceTime } from '../hooks/useTimeCoordinates';

export interface KeystrokeLayerProps {
  keystrokeEffect?: Effect;
  videoWidth: number;
  videoHeight: number;
}

export const KeystrokeLayer: React.FC<KeystrokeLayerProps> = ({
  keystrokeEffect,
  videoWidth,
  videoHeight
}) => {
  const sourceTimeMs = useSourceTime();
  const { keystrokeEvents } = useClipContext();
  const { width, height } = useVideoConfig();

  // Extract settings from effect data
  const settings = (keystrokeEffect?.data as KeystrokeEffectData | undefined) || {};
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KeystrokeRenderer | null>(null);
  
  // Initialize renderer once
  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = new KeystrokeRenderer({
        fontSize: settings.fontSize || 16,
        fontFamily: settings.fontFamily || 'SF Pro Display, system-ui, -apple-system, sans-serif',
        backgroundColor: settings.backgroundColor || 'rgba(0, 0, 0, 0.8)',
        textColor: settings.textColor || '#ffffff',
        borderColor: settings.borderColor || 'rgba(255, 255, 255, 0.2)',
        borderRadius: settings.borderRadius || 6,
        padding: settings.padding || 12,
        fadeOutDuration: settings.fadeOutDuration || 300,
        position: settings.position || KeystrokePosition.BottomCenter,
        maxWidth: settings.maxWidth || 300
      });
    }
    
    // Update renderer settings when they change
    rendererRef.current.updateSettings({
      fontSize: settings.fontSize || 16,
      fontFamily: settings.fontFamily || 'SF Pro Display, system-ui, -apple-system, sans-serif',
      backgroundColor: settings.backgroundColor || 'rgba(0, 0, 0, 0.8)',
      textColor: settings.textColor || '#ffffff',
      borderColor: settings.borderColor || 'rgba(255, 255, 255, 0.2)',
      borderRadius: settings.borderRadius || 6,
      padding: settings.padding || 12,
      fadeOutDuration: settings.fadeOutDuration || 300,
      position: settings.position || KeystrokePosition.BottomCenter,
      maxWidth: settings.maxWidth || 300
    });
    
    if (canvasRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }
    
    // Set keyboard events
    rendererRef.current.setKeyboardEvents(keystrokeEvents);

    // Cleanup only on unmount
    return () => {
      rendererRef.current?.reset();
    };
  }, [settings, keystrokeEvents]);
  
  // Update canvas when ref changes
  useEffect(() => {
    if (canvasRef.current && rendererRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }
  }, [canvasRef.current]);

  // Render keystrokes
  useEffect(() => {
    if (!canvasRef.current || !rendererRef.current || keystrokeEvents.length === 0) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Render keystrokes at current time
    rendererRef.current.render(sourceTimeMs, width, height);
  }, [sourceTimeMs, width, height, keystrokeEvents]);
  
  // Check if there are keystrokes to render at this time
  const hasKeystrokes = useMemo(() => {
    if (!rendererRef.current || keystrokeEvents.length === 0) return false;
    return rendererRef.current.hasKeystrokesAtTime(sourceTimeMs);
  }, [sourceTimeMs, keystrokeEvents]);

  // Only render if there are keystrokes to show
  if (!hasKeystrokes && sourceTimeMs > 0) {
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
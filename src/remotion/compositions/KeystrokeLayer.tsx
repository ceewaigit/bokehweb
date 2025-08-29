import React, { useEffect, useRef, useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { KeystrokeRenderer } from '@/lib/effects/keystroke-renderer';
import type { KeyboardEvent } from '@/types/project';

interface KeystrokeLayerProps {
  keyboardEvents: KeyboardEvent[];
  settings?: {
    position?: 'bottom-center' | 'bottom-right' | 'top-center';
    fontSize?: number;
    fontFamily?: string;
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    borderRadius?: number;
    padding?: number;
    fadeOutDuration?: number;
    maxWidth?: number;
  };
}

export const KeystrokeLayer: React.FC<KeystrokeLayerProps> = ({
  keyboardEvents = [],
  settings = {}
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KeystrokeRenderer | null>(null);
  
  // Initialize renderer once
  useEffect(() => {
    rendererRef.current = new KeystrokeRenderer({
      fontSize: settings.fontSize || 16,
      fontFamily: settings.fontFamily || 'SF Pro Display, system-ui, -apple-system, sans-serif',
      backgroundColor: settings.backgroundColor || 'rgba(0, 0, 0, 0.8)',
      textColor: settings.textColor || '#ffffff',
      borderColor: settings.borderColor || 'rgba(255, 255, 255, 0.2)',
      borderRadius: settings.borderRadius || 6,
      padding: settings.padding || 12,
      fadeOutDuration: settings.fadeOutDuration || 300,
      position: settings.position || 'bottom-center',
      maxWidth: settings.maxWidth || 300
    });
    
    if (canvasRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }
    
    // Set keyboard events
    rendererRef.current.setKeyboardEvents(keyboardEvents);
    
    return () => {
      rendererRef.current?.reset();
    };
  }, [settings]);
  
  // Update canvas when ref changes
  useEffect(() => {
    if (canvasRef.current && rendererRef.current) {
      rendererRef.current.setCanvas(canvasRef.current);
    }
  }, [canvasRef.current]);
  
  // Calculate current time in milliseconds
  const currentTimeMs = useMemo(() => {
    return (frame / fps) * 1000;
  }, [frame, fps]);
  
  // Render keystrokes
  useEffect(() => {
    if (!canvasRef.current || !rendererRef.current || keyboardEvents.length === 0) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Render keystrokes at current time
    rendererRef.current.render(currentTimeMs, width, height);
  }, [currentTimeMs, width, height, keyboardEvents]);
  
  // Check if there are keystrokes to render at this time
  const hasKeystrokes = useMemo(() => {
    if (!rendererRef.current || keyboardEvents.length === 0) return false;
    return rendererRef.current.hasKeystrokesAtTime(currentTimeMs);
  }, [currentTimeMs, keyboardEvents]);
  
  // Only render if there are keystrokes to show
  if (!hasKeystrokes && frame > 0) {
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
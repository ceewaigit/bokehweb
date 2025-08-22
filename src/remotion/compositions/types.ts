import type { Clip, ClipEffects, MouseEvent, ClickEvent } from '@/types/project';

export interface MainCompositionProps {
  videoUrl: string;
  clip: Clip | null;
  effects: ClipEffects | null;
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  keystrokeEvents: any[];
}

export interface VideoLayerProps {
  videoUrl: string;
  startFrom?: number;
  endAt?: number;
  effects?: ClipEffects['video'];
  zoom?: ClipEffects['zoom'];
  currentFrame: number;
}

export interface BackgroundLayerProps {
  effects?: ClipEffects['background'];
  videoWidth: number;
  videoHeight: number;
}

export interface CursorLayerProps {
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  currentFrame: number;
  fps: number;
  videoOffset: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom?: {
    scale: number;
    x: number;
    y: number;
  };
}
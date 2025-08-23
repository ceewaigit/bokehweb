import type { Clip, ClipEffects, MouseEvent, ClickEvent } from '@/types/project';

export interface MainCompositionProps {
  videoUrl: string;
  clip: Clip | null;
  effects: ClipEffects | null;
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  keystrokeEvents: any[];
  videoWidth: number;
  videoHeight: number;
  captureArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface VideoLayerProps {
  videoUrl: string;
  effects?: ClipEffects | null;
  zoom?: ClipEffects['zoom'];
  videoWidth: number;
  videoHeight: number;
  captureArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface BackgroundLayerProps {
  effects?: ClipEffects['background'];
  videoWidth: number;
  videoHeight: number;
}

export interface CursorLayerProps {
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
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
    panX?: number;
    panY?: number;
  };
  videoWidth: number;
  videoHeight: number;
  cursorEffects?: ClipEffects['cursor'];
}
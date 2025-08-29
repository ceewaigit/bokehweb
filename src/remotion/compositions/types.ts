import type { Clip, MouseEvent, ClickEvent, Effect, BackgroundEffectData, ZoomBlock, CursorEffectData } from '@/types/project';

export interface MainCompositionProps {
  videoUrl: string;
  clip: Clip | null;
  effects: Effect[] | null;
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
  effects?: Effect[] | null;
  zoomBlocks?: ZoomBlock[];
  videoWidth: number;
  videoHeight: number;
  captureArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  preCalculatedPan?: { x: number; y: number };
  mousePosition?: { x: number; y: number };
}

export interface BackgroundLayerProps {
  backgroundData?: BackgroundEffectData;
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
  zoomBlocks?: ZoomBlock[];
  zoomState?: {  // Add the complete zoom state for manual zoom
    scale: number;
    x: number;
    y: number;
    panX?: number;
    panY?: number;
  };
  videoWidth: number;
  videoHeight: number;
  cursorData?: CursorEffectData;
}
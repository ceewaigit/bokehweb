import type { Clip, MouseEvent, ClickEvent, Effect, BackgroundEffectData, ZoomBlock, CursorEffectData, ScrollEvent } from '@/types/project';

export interface MainCompositionProps {
  videoUrl: string;
  clip: Clip | null;
  nextClip?: Clip | null;
  effects: Effect[] | null;
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  keystrokeEvents: any[];
  scrollEvents?: ScrollEvent[];
  videoWidth: number;
  videoHeight: number;
}

export interface VideoLayerProps {
  videoUrl: string;
  clip?: Clip | null; // Add clip data to access playback rate
  nextClip?: Clip | null; // Next clip for pre-buffering
  effects?: Effect[] | null;
  zoomBlocks?: ZoomBlock[];
  videoWidth: number;
  videoHeight: number;
  zoomCenter?: { x: number; y: number };
  cinematicScrollState?: any; // Cinematic scroll state from calculator
  computedScale?: number;
  sourceTimeMs: number; // Source time for zoom detection and transforms
}

export interface BackgroundLayerProps {
  backgroundData?: BackgroundEffectData;
  videoWidth: number;
  videoHeight: number;
}

export interface CursorLayerProps {
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  clip?: Clip | null;
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

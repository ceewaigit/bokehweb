/**
 * Video Position Context - Shares actual video position and transforms
 *
 * This context ensures that overlays (cursor, annotations, etc.) use the EXACT same
 * video position and transforms as the SharedVideoController, preventing coordinate mismatches.
 */

import React, { createContext, useContext } from 'react';

export interface ZoomTransform {
  scale: number;
  scaleCompensationX: number;
  scaleCompensationY: number;
  panX: number;
  panY: number;
}

export interface VideoPositionContextValue {
  // Video position in composition space (after padding/aspect ratio fitting)
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;

  // Active transforms applied to video
  zoomTransform: ZoomTransform | null;
  padding: number;

  // Original video dimensions (native recording size)
  videoWidth: number;
  videoHeight: number;
}

const VideoPositionContext = createContext<VideoPositionContextValue | null>(null);

export function VideoPositionProvider({
  value,
  children,
}: {
  value: VideoPositionContextValue;
  children: React.ReactNode;
}) {
  return <VideoPositionContext.Provider value={value}>{children}</VideoPositionContext.Provider>;
}

/**
 * Hook to access the actual video position and transforms from SharedVideoController
 *
 * This ensures overlays render at the correct position relative to the video,
 * using the same coordinate space and transforms.
 */
export function useVideoPosition(): VideoPositionContextValue {
  const context = useContext(VideoPositionContext);
  if (!context) {
    throw new Error('useVideoPosition must be used within VideoPositionProvider (inside SharedVideoController)');
  }
  return context;
}

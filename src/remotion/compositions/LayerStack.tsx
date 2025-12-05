/**
 * Layer Stack - Declarative layer rendering
 *
 * Defines the rendering order of all visual layers and composes them together.
 * This component is pure composition - no business logic.
 *
 * Responsibilities:
 * - Define layer z-index ordering
 * - Compose layers declaratively
 * - Pass shared props (videoWidth, videoHeight)
 */

import React from 'react';
import { BackgroundLayer } from './BackgroundLayer';
import { KeystrokeLayer } from './KeystrokeLayer';
import { CursorLayer } from './CursorLayer';
import { useClipContext } from '../context/ClipContext';

export interface LayerStackProps {
  videoWidth: number;
  videoHeight: number;
}

/**
 * Layer Stack
 *
 * Elegant composition: Declarative layer ordering
 * Layers are rendered bottom-to-top (background to cursor)
 */
export const LayerStack: React.FC<LayerStackProps> = ({ videoWidth, videoHeight }) => {
  const { effects } = useClipContext();

  // Extract effect data for layers
  const backgroundEffect = React.useMemo(() => {
    return effects.find((e) => e.type === 'background');
  }, [effects]);

  const cursorEffect = React.useMemo(() => {
    return effects.find((e) => e.type === 'cursor');
  }, [effects]);

  const keystrokeEffect = React.useMemo(() => {
    return effects.find((e) => e.type === 'keystroke');
  }, [effects]);

  return (
    <>
      {/* Layer 0: Background (bottom) */}
      <BackgroundLayer
        backgroundEffect={backgroundEffect}
        videoWidth={videoWidth}
        videoHeight={videoHeight}
      />

      {/* Video layer is now rendered by SharedVideoController at TimelineComposition level */}
      {/* This prevents unmount/remount blinking between clips */}

      {/* Layer 2: Keystrokes (above video) */}
      <KeystrokeLayer keystrokeEffect={keystrokeEffect} videoWidth={videoWidth} videoHeight={videoHeight} />

      {/* Layer 3: Cursor (top) */}
      <CursorLayer cursorEffect={cursorEffect} videoWidth={videoWidth} videoHeight={videoHeight} />
    </>
  );
};

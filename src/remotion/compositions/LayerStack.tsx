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
import { useClipContext } from '../context/ClipContext';

export interface LayerStackProps {
  videoWidth: number;
  videoHeight: number;
  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}

/**
 * Layer Stack
 *
 * Elegant composition: Declarative layer ordering
 * Layers are rendered bottom-to-top (background to cursor)
 */
export const LayerStack: React.FC<LayerStackProps> = ({
  videoWidth,
  videoHeight,
  includeBackground = false,
  includeKeystrokes = true,
}) => {
  const { effects } = useClipContext();

  // Extract effect data for layers
  const backgroundEffect = React.useMemo(() => {
    return effects.find((e) => e.type === 'background');
  }, [effects]);

  // Get ALL keystroke effects (per-typing-period architecture)
  const keystrokeEffects = React.useMemo(() => {
    return effects.filter((e) => e.type === 'keystroke');
  }, [effects]);

  return (
    <>
      {includeBackground && (
        <BackgroundLayer
          backgroundEffect={backgroundEffect}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
        />
      )}

      {/* Video layer is now rendered by SharedVideoController at TimelineComposition level */}
      {/* This prevents unmount/remount blinking between clips */}

      {/* Layer 2: Keystrokes (above video) */}
      {includeKeystrokes && (
        <KeystrokeLayer keystrokeEffects={keystrokeEffects} videoWidth={videoWidth} videoHeight={videoHeight} />
      )}
    </>
  );
};

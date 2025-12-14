/**
 * Clip Sequence - Coordinator for a single clip within the timeline
 *
 * Wraps a clip in a Remotion <Sequence> and provides ClipContext to all layers.
 * This component handles clip-level coordination without rendering logic.
 *
 * Responsibilities:
 * - Wrap clip in Remotion Sequence with correct timing
 * - Provide ClipContext to child layers
 * - Delegate rendering to LayerStack
 */

import React from 'react';
import { Sequence, AbsoluteFill } from 'remotion';
import type { Clip, Effect } from '@/types/project';
import { ClipProvider } from '../context/ClipContext';
import { LayerStack } from './LayerStack';

export interface ClipSequenceProps {
  clip: Clip;
  effects: Effect[];
  videoWidth: number;
  videoHeight: number;
  startFrame: number;
  durationFrames: number;
  videoUrls?: Record<string, string>;
  includeBackground?: boolean;
  includeKeystrokes?: boolean;
}

/**
 * Clip Sequence
 *
 * Clean pattern: Sequence wraps layers, ClipContext provides data
 * No business logic here - just composition
 */
export const ClipSequence: React.FC<ClipSequenceProps> = ({
  clip,
  effects,
  videoWidth,
  videoHeight,
  startFrame,
  durationFrames,
  videoUrls,
  includeBackground,
  includeKeystrokes,
}) => {
  return (
    <Sequence
      from={startFrame}
      durationInFrames={durationFrames}
      name={`Clip ${clip.id}`}
    >
      <ClipProvider clip={clip} effects={effects} videoUrls={videoUrls}>
        <LayerStack
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          includeBackground={includeBackground}
          includeKeystrokes={includeKeystrokes}
        />
      </ClipProvider>
    </Sequence>
  );
};

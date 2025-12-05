/**
 * Timeline Composition - Top-level orchestrator for the entire timeline
 *
 * This composition spans the entire timeline and renders all clips as Remotion Sequences.
 * It eliminates the need for clip-to-clip transitions by keeping the Player configured
 * with a single, stable durationInFrames that never changes.
 *
 * Responsibilities:
 * - Provide TimeContext to all children
 * - Map clips to ClipSequence components
 * - Coordinate timeline-level state
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Clip, Recording, Effect } from '@/types/project';
import { TimeProvider } from '../context/TimeContext';
import { ClipSequence } from './ClipSequence';
import { SharedVideoController } from './SharedVideoController';

export interface TimelineCompositionProps {
  // Timeline data
  clips: Clip[];
  recordings: Recording[];
  effects: Effect[];

  // Video configuration
  videoWidth: number;
  videoHeight: number;
  fps: number;

  videoUrls?: Record<string, string>;
}

/**
 * Timeline Composition
 *
 * Clean separation of concerns:
 * - This component orchestrates (maps clips to sequences)
 * - ClipSequence coordinates (provides clip context)
 * - LayerStack renders (displays visual layers)
 */
export const TimelineComposition: React.FC<TimelineCompositionProps> = ({
  clips,
  recordings,
  effects,
  videoWidth,
  videoHeight,
  fps,
  videoUrls,
}) => {
  // Sort clips by start time for consistent rendering
  const sortedClips = React.useMemo(() => {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
  }, [clips]);



  return (
    <TimeProvider clips={sortedClips} recordings={recordings} fps={fps}>
      <AbsoluteFill
        style={{
          backgroundColor: '#000',
        }}
      >
        {/* SharedVideoController provides VideoPositionContext for all children */}
        <SharedVideoController
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          effects={effects}
          videoUrls={videoUrls}
        >
          {/* Overlay layers (cursor, keystrokes, etc.) rendered per clip as children */}
          {/* They now have access to VideoPositionContext! */}
          {sortedClips.map((clip) => {
            // Calculate sequence frame offset (timeline position in frames)
            const startFrame = Math.round((clip.startTime / 1000) * fps);
            const durationFrames = Math.round((clip.duration / 1000) * fps);

            return (
              <ClipSequence
                key={clip.id}
                clip={clip}
                effects={effects}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                videoUrls={videoUrls}
                startFrame={startFrame}
                durationFrames={durationFrames}
              />
            );
          })}
        </SharedVideoController>
      </AbsoluteFill>
    </TimeProvider>
  );
};

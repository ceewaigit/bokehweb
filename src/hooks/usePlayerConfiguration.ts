/**
 * Player Configuration Hook - Builds input props for TimelineComposition
 *
 * This hook prepares all the data needed by TimelineComposition in a type-safe,
 * memoized structure.
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import type { TimelineCompositionProps } from '@/remotion/compositions/TimelineComposition';

/**
 * Build timeline composition props from project
 *
 * Extracts and organizes all clips, recordings, and effects for the composition.
 */
export function usePlayerConfiguration(
  project: Project | null,
  videoWidth: number,
  videoHeight: number,
  fps: number
): TimelineCompositionProps | null {
  return useMemo(() => {
    if (!project?.timeline.tracks || !project.recordings) {
      return null;
    }

    // Extract all clips from all tracks
    const clips = project.timeline.tracks.flatMap((track) => track.clips);

    if (clips.length === 0) {
      return null;
    }

    // Get all recordings
    const recordings = project.recordings;

    // Collect all effects (from timeline and recordings)
    const timelineEffects = project.timeline.effects || [];

    // Collect effects from recordings
    const recordingEffects = recordings.flatMap((r) => r.effects || []);

    // Combine all effects
    const effects = [...timelineEffects, ...recordingEffects];

    return {
      clips,
      recordings,
      effects,
      videoWidth,
      videoHeight,
      fps,
    };
  }, [project, videoWidth, videoHeight, fps]);
}

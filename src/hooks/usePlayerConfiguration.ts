/**
 * Player Configuration Hook - Builds input props for TimelineComposition
 *
 * This hook prepares all the data needed by TimelineComposition in a type-safe,
 * memoized structure.
 * 
 * SIMPLIFIED: Zoom effects are now always in timeline-space, no conversion needed.
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import type { TimelineCompositionProps } from '@/remotion/compositions/TimelineComposition';
import { useWindowAppearanceStore } from '@/stores/window-appearance-store';

/**
 * Build timeline composition props from project
 *
 * Extracts and organizes all clips, recordings, and effects for the composition.
 * All effects (including zoom) are now stored in timeline-space.
 */
export function usePlayerConfiguration(
  project: Project | null,
  videoWidth: number,
  videoHeight: number,
  fps: number
): TimelineCompositionProps | null {
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)

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

    // Collect all effects - timeline effects are now the single source of truth
    const timelineEffects = project.timeline.effects || [];

    // Collect non-zoom effects from recordings (cursor, background stay in source space)
    const recordingNonZoomEffects = recordings.flatMap((r) =>
      (r.effects || []).filter(e => e.type !== 'zoom')
    );

    // Combine all effects (zoom is already in timeline-space from timeline.effects)
    const effects = [...timelineEffects, ...recordingNonZoomEffects];

    return {
      clips,
      recordings,
      effects,
      videoWidth,
      videoHeight,
      fps,
      backgroundColor: windowSurfaceMode === 'solid' ? '#000' : 'transparent',
    };
  }, [project, videoWidth, videoHeight, fps, windowSurfaceMode]);
}

/**
 * Timeline Metadata Hook - Calculates timeline-level configuration for Remotion Player
 *
 * This hook computes the total duration, fps, and dimensions for the entire timeline,
 * which are used to configure the Remotion Player with stable props.
 */

import { useMemo } from 'react';
import type { Project } from '@/types/project';
import { buildFrameLayout, getTimelineDurationInFrames } from '@/lib/timeline/frame-layout';

export interface TimelineMetadata {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  totalDurationMs: number;
}

/**
 * Calculate timeline metadata from project
 *
 * This provides stable configuration for the Remotion Player that never changes
 * during playback, eliminating the clip-to-clip transition blinking.
 */
export function useTimelineMetadata(project: Project | null): TimelineMetadata | null {
  return useMemo(() => {
    if (!project?.timeline.tracks || !project.recordings) {
      return null;
    }

    // Extract all clips from all tracks
    const clips = project.timeline.tracks.flatMap((track) => track.clips);

    if (clips.length === 0) {
      return null;
    }

    // Calculate total timeline duration (max end time of any clip)
    const totalDurationMs = Math.max(...clips.map((c) => c.startTime + c.duration));

    // Get fps from first recording (assume all recordings have same fps)
    const firstClip = clips[0];
    const firstRecording = project.recordings.find((r) => r.id === firstClip.recordingId);

    if (!firstRecording || !firstRecording.metadata) {
      return null;
    }

    const fps = 30; // Default fps

    // Calculate duration in frames using frame layout to avoid rounding gaps.
    const frameLayout = buildFrameLayout(clips, fps);
    const durationInFrames = getTimelineDurationInFrames(frameLayout);

    // Get dimensions from first recording
    const width = firstRecording.width || 1920;
    const height = firstRecording.height || 1080;

    return {
      durationInFrames,
      fps,
      width,
      height,
      totalDurationMs,
    };
  }, [project]);
}

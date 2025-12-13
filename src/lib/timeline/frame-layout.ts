import type { Clip } from '@/types/project';

export interface FrameLayoutItem {
  clip: Clip;
  startFrame: number;
  durationFrames: number;
  endFrame: number; // exclusive
}

/**
 * Build a frame-accurate layout for contiguous timeline playback.
 *
 * Important: `startFrame` is derived from `clip.startTime` (timeline ms) so effects
 * that rely on `clip.startTime` remain stable. `durationFrames` is derived from the
 * NEXT clip's `startFrame` to eliminate 1-frame gaps caused by independent rounding.
 */
export function buildFrameLayout(clips: Clip[], fps: number): FrameLayoutItem[] {
  if (!clips || clips.length === 0) return [];

  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const startFrames = sorted.map((clip) => Math.round((clip.startTime / 1000) * fps));

  const items: FrameLayoutItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const startFrame = startFrames[i];
    const nextStartFrame = i < sorted.length - 1 ? startFrames[i + 1] : null;
    const isLastClip = i === sorted.length - 1;

    const durationFramesRaw =
      nextStartFrame != null
        ? nextStartFrame - startFrame
        : Math.round((clip.duration / 1000) * fps);

    // For the last clip, add +1 frame to ensure the final frame is visible
    // This prevents the video from disappearing at the very last frame of the timeline
    const durationFrames = Math.max(1, durationFramesRaw) + (isLastClip ? 1 : 0);
    const endFrame = startFrame + durationFrames;

    items.push({ clip, startFrame, durationFrames, endFrame });
  }

  return items;
}

export function getTimelineDurationInFrames(layout: FrameLayoutItem[]): number {
  if (!layout || layout.length === 0) return 0;
  return Math.max(...layout.map((i) => i.endFrame));
}


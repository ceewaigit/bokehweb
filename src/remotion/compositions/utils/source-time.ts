import type { Clip } from '@/types/project';

const getClipPlaybackRate = (clip?: Clip | null): number => {
  const rate = clip?.playbackRate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return 1;
  }
  return rate;
};

const getClipSourceBounds = (clip?: Clip | null): { sourceIn: number; sourceOut: number } => {
  const sourceIn = clip?.sourceIn ?? 0;
  const playbackRate = getClipPlaybackRate(clip);

  const sourceOut = clip?.sourceOut != null && Number.isFinite(clip.sourceOut)
    ? clip.sourceOut
    : sourceIn + (clip?.duration ?? 0) * playbackRate;

  return {
    sourceIn,
    sourceOut: Number.isFinite(sourceOut) ? sourceOut : sourceIn
  };
};

export const getSourceTimeForTimelineMs = (
  timelineMs: number,
  clip?: Clip | null
): number => {
  if (!clip) {
    return timelineMs;
  }

  const playbackRate = getClipPlaybackRate(clip);
  const { sourceIn, sourceOut } = getClipSourceBounds(clip);

  const projected = sourceIn + timelineMs * playbackRate;
  if (!Number.isFinite(projected)) {
    return sourceIn;
  }

  if (projected < sourceIn) return sourceIn;
  if (projected > sourceOut) return sourceOut;
  return projected;
};

export const getSourceTimeForFrame = (
  frameIndex: number,
  fps: number,
  clip?: Clip | null
): number => {
  if (!Number.isFinite(frameIndex) || !Number.isFinite(fps) || fps <= 0) {
    return getSourceTimeForTimelineMs(0, clip);
  }

  const timelineMs = (frameIndex / fps) * 1000;
  return getSourceTimeForTimelineMs(timelineMs, clip);
};

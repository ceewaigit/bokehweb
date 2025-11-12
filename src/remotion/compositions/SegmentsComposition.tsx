import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { MainComposition } from './MainComposition';
import type { TimelineSegment } from '@/lib/export/timeline-processor';
import type { Recording, Effect } from '@/types';
import { sourceToClipRelative } from '@/lib/timeline/time-space-converter';

export interface SegmentsCompositionProps {
  segments: TimelineSegment[];
  recordings: Record<string, Recording>;
  metadata: Record<string, any>;
  videoUrls: Record<string, string>; // Map recording ID to actual video URL
  framerate: number;
  resolution: { width: number; height: number };
  quality?: string;
}

/**
 * Wrapper composition that iterates through segments and renders each clip
 * with the proper video URL. This solves the blank export issue by ensuring
 * each clip gets its video URL properly resolved.
 */
export const SegmentsComposition: React.FC<SegmentsCompositionProps> = ({
  segments,
  recordings,
  metadata,
  videoUrls,
  framerate,
  resolution
}) => {
  const { fps } = useVideoConfig();

  // Process segments into sequential clips with proper timing
  const clips: Array<{
    id: string;
    startFrame: number;
    durationFrames: number;
    videoUrl: string;
    clip: any;
    recording: Recording;
    effects: Effect[];
    metadata: any;
    videoWidth: number;
    videoHeight: number;
  }> = [];

  let currentFrame = 0;

  segments.forEach(segment => {
    segment.clips.forEach(({ clip, recording, segmentStartTime, segmentEndTime }) => {
      if (!clip || !recording) {
        console.warn('[SegmentsComposition] Missing clip or recording data for segment', {
          segmentId: segment.id
        });
        return;
      }

      const segmentDurationMs = (segmentEndTime ?? 0) - (segmentStartTime ?? 0);
      const safeDurationMs = Number.isFinite(segmentDurationMs) ? segmentDurationMs : 0;
      if (safeDurationMs <= 0) {
        console.warn('[SegmentsComposition] Skipping clip with non-positive duration', {
          clipId: clip.id,
          segmentStartTime,
          segmentEndTime
        });
        return;
      }

      const durationFrames = Math.max(1, Math.ceil((safeDurationMs / 1000) * fps));
      
      // Get the video URL for this recording
      let videoUrl = videoUrls[recording.id];
      
      // Use video-stream:// URL as fallback
      if (!videoUrl && recording.filePath) {
        let resolvedPath = recording.filePath;

        if (recording.folderPath) {
          const normalizedFolder = recording.folderPath.replace(/\\/g, '/');
          const fileName = recording.filePath.split(/[\\/]/).pop() || recording.filePath;
          resolvedPath = `${normalizedFolder}/${fileName}`;
        }

        const encodedPath = encodeURIComponent(resolvedPath);
        videoUrl = `video-stream://local/${encodedPath}`;
      }
      
      if (!videoUrl) {
        console.error(`Recording ${recording.id} has no valid video source`);
        return;
      }

      // Get metadata for this recording
      const recordingMetadata = metadata[recording.id] || {};

      const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
      const sourceIn = clip.sourceIn || 0;
      const sourceOut = clip.sourceOut || (clip.sourceIn + (clip.duration * rate));
      const clipDuration = clip.duration || Math.max(0, (sourceOut - sourceIn) / rate);

      const convertTimestamp = (ts: number) => {
        // Use centralized converter for source to clip-relative conversion
        const clipRelativeTime = sourceToClipRelative(ts, clip);
        return Math.max(0, Math.min(clipDuration, clipRelativeTime));
      };

      const within = (ts: number) => ts >= sourceIn && ts <= sourceOut;
      const mapEvents = (events: any[] = []) =>
        events
          .filter(event => within(event.timestamp))
          .map(event => {
            const originalTimestamp = event.timestamp
            const mappedTimestamp = convertTimestamp(originalTimestamp)
            // Convert to clip-relative time (0-based per segment) to match CursorLayer expectations
            // CursorLayer uses useCurrentFrame() which resets to 0 for each <Sequence>
            // Events must be in the same time space for binary search to work correctly
            return {
              ...event,
              timestamp: mappedTimestamp,        // Clip-relative (0-based)
              sourceTimestamp: originalTimestamp  // Preserve original for debugging
            }
          });

      const clipMetadata = {
        ...recordingMetadata,
        mouseEvents: mapEvents(recordingMetadata.mouseEvents),
        cursorEvents: mapEvents(recordingMetadata.mouseEvents),
        clickEvents: mapEvents(recordingMetadata.clickEvents),
        scrollEvents: mapEvents(recordingMetadata.scrollEvents),
        keyboardEvents: mapEvents(recordingMetadata.keyboardEvents)
      };

      const effectStart = clip.startTime;
      const effectEnd = clip.startTime + clip.duration;

      const clipEffects = (segment.effects || []).map(effect => {
        if (!effect.enabled) return effect;
        if (effect.type === 'background') {
          return { ...effect, startTime: 0, endTime: Number.MAX_SAFE_INTEGER };
        }

        const windowStart = Math.max(effect.startTime, effectStart);
        const windowEnd = Math.min(effect.endTime, effectEnd);

        if (windowEnd <= windowStart) {
          return { ...effect, startTime: Number.MAX_SAFE_INTEGER - 1, endTime: Number.MAX_SAFE_INTEGER };
        }

        const relativeStart = Math.max(0, windowStart - effectStart);
        const relativeEnd = Math.max(relativeStart, windowEnd - effectStart);

        return { ...effect, startTime: relativeStart, endTime: relativeEnd };
      });

      clips.push({
        id: `${segment.id}-${clip.id}`,
        startFrame: currentFrame,
        durationFrames,
        videoUrl,
        clip,
        recording,
        effects: clipEffects,
        metadata: clipMetadata,
        videoWidth: recording.width,
        videoHeight: recording.height
      });

      currentFrame += durationFrames;
    });
  });

  return (
    <>
      {clips.map((clipData, index) => {
        const nextClip = clips[index + 1];
        
        return (
          <Sequence
            key={clipData.id}
            from={clipData.startFrame}
            durationInFrames={clipData.durationFrames}
          >
            <MainComposition
              videoUrl={clipData.videoUrl}
              clip={clipData.clip}
              nextClip={nextClip?.clip}
              effects={clipData.effects}
              cursorEvents={clipData.metadata.cursorEvents || []}
              clickEvents={clipData.metadata.clickEvents || []}
              keystrokeEvents={clipData.metadata.keystrokeEvents || []}
              scrollEvents={clipData.metadata.scrollEvents || []}
              videoWidth={clipData.videoWidth}
              videoHeight={clipData.videoHeight}
            />
          </Sequence>
        );
      })}
    </>
  );
};

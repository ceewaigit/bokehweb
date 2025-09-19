import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { MainComposition } from './MainComposition';
import type { TimelineSegment } from '@/lib/export/timeline-processor';
import type { Recording, Effect } from '@/types';

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
    segment.clips.forEach(({ clip, recording }) => {
      // Calculate frames for this clip
      const durationMs = clip.duration;
      const durationFrames = Math.ceil((durationMs / 1000) * fps);
      
      // Get the video URL for this recording
      let videoUrl = videoUrls[recording.id];
      
      // Use direct file:// URL as fallback
      if (!videoUrl && recording.filePath) {
        videoUrl = new URL('file://' + recording.filePath).toString();
      }
      
      if (!videoUrl) {
        console.error(`Recording ${recording.id} has no valid video source`);
        return;
      }

      // Get metadata for this recording
      const recordingMetadata = metadata[recording.id] || {};

      clips.push({
        id: `${segment.id}-${clip.id}`,
        startFrame: currentFrame,
        durationFrames,
        videoUrl,
        clip,
        recording,
        effects: segment.effects || [],
        metadata: recordingMetadata,
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
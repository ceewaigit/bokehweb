import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { MainComposition } from './MainComposition';
import type { TimelineSegment } from '@/lib/export/timeline-processor';
import type { Recording, Effect } from '@/types';
import { createVideoStreamUrl } from '@/lib/utils/video-url-utils';

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
      
      if (!videoUrl) {
        console.warn(`No video URL found for recording ${recording.id}, attempting fallback...`);
        
        // Fallback: try to generate URL from recording's filePath
        if (recording.filePath) {
          // Check if we're in a browser context (export) or Electron (preview)
          // In export, we need file:// URLs, in preview we use video-stream://
          if (typeof window !== 'undefined' && !window.electronAPI) {
            // We're in Remotion's render context, use file:// URL
            const url = new URL('file://' + recording.filePath);
            videoUrl = url.toString();
          } else {
            // We're in Electron preview, use video-stream://
            videoUrl = createVideoStreamUrl(recording.filePath);
          }
          console.log(`Generated fallback URL for ${recording.id}:`, videoUrl);
        } else {
          console.error(`Recording ${recording.id} has no filePath and no video URL`);
          return;
        }
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
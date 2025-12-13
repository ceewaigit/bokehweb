/**
 * Preview Area - Remotion Player Integration
 *
 * Clean refactored version using TimelineComposition.
 * All clip transitions are handled by Remotion Sequences - no more blinking!
 */

'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { TimelineComposition } from '@/remotion/compositions/TimelineComposition';
import { useProjectStore } from '@/stores/project-store';
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata';
import { usePlayerConfiguration } from '@/hooks/usePlayerConfiguration';
import { globalBlobManager } from '@/lib/security/blob-url-manager';

interface PreviewAreaRemotionProps {
  currentTime: number;
  isPlaying: boolean;
}

export function PreviewAreaRemotion({ currentTime, isPlaying }: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null);
  const project = useProjectStore((state) => state.currentProject);

  // Calculate timeline metadata (total duration, fps, dimensions)
  const timelineMetadata = useTimelineMetadata(project);

  // Build player configuration props
  const playerConfig = usePlayerConfiguration(
    project,
    timelineMetadata?.width || 1920,
    timelineMetadata?.height || 1080,
    timelineMetadata?.fps || 30
  );

  // Calculate composition size for preview (720p default for performance)
  const compositionSize = useMemo(() => {
    if (!timelineMetadata) return { width: 1280, height: 720 };

    const videoWidth = timelineMetadata.width;
    const videoHeight = timelineMetadata.height;
    const videoAspectRatio = videoWidth / videoHeight;

    // Scale to 720p max for preview performance
    const maxWidth = 1280;
    const maxHeight = 720;

    const scaleByWidth = maxWidth / videoWidth;
    const scaleByHeight = maxHeight / videoHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight, 1); // Don't upscale

    let width = Math.max(320, Math.round(videoWidth * scale));
    let height = Math.max(180, Math.round(videoHeight * scale));

    // Ensure aspect ratio is maintained
    if (Math.abs(width / height - videoAspectRatio) > 0.001) {
      height = Math.round(width / videoAspectRatio);
    }

    // Ensure even dimensions (required for video encoding)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 2) * 2;

    return { width, height };
  }, [timelineMetadata]);

  // Ensure all videos are loaded
  useEffect(() => {
    if (!project?.recordings) return;

    // Load all recording videos
    const loadVideos = async () => {
      for (const recording of project.recordings) {
        if (recording.filePath) {
          try {
            await globalBlobManager.loadVideos({
              id: recording.id,
              filePath: recording.filePath,
              folderPath: recording.folderPath
            });
          } catch (error) {
            console.warn(`Failed to load video for recording ${recording.id}:`, error);
          }
        }
      }
    };

    loadVideos();
  }, [project?.recordings]);

  const clampFrame = (frame: number) => {
    if (!timelineMetadata) return Math.max(0, frame);
    const maxFrame = timelineMetadata.durationInFrames - 1;
    return Math.max(0, Math.min(frame, maxFrame));
  };

  const timeToFrame = (timeMs: number) => {
    if (!timelineMetadata) return 0;
    return Math.round((timeMs / 1000) * timelineMetadata.fps);
  };

  // When playing, drive playback via the Remotion Player (so audio can play).
  // When paused, sync the player to the currentTime (scrubbing/seek).
  useEffect(() => {
    if (!playerRef.current || !timelineMetadata) return;

    const targetFrame = clampFrame(timeToFrame(currentTime));

    if (isPlaying) {
      try {
        playerRef.current.seekTo(targetFrame);
      } catch (e) {
        console.warn('Failed to seek before play:', e);
      }

      try {
        playerRef.current.unmute();
        playerRef.current.setVolume(1);
      } catch {
        // Best-effort: older player versions may not expose all methods
      }

      try {
        playerRef.current.play();
      } catch (e) {
        console.warn('Failed to play:', e);
      }

      return;
    }

    try {
      playerRef.current.pause();
    } catch (e) {
      console.warn('Failed to pause:', e);
    }

    try {
      playerRef.current.seekTo(targetFrame);
    } catch (e) {
      console.warn('Failed to seek:', e);
    }
  }, [currentTime, isPlaying, timelineMetadata]);

  // Calculate initial frame
  const initialFrame = useMemo(() => {
    if (!timelineMetadata) return 0;
    return clampFrame(timeToFrame(currentTime));
  }, [currentTime, timelineMetadata]);

  // Generate a key that changes when clip positions change to force Player re-render
  // MUST include startTime - without it, Player won't remount after reorder
  // and the Remotion composition will use stale clip data
  const playerKey = useMemo(() => {
    const clips = project?.timeline.tracks.flatMap(t => t.clips) || [];
    return clips.map(c => `${c.id}:${c.startTime}:${c.duration}:${c.sourceIn}:${c.sourceOut}`).join('|');
  }, [project?.timeline.tracks]);

  // Show loading state if no data
  if (!timelineMetadata || !playerConfig) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-transparent">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-gray-500 text-center">
            <p className="text-lg font-medium mb-2">No timeline data</p>
            <p className="text-sm">Create or select a project to preview</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          <Player
            key={playerKey}
            ref={playerRef}
            component={TimelineComposition as any}
            inputProps={playerConfig as any}
            durationInFrames={timelineMetadata.durationInFrames}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            fps={timelineMetadata.fps}
            initialFrame={initialFrame}
            initiallyMuted={false}
            style={{
              width: '100%',
              height: '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            controls={false}
            loop={false}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            alwaysShowControls={false}
            initiallyShowControls={false}
            showPosterWhenPaused={false}
            showPosterWhenUnplayed={false}
            showPosterWhenEnded={false}
            moveToBeginningWhenEnded={false}
            renderLoading={() => (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-muted-foreground">Loading preview...</div>
              </div>
            )}
            errorFallback={({ error }: { error: Error }) => {
              console.error('Remotion Player error:', error);
              return (
                <div className="flex items-center justify-center h-full bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      Video playback error
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Please try reloading the video
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      {error.message}
                    </p>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

'use client'

import { useRef, useEffect, useState } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '@/remotion/compositions/MainComposition'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import type { Clip, Recording, ClipEffects } from '@/types/project'

interface PreviewAreaRemotionProps {
  selectedClip: Clip | null
  selectedRecording: Recording | null | undefined
  currentTime: number
  isPlaying: boolean
  localEffects?: ClipEffects | null
  onTimeUpdate?: (time: number) => void
}

export function PreviewAreaRemotion({
  selectedClip,
  selectedRecording,
  currentTime,
  isPlaying,
  localEffects,
  onTimeUpdate
}: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Load video URL when recording changes
  useEffect(() => {
    if (!selectedRecording) {
      setVideoUrl(null)
      return
    }

    // Get cached blob URL first - should already be loaded by workspace-manager
    const cachedUrl = RecordingStorage.getBlobUrl(selectedRecording.id)
    
    if (cachedUrl) {
      // Video is already loaded, use it immediately
      setVideoUrl(cachedUrl)
    } else if (selectedRecording.filePath) {
      // Load the video (edge case - should rarely happen)
      globalBlobManager.ensureVideoLoaded(
        selectedRecording.id,
        selectedRecording.filePath
      ).then(url => {
        if (url) {
          setVideoUrl(url)
        }
      }).catch(error => {
        console.error('Error loading video:', error)
      })
    }
  }, [selectedRecording?.id]);

  // Sync playback state
  useEffect(() => {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [isPlaying]);

  // Sync current time when scrubbing (not playing)
  useEffect(() => {
    if (!playerRef.current || !selectedClip || isPlaying) return;

    // Convert timeline time to clip-relative frame
    const clipStart = selectedClip.startTime;
    const clipProgress = Math.max(0, currentTime - clipStart);
    const frameRate = 30
    const targetFrame = Math.floor((clipProgress / 1000) * frameRate);

    playerRef.current.seekTo(targetFrame);
  }, [currentTime, selectedClip, isPlaying]);

  // Handle time updates from player during playback
  useEffect(() => {
    if (!playerRef.current || !selectedClip || !onTimeUpdate || !isPlaying) return;

    const updateInterval = setInterval(() => {
      if (!playerRef.current) return;

      const currentFrame = playerRef.current.getCurrentFrame();
      const frameRate = 30;
      const clipProgress = (currentFrame / frameRate) * 1000;
      const timelineTime = selectedClip.startTime + clipProgress;

      onTimeUpdate(timelineTime);
    }, 1000 / 30); // Update at 30fps

    return () => clearInterval(updateInterval);
  }, [selectedClip, onTimeUpdate, isPlaying]);

  // Get video dimensions and padding
  const videoWidth = selectedRecording?.width || 1920;
  const videoHeight = selectedRecording?.height || 1080;
  const padding = (localEffects || selectedClip?.effects)?.background?.padding || 0;

  // Calculate composition size to maintain video aspect ratio with padding
  // We want the composition to match the video aspect ratio
  const videoAspectRatio = videoWidth / videoHeight;

  // Use a base size and scale to maintain aspect ratio
  const baseSize = 1920; // Base width for standard videos
  let compositionWidth: number;
  let compositionHeight: number;

  if (videoAspectRatio > 1) {
    // Landscape video
    compositionWidth = baseSize;
    compositionHeight = Math.round(baseSize / videoAspectRatio);
  } else {
    // Portrait or square video
    compositionHeight = baseSize;
    compositionWidth = Math.round(baseSize * videoAspectRatio);
  }

  // Add padding to composition size
  compositionWidth += padding * 2;
  compositionHeight += padding * 2;

  // Calculate composition props
  const compositionProps = {
    videoUrl: videoUrl || '',
    clip: selectedClip,
    effects: localEffects || selectedClip?.effects || null,
    cursorEvents: selectedRecording?.metadata?.mouseEvents || [],
    clickEvents: selectedRecording?.metadata?.clickEvents || [],
    keystrokeEvents: (selectedRecording?.metadata as any)?.keystrokeEvents || [],
    videoWidth,
    videoHeight,
    captureArea: undefined // Full screen recordings display naturally
  };

  // Calculate duration in frames
  const durationInFrames = selectedClip
    ? Math.ceil((selectedClip.duration / 1000) * 30) // 30fps
    : 900; // Default 30 seconds

  if (!selectedRecording) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-background">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-gray-500 text-center">
            <p className="text-lg font-medium mb-2">No recording selected</p>
            <p className="text-sm">Select a recording from the library to preview</p>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div 
          className="relative w-full h-full flex items-center justify-center"
        >
          {videoUrl ? (
            <Player
              ref={playerRef}
              component={MainComposition as any}
              inputProps={compositionProps}
              durationInFrames={durationInFrames}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              fps={30}
              style={{
                width: '100%',
                height: '100%',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              controls={false}
              loop={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              errorFallback={({ error }) => {
                console.error('Remotion Player error:', error)
                return (
                  <div className="flex items-center justify-center h-full bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-red-600 dark:text-red-400 font-medium">Video playback error</p>
                      <p className="text-sm text-muted-foreground mt-1">Please try reloading the video</p>
                    </div>
                  </div>
                )
              }}
              moveToBeginningWhenEnded={false}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">No video selected</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
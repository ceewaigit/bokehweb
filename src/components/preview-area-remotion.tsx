'use client'

import { useRef, useEffect, useState } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '@/remotion/compositions/MainComposition'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Recording, Effect } from '@/types/project'

interface PreviewAreaRemotionProps {
  playheadClip?: Clip | null
  playheadRecording?: Recording | null | undefined
  currentTime: number
  isPlaying: boolean
  localEffects?: Effect[] | null
  onTimeUpdate?: (time: number) => void
}

export function PreviewAreaRemotion({
  playheadClip,
  playheadRecording,
  currentTime,
  isPlaying,
  localEffects,
  onTimeUpdate
}: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Only use playhead clip/recording for preview - no fallback to maintain separation of concerns
  const previewClip = playheadClip
  const previewRecording = playheadRecording

  // Load video URL when recording changes - clear immediately when no clip
  useEffect(() => {
    
    if (!previewRecording) {
      setVideoUrl(null)
      return
    }

    // Get cached blob URL first - should already be loaded by workspace-manager
    const cachedUrl = RecordingStorage.getBlobUrl(previewRecording.id)

    if (cachedUrl) {
      // Video is already loaded, use it immediately
      setVideoUrl(cachedUrl)
    } else if (previewRecording.filePath) {
      // Load the video (edge case - should rarely happen)
      globalBlobManager.ensureVideoLoaded(
        previewRecording.id,
        previewRecording.filePath
      ).then(url => {
        if (url) {
          setVideoUrl(url)
        }
      }).catch(error => {
        console.error('Error loading video:', error)
      })
    }
  }, [previewRecording?.id, playheadRecording]);

  // Sync playback state with timeline
  useEffect(() => {
    if (!playerRef.current) return;

    // Control video player based on timeline state AND clip availability
    if (isPlaying && playheadClip && playheadRecording) {
      // Timeline is playing AND there's a clip - play video
      playerRef.current.play();
    } else {
      // Timeline stopped OR no clip - pause video
      playerRef.current.pause();
    }
  }, [isPlaying, playheadClip, playheadRecording]);

  // Sync current time when scrubbing (not playing)
  useEffect(() => {
    if (!playerRef.current || isPlaying) return;

    // Only seek if we have a valid clip and video
    if (!previewClip || !videoUrl) {
      // No clip or video - ensure player is at frame 0
      playerRef.current.seekTo(0);
      return;
    }

    // Convert timeline time to clip-relative frame
    const clipStart = previewClip.startTime;
    const clipProgress = Math.max(0, currentTime - clipStart);
    const frameRate = 30
    const targetFrame = Math.floor((clipProgress / 1000) * frameRate);

    playerRef.current.seekTo(targetFrame);
  }, [currentTime, previewClip, isPlaying, videoUrl]);

  // Handle time updates from player during playback
  useEffect(() => {
    if (!playerRef.current || !previewClip || !onTimeUpdate || !isPlaying) return;

    const updateInterval = setInterval(() => {
      if (!playerRef.current) return;

      const currentFrame = playerRef.current.getCurrentFrame();
      const frameRate = 30;
      const clipProgress = (currentFrame / frameRate) * 1000;
      const timelineTime = previewClip.startTime + clipProgress;

      onTimeUpdate(timelineTime);
    }, 1000 / 30); // Update at 30fps

    return () => clearInterval(updateInterval);
  }, [previewClip, onTimeUpdate, isPlaying]);

  // Get video dimensions
  const videoWidth = previewRecording?.width || 1920;
  const videoHeight = previewRecording?.height || 1080;

  // Get effects from timeline.effects active at current time (timeline-based)
  const currentProjectRef = useProjectStore(state => state.currentProject)
  const currentTimeRef = useProjectStore(state => state.currentTime)
  const clipEffects = currentProjectRef?.timeline?.effects?.filter((e: any) =>
    currentTimeRef >= e.startTime && currentTimeRef <= e.endTime && e.enabled
  ) || []

  // Calculate composition size based on video aspect ratio
  // Don't add padding to composition size - padding is handled internally in the composition
  const videoAspectRatio = videoWidth / videoHeight;
  const baseSize = 1920;
  const compositionWidth = videoAspectRatio > 1 ? baseSize : Math.round(baseSize * videoAspectRatio);
  const compositionHeight = videoAspectRatio > 1 ? Math.round(baseSize / videoAspectRatio) : baseSize;

  // Determine if we should show video or black screen
  const showBlackScreen = !playheadClip || !playheadRecording || !videoUrl;
  
  console.log('Preview state:', {
    hasPlayheadClip: !!playheadClip,
    hasPlayheadRecording: !!playheadRecording,
    hasVideoUrl: !!videoUrl,
    videoUrl: videoUrl,
    showBlackScreen,
    currentTime,
    isPlaying
  })

  // Calculate composition props - use empty video when no clip
  const compositionProps = {
    videoUrl: showBlackScreen ? '' : (videoUrl || ''),
    clip: previewClip,
    effects: localEffects || clipEffects || null,
    cursorEvents: previewRecording?.metadata?.mouseEvents || [],
    clickEvents: previewRecording?.metadata?.clickEvents || [],
    keystrokeEvents: (previewRecording?.metadata as any)?.keyboardEvents || [],
    videoWidth,
    videoHeight,
    captureArea: undefined
  };

  const durationInFrames = previewClip ? Math.ceil((previewClip.duration / 1000) * 30) : 900;
  const hasNoProject = !previewRecording && !playheadClip;


  // Show message when no project/recording at all
  if (hasNoProject) {
    return (
      <div className="relative w-full h-full overflow-hidden">
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
      {/* Black screen overlay when in gaps or no video */}
      {showBlackScreen && (
        <div className="absolute inset-0 bg-black z-10" />
      )}

      {/* Always render player container to maintain playerRef */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="relative w-full h-full flex items-center justify-center"
        >
          <Player
            key={showBlackScreen ? 'black' : `video-${playheadRecording?.id || 'none'}`}
            ref={playerRef}
            component={MainComposition as any}
            inputProps={compositionProps}
            durationInFrames={durationInFrames || 900}
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
        </div>
      </div>
    </div>
  );
}
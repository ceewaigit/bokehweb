'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '@/remotion/compositions/MainComposition'
import { Skeleton } from '@/components/ui/skeleton'
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
  onPlayingChange?: (playing: boolean) => void
}

export function PreviewAreaRemotion({
  selectedClip,
  selectedRecording,
  currentTime,
  isPlaying,
  localEffects,
  onTimeUpdate,
  onPlayingChange
}: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Load video URL when recording changes
  useEffect(() => {
    if (!selectedRecording) {
      setVideoUrl(null)
      return
    }

    const loadVideo = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        // Get blob URL from recording storage
        let blobUrl = RecordingStorage.getBlobUrl(selectedRecording.id)

        // For blob URLs, we can't use HEAD requests, so skip validation
        // Blob URLs are memory-managed and will be valid as long as they exist
        if (blobUrl && !blobUrl.startsWith('blob:')) {
          // Only validate non-blob URLs (shouldn't happen in practice)
          try {
            const response = await fetch(blobUrl, { 
              method: 'HEAD',
              cache: 'no-cache'
            }).catch(() => null)
            
            if (!response || !response.ok) {
              // Cached URL is invalid, clear it
              RecordingStorage.clearBlobUrl(selectedRecording.id)
              blobUrl = null
            }
          } catch {
            // URL validation failed, reload
            RecordingStorage.clearBlobUrl(selectedRecording.id)
            blobUrl = null
          }
        }

        if (blobUrl) {
          // Already loaded and valid
          setVideoUrl(blobUrl)
        } else if (selectedRecording.filePath) {
          // Load the video file
          const url = await globalBlobManager.ensureVideoLoaded(
            selectedRecording.id,
            selectedRecording.filePath
          )

          if (url) {
            setVideoUrl(url)
          } else {
            setLoadError('Failed to load video file')
          }
        } else {
          setLoadError('No video file available')
        }
      } catch (error) {
        setLoadError(`Failed to load video: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadVideo()
  }, [selectedRecording]);

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
  const captureAreaToUse = selectedRecording?.captureArea?.fullBounds || undefined
  
  console.log('🎯 PreviewArea - Capture area data:', {
    fullCaptureArea: selectedRecording?.captureArea,
    fullBounds: selectedRecording?.captureArea?.fullBounds,
    captureAreaToUse,
    videoWidth,
    videoHeight,
    recordingId: selectedRecording?.id,
    metadataCapture: selectedRecording?.metadata?.captureArea,
    firstMouseEvent: selectedRecording?.metadata?.mouseEvents?.[0]
  })
  
  const compositionProps = {
    videoUrl: videoUrl || '',
    clip: selectedClip,
    effects: localEffects || selectedClip?.effects || null,
    cursorEvents: selectedRecording?.metadata?.mouseEvents || [],
    clickEvents: selectedRecording?.metadata?.clickEvents || [],
    keystrokeEvents: (selectedRecording?.metadata as any)?.keystrokeEvents || [],
    videoWidth,
    videoHeight,
    captureArea: captureAreaToUse
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

  if (loadError) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-background">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 max-w-md">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-destructive mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-destructive">Failed to load video</h3>
                <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-background">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="relative w-full max-w-4xl">
            <div className="relative aspect-video">
              <Skeleton className="absolute inset-0 rounded-lg" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="bg-background/80 backdrop-blur-sm rounded-lg p-6 shadow-lg">
                  <div className="flex flex-col items-center space-y-3">
                    <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div className="text-center">
                      <p className="text-sm font-medium">Loading video</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          {videoUrl && (
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
          )}
        </div>
      </div>
    </div>
  );
}
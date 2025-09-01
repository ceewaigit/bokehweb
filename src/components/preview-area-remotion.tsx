'use client'

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
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

// Preview quality presets
type PreviewQuality = 'low' | 'medium' | 'high' | 'auto'

const QUALITY_PRESETS: Record<PreviewQuality, { maxWidth: number; maxHeight: number; label: string }> = {
  low: { maxWidth: 854, maxHeight: 480, label: '480p' },      // 480p
  medium: { maxWidth: 1280, maxHeight: 720, label: '720p' },   // 720p
  high: { maxWidth: 1920, maxHeight: 1080, label: '1080p' },   // 1080p
  auto: { maxWidth: 1280, maxHeight: 720, label: 'Auto' }      // Default to 720p for auto
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 1280, height: 720 })
  const [previewQuality, setPreviewQuality] = useState<PreviewQuality>('medium')

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

  // Track container size with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width: Math.floor(width), height: Math.floor(height) })
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Get video dimensions
  const videoWidth = previewRecording?.width || 1920;
  const videoHeight = previewRecording?.height || 1080;

  // Get effects from store's playheadEffects (already filtered for current time)
  const playheadEffects = useProjectStore(state => state.playheadEffects)

  // Convert effects to clip-relative times for Remotion
  const clipRelativeEffects = useMemo(() => {
    if (!previewClip || (!localEffects && !playheadEffects)) return null
    
    const effectsToConvert = localEffects || playheadEffects || []
    const clipStart = previewClip.startTime
    
    // Convert absolute timeline times to clip-relative times
    return effectsToConvert.map(effect => ({
      ...effect,
      startTime: effect.startTime - clipStart,
      endTime: effect.endTime - clipStart
    }))
  }, [previewClip, localEffects, playheadEffects])

  // Memoize composition props to prevent unnecessary re-renders
  const compositionProps = useMemo(() => {
    const showBlackScreen = !playheadClip || !playheadRecording || !videoUrl
    return {
      videoUrl: showBlackScreen ? '' : (videoUrl || ''),
      clip: previewClip,
      effects: clipRelativeEffects,
      cursorEvents: previewRecording?.metadata?.mouseEvents || [],
      clickEvents: previewRecording?.metadata?.clickEvents || [],
      keystrokeEvents: (previewRecording?.metadata as any)?.keyboardEvents || [],
      videoWidth,
      videoHeight,
      captureArea: undefined
    }
  }, [playheadClip, playheadRecording, videoUrl, previewClip, clipRelativeEffects, previewRecording, videoWidth, videoHeight])

  // Calculate optimal composition size based on container and quality settings
  const calculateOptimalCompositionSize = useCallback(() => {
    const preset = QUALITY_PRESETS[previewQuality]
    const videoAspectRatio = videoWidth / videoHeight
    
    // Start with container size
    let targetWidth = containerSize.width
    let targetHeight = containerSize.height
    
    // Apply device pixel ratio (capped at 1.5 for performance)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    targetWidth = Math.floor(targetWidth * dpr)
    targetHeight = Math.floor(targetHeight * dpr)
    
    // Cap to quality preset maximums
    targetWidth = Math.min(targetWidth, preset.maxWidth)
    targetHeight = Math.min(targetHeight, preset.maxHeight)
    
    // Maintain aspect ratio while fitting within target dimensions
    let compositionWidth: number
    let compositionHeight: number
    
    if (targetWidth / targetHeight > videoAspectRatio) {
      // Container is wider than video - fit by height
      compositionHeight = targetHeight
      compositionWidth = Math.round(targetHeight * videoAspectRatio)
    } else {
      // Container is taller than video - fit by width
      compositionWidth = targetWidth
      compositionHeight = Math.round(targetWidth / videoAspectRatio)
    }
    
    // Ensure minimum size for stability
    compositionWidth = Math.max(compositionWidth, 320)
    compositionHeight = Math.max(compositionHeight, 180)
    
    // Round to even numbers for better codec compatibility
    compositionWidth = Math.floor(compositionWidth / 2) * 2
    compositionHeight = Math.floor(compositionHeight / 2) * 2
    
    return { compositionWidth, compositionHeight }
  }, [containerSize, previewQuality, videoWidth, videoHeight])
  
  const { compositionWidth, compositionHeight } = calculateOptimalCompositionSize()

  // Determine if we should show video or black screen
  const showBlackScreen = !playheadClip || !playheadRecording || !videoUrl;

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
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-background">
      {/* Black screen overlay when in gaps or no video */}
      {showBlackScreen && (
        <div className="absolute inset-0 bg-black z-10" />
      )}

      {/* Quality selector overlay */}
      <div className="absolute top-2 right-2 z-20">
        <select
          value={previewQuality}
          onChange={(e) => setPreviewQuality(e.target.value as PreviewQuality)}
          className="px-2 py-1 text-xs bg-background/80 backdrop-blur-sm border rounded"
        >
          {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label} ({preset.maxWidth}×{preset.maxHeight})
            </option>
          ))}
        </select>
      </div>

      {/* Always render player container to maintain playerRef */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="relative w-full h-full flex items-center justify-center"
        >
          <Player
            key={`${playheadRecording?.id || 'none'}`}
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
            renderLoading={() => (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-muted-foreground">Loading preview...</div>
              </div>
            )}
            // Performance optimizations
            alwaysShowControls={false}
            initiallyShowControls={false}
            showPosterWhenPaused={false}
            showPosterWhenUnplayed={false}
            showPosterWhenEnded={false}
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
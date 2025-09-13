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
  localEffects
}: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null)
  
  // Dual video buffer state for seamless transitions
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null)
  const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null)
  const [activeClip, setActiveClip] = useState<Clip | null>(null)
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null)
  
  // Resolution selection removed; default to 'auto' preset internally
  const DEFAULT_PREVIEW_QUALITY: PreviewQuality = 'auto'
  
  // Get next clip/recording from store for preloading
  const { nextClip, nextRecording } = useProjectStore(state => ({
    nextClip: state.nextClip,
    nextRecording: state.nextRecording
  }))
  
  // Handle clip transitions and buffer swapping
  useEffect(() => {
    // Check if we need to transition to a new clip
    if (playheadClip && playheadRecording) {
      // Check if this is a different clip than what's currently active
      if (!activeClip || activeClip.id !== playheadClip.id) {
        // Check if this clip was preloaded
        if (nextClip && nextClip.id === playheadClip.id && preloadVideoUrl) {
          // Swap buffers - preloaded video becomes active
          setActiveVideoUrl(preloadVideoUrl)
          setPreloadVideoUrl(null)
        } else {
          // Load new video for active buffer
          const url = RecordingStorage.getBlobUrl(playheadRecording.id)
          if (url) {
            setActiveVideoUrl(url)
          }
        }
        setActiveClip(playheadClip)
        setActiveRecording(playheadRecording)
      }
    }
  }, [playheadClip?.id, playheadRecording?.id, nextClip?.id, preloadVideoUrl, currentTime])
  
  // Preload next clip's video
  useEffect(() => {
    if (nextClip && nextRecording) {
      // Check if we already have this video loaded
      const existingUrl = RecordingStorage.getBlobUrl(nextRecording.id)
      if (existingUrl && existingUrl !== preloadVideoUrl) {
        setPreloadVideoUrl(existingUrl)
      } else if (!existingUrl && nextRecording.filePath) {
        // Load the video in background
        globalBlobManager.ensureVideoLoaded(
          nextRecording.id,
          nextRecording.filePath
        ).then(url => {
          if (url) {
            setPreloadVideoUrl(url)
          }
        }).catch(() => {})
      }
    }
  }, [nextClip?.id, nextRecording?.id, nextRecording?.filePath])
  
  // Use active clip for preview (never null during playback)
  const previewClip = activeClip || playheadClip
  const previewRecording = activeRecording || playheadRecording

  // Calculate if we're in a transition zone (near clip boundary)
  const isNearTransition = useMemo(() => {
    if (!nextClip || !currentTime) return false
    const timeToNext = nextClip.startTime - currentTime
    return timeToNext > 0 && timeToNext < 100 // Within 100ms of next clip
  }, [nextClip?.startTime, currentTime])
  
  // Calculate crossfade opacity for smooth transitions
  const crossfadeOpacity = useMemo(() => {
    if (!isNearTransition || !nextClip) return 1.0
    
    const timeToNext = nextClip.startTime - currentTime
    if (timeToNext <= 0 || timeToNext > 100) return 1.0
    
    // Linear fade over last 50ms before transition
    if (timeToNext > 50) return 1.0
    return timeToNext / 50
  }, [isNearTransition, nextClip?.startTime, currentTime])

  // Sync playback state with timeline
  useEffect(() => {
    if (!playerRef.current) return;

    // Control video player based on timeline state AND clip availability
    // Use previewClip instead of playheadClip to avoid pausing during transitions
    if (isPlaying && previewClip && previewRecording) {
      // Timeline is playing AND there's a clip - play video
      playerRef.current.play();
    } else {
      // Timeline stopped OR no clip - pause video
      playerRef.current.pause();
    }
  }, [isPlaying, previewClip, previewRecording]);

  // Sync current time when scrubbing (not playing)
  useEffect(() => {
    if (!playerRef.current || isPlaying) return;

    // Only seek if we have a valid clip and video
    if (!previewClip || !activeVideoUrl) {
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
  }, [currentTime, previewClip, isPlaying, activeVideoUrl]);

  useEffect(() => {
    return () => {
      try {
        if (playerRef.current) {
          playerRef.current.pause()
          playerRef.current.seekTo(0)
        }
      } catch {}
    }
  }, [])

  // Get video dimensions
  const videoWidth = previewRecording?.width || 1920
  const videoHeight = previewRecording?.height || 1080

  // Get timeline effects (timeline-global)
  const timelineEffects = useProjectStore(state => state.currentProject?.timeline.effects)

  // Build clip-relative event streams so previews respect trim/split
  const adjustedEvents = useMemo(() => {
    const recordingMeta: any = previewRecording?.metadata || {}
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PreviewArea] Total scroll events in recording:', recordingMeta.scrollEvents?.length || 0, 'First few:', recordingMeta.scrollEvents?.slice(0, 3))
    }
    const clip = previewClip
    if (!clip) {
      return {
        mouseEvents: recordingMeta.mouseEvents || [],
        clickEvents: recordingMeta.clickEvents || [],
        scrollEvents: recordingMeta.scrollEvents || [],
        keyboardEvents: recordingMeta.keyboardEvents || []
      }
    }

    const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
    const sourceIn = clip.sourceIn || 0
    const sourceOut = clip.sourceOut || (clip.sourceIn + (clip.duration * rate))

    // Map source timestamps into clip-relative timeline, then scale by playback rate
    const mapWindow = (ts: number) => (ts - sourceIn) / rate

    const within = (ts: number) => ts >= sourceIn && ts <= sourceOut

    const mouseEvents = (recordingMeta.mouseEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({
      ...e,
      timestamp: mapWindow(e.timestamp)
    }))
    const clickEvents = (recordingMeta.clickEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({
      ...e,
      timestamp: mapWindow(e.timestamp)
    }))
    const scrollEvents = (recordingMeta.scrollEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({
      ...e,
      timestamp: mapWindow(e.timestamp)
    }))

    if (process.env.NODE_ENV !== 'production' && scrollEvents.length > 0) {
      console.log('[PreviewArea] Scroll events for clip:', scrollEvents.length, 'First few:', scrollEvents.slice(0, 3))
    }
    const keyboardEvents = (recordingMeta.keyboardEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({
      ...e,
      timestamp: mapWindow(e.timestamp)
    }))

    return { mouseEvents, clickEvents, scrollEvents, keyboardEvents }
  }, [previewClip, previewRecording?.metadata])

  // Convert effects to clip-relative times for Remotion
  const clipRelativeEffects = useMemo(() => {
    if (!previewClip) return null

    const clipStart = previewClip.startTime
    const clipEnd = previewClip.startTime + previewClip.duration

    // Merge store effects with local (unsaved) effects.
    // - Keep store timing (start/end) authoritative to reflect timeline edits immediately
    // - Apply local data/enabled overrides when present
    const baseEffects: Effect[] = (timelineEffects || []) as Effect[]

    let mergedEffects: Effect[] = baseEffects

    if (localEffects) {
      const byId = new Map<string, Effect>(baseEffects.map(e => [e.id, e]))

      for (const le of localEffects) {
        const existing = byId.get(le.id)
        if (existing) {
          byId.set(le.id, {
            ...existing,
            // Preserve store timing so duration/position changes from timeline are reflected
            startTime: existing.startTime,
            endTime: existing.endTime,
            // Override effect data and enabled flag from local changes
            data: { ...(existing as any).data, ...(le as any).data } as any,
            enabled: le.enabled ?? existing.enabled
          } as Effect)
        } else {
          // Local-only effect (e.g., newly created but not yet saved)
          byId.set(le.id, le)
        }
      }

      mergedEffects = Array.from(byId.values())
    }

    const effectsToConvert = mergedEffects.filter(effect =>
      effect.enabled &&
      effect.startTime < clipEnd &&
      effect.endTime > clipStart
    )

    return effectsToConvert.map(effect => ({
      ...effect,
      startTime: effect.startTime - clipStart,
      endTime: effect.endTime - clipStart
    }))
  }, [previewClip, localEffects, timelineEffects])

  // Memoize composition props to prevent unnecessary re-renders
  const compositionProps = useMemo(() => {
    return {
      videoUrl: activeVideoUrl || '',
      preloadVideoUrl: preloadVideoUrl || '',
      clip: previewClip,
      effects: clipRelativeEffects,
      cursorEvents: adjustedEvents.mouseEvents,
      clickEvents: adjustedEvents.clickEvents,
      keystrokeEvents: adjustedEvents.keyboardEvents,
      scrollEvents: adjustedEvents.scrollEvents,
      videoWidth,
      videoHeight,
      crossfadeOpacity,
      isNearTransition
    }
  }, [previewClip, activeVideoUrl, preloadVideoUrl, clipRelativeEffects, adjustedEvents, videoWidth, videoHeight, crossfadeOpacity, isNearTransition])

  // Calculate optimal composition size based on container and quality settings
  const calculateOptimalCompositionSize = useCallback(() => {
    const preset = QUALITY_PRESETS[DEFAULT_PREVIEW_QUALITY]
    const videoAspectRatio = videoWidth / videoHeight

    // Determine a scale based on preset limits relative to the source video
    const scaleByWidth = preset.maxWidth / videoWidth
    const scaleByHeight = preset.maxHeight / videoHeight
    const scale = Math.min(scaleByWidth, scaleByHeight)

    let compositionWidth = Math.max(320, Math.round(videoWidth * scale))
    let compositionHeight = Math.max(180, Math.round(videoHeight * scale))

    // Keep aspect ratio exact
    if (Math.abs(compositionWidth / compositionHeight - videoAspectRatio) > 0.001) {
      compositionHeight = Math.round(compositionWidth / videoAspectRatio)
    }

    // Round to even numbers for better codec compatibility
    compositionWidth = Math.floor(compositionWidth / 2) * 2
    compositionHeight = Math.floor(compositionHeight / 2) * 2

    return { compositionWidth, compositionHeight }
  }, [videoWidth, videoHeight])
  
  const { compositionWidth, compositionHeight } = calculateOptimalCompositionSize()

  // Use recording duration when available to prevent Player resets between splits
  const durationInFrames = useMemo(() => {
    // Use full recording duration if available to keep Player stable
    if (previewRecording) {
      return Math.ceil((previewRecording.duration / 1000) * 30)
    }
    // Fallback to clip duration
    if (previewClip) {
      return Math.ceil((previewClip.duration / 1000) * 30)
    }
    return 900
  }, [previewRecording?.duration, previewClip?.duration]);
  // Smart player key - only remount when switching recordings, not between splits
  const playerKey = useMemo(() => {
    const recordingId = activeRecording?.id || 'none'
    return `${recordingId}-${previewClip?.playbackRate ?? 1}-${compositionWidth}x${compositionHeight}`
  }, [activeRecording?.id, previewClip?.playbackRate, compositionWidth, compositionHeight])

  // Show message when no content available
  if (!previewClip || !previewRecording || !activeVideoUrl) {
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
          <Player
            key={playerKey}
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
            errorFallback={({ error }: { error: Error }) => {
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
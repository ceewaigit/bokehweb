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
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  // Resolution selection removed; default to 'auto' preset internally
  const DEFAULT_PREVIEW_QUALITY: PreviewQuality = 'auto'

  // Use playhead clip/recording for preview, or keep last valid clip when in gaps
  const [lastValidClip, setLastValidClip] = useState<Clip | null>(null)
  const [lastValidRecording, setLastValidRecording] = useState<Recording | null>(null)
  
  // Update last valid clip/recording when we have one
  useEffect(() => {
    if (playheadClip && playheadRecording) {
      setLastValidClip(playheadClip)
      setLastValidRecording(playheadRecording)
    }
  }, [playheadClip, playheadRecording])
  
  // Use current clip if available, otherwise show last valid clip (prevents black screen in gaps)
  const previewClip = playheadClip || lastValidClip
  const previewRecording = playheadRecording || lastValidRecording

  // Load video URL when recording changes - clear immediately when no clip
  useEffect(() => {
    if (!previewRecording) {
      setVideoUrl(null)
      return
    }

    // Get cached blob URL first - should already be loaded by workspace-manager
    const cachedUrl = RecordingStorage.getBlobUrl(previewRecording.id)

    let cancelled = false

    if (cachedUrl) {
      // Video is already loaded, use it immediately
      setVideoUrl(cachedUrl)
    } else if (previewRecording.filePath) {
      // Load the video (edge case - should rarely happen)
      globalBlobManager.ensureVideoLoaded(
        previewRecording.id,
        previewRecording.filePath
      ).then(url => {
        if (url && !cancelled) {
          setVideoUrl(url)
        }
      }).catch(error => {
        console.error('Error loading video:', error)
      })
    }

    return () => {
      cancelled = true
      // Clear video URL so the player doesn't try to fetch a revoked blob
      setVideoUrl(null)
    }
  }, [previewRecording?.id, previewRecording?.filePath]);

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
    const showBlackScreen = !playheadClip || !playheadRecording || !videoUrl
    return {
      videoUrl: showBlackScreen ? '' : (videoUrl || ''),
      clip: previewClip,
      effects: clipRelativeEffects,
      cursorEvents: adjustedEvents.mouseEvents,
      clickEvents: adjustedEvents.clickEvents,
      keystrokeEvents: adjustedEvents.keyboardEvents,
      scrollEvents: adjustedEvents.scrollEvents,
      videoWidth,
      videoHeight
    }
  }, [playheadClip, playheadRecording, videoUrl, previewClip, clipRelativeEffects, adjustedEvents, videoWidth, videoHeight])

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

  // Determine if we should show video or black screen
  const showBlackScreen = !playheadClip || !playheadRecording || !videoUrl;

  const durationInFrames = previewClip ? Math.ceil((previewClip.duration / 1000) * 30) : 900;
  const hasNoProject = !previewRecording && !playheadClip;

  // Force Player remount when clip timing characteristics change
  const playerKey = useMemo(() => {
    const k = [
      previewClip?.id || 'none',
      previewClip?.startTime ?? -1,
      previewClip?.duration ?? -1,
      previewClip?.sourceIn ?? -1,
      previewClip?.sourceOut ?? -1,
      previewClip?.playbackRate ?? 1,
      compositionWidth,
      compositionHeight
    ].join('-')
    return k
  }, [previewClip?.id, previewClip?.startTime, previewClip?.duration, previewClip?.sourceIn, previewClip?.sourceOut, previewClip?.playbackRate, compositionWidth, compositionHeight])

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

      {/* Quality selector removed */}

      {/* Always render player container to maintain playerRef */}
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
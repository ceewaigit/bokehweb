'use client'

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '@/remotion/compositions/MainComposition'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Recording, Effect } from '@/types/project'
import { timelineToSource, sourceToClipRelative } from '@/lib/timeline/time-space-converter'

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
  low: { maxWidth: 854, maxHeight: 480, label: '480p' },
  medium: { maxWidth: 1280, maxHeight: 720, label: '720p' },
  high: { maxWidth: 1920, maxHeight: 1080, label: '1080p' },
  auto: { maxWidth: 1280, maxHeight: 720, label: 'Auto' }
}

export function PreviewAreaRemotion({
  playheadClip,
  playheadRecording,
  currentTime,
  isPlaying,
  localEffects
}: PreviewAreaRemotionProps) {
  const playerRef = useRef<PlayerRef>(null)
  // Video state - using single state object for atomic updates to prevent flickering
  const [videoState, setVideoState] = useState<{
    url: string | null
    clip: Clip | null
    recording: Recording | null
  }>({ url: null, clip: null, recording: null })
  
  const DEFAULT_PREVIEW_QUALITY: PreviewQuality = 'auto'
  
  const nextClip = useProjectStore(state => state.nextClip)
  const nextRecording = useProjectStore(state => state.nextRecording)
  
  // Helper: compute recording-seconds from global timeline time and current clip
  // Remotion composition duration is in source space, so we seek to source time
  const getRecordingSeconds = useCallback((clip: Clip, nowMs: number) => {
    // Convert timeline position to source time using centralized converter
    const sourceMs = timelineToSource(nowMs, clip)
    return sourceMs / 1000
  }, [])
  
  // Handle clip transitions
  useEffect(() => {
    if (playheadClip && playheadRecording) {
      const recordingChanged = !videoState.recording || videoState.recording.id !== playheadRecording.id
      let cancelNextUpdate = false

      if (recordingChanged) {
        const cachedUrl = RecordingStorage.getBlobUrl(playheadRecording.id)

        if (cachedUrl) {
          // Atomic update - all three values change together
          setVideoState({
            url: cachedUrl,
            clip: playheadClip,
            recording: playheadRecording
          })
        } else if (playheadRecording.filePath) {
          globalBlobManager.ensureVideoLoaded(
            playheadRecording.id,
            playheadRecording.filePath,
            playheadRecording.folderPath
          ).then((url) => {
            if (cancelNextUpdate) return

            const finalUrl = url || `video-stream://local/${encodeURIComponent(playheadRecording.filePath)}`
            // Atomic update - all three values change together
            setVideoState({
              url: finalUrl,
              clip: playheadClip,
              recording: playheadRecording
            })
          }).catch(() => {
            if (cancelNextUpdate || !playheadRecording.filePath) return
            const encodedPath = encodeURIComponent(playheadRecording.filePath)
            // Atomic update - all three values change together
            setVideoState({
              url: `video-stream://local/${encodedPath}`,
              clip: playheadClip,
              recording: playheadRecording
            })
          })
        }
      } else {
        // Recording didn't change, but clip or recording object might have been updated
        // Update atomically to keep consistency
        setVideoState({
          url: videoState.url,
          clip: playheadClip,
          recording: playheadRecording
        })
      }

      return () => {
        cancelNextUpdate = true
      }
    }
  }, [
    playheadClip,
    playheadRecording,
    videoState.recording?.id
  ])
  
  // Preload next recording if different
  useEffect(() => {
    if (nextClip && nextRecording && videoState.recording) {
      if (nextRecording.id !== videoState.recording.id) {
        const existingUrl = RecordingStorage.getBlobUrl(nextRecording.id)
        if (!existingUrl && nextRecording.filePath) {
          globalBlobManager.ensureVideoLoaded(
            nextRecording.id,
            nextRecording.filePath,
            nextRecording.folderPath
          ).catch(() => {})
        }
      }
    }
  }, [nextClip?.id, nextRecording?.id, nextRecording?.filePath, nextRecording?.folderPath, videoState.recording?.id])
  
  const previewClip = playheadClip || videoState.clip
  const previewRecording = playheadRecording || videoState.recording

  const isNextClipSplit = useMemo(() => {
    if (!nextClip || !nextRecording || !videoState.recording) return false
    return nextRecording.id === videoState.recording.id
  }, [nextClip, nextRecording?.id, videoState.recording?.id])

  // Sync playback state
  useEffect(() => {
    if (!playerRef.current) return;
    if (isPlaying && previewClip && previewRecording) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [isPlaying, previewClip, previewRecording]);

  // Sync frame to store time - ONLY when paused
  // Let Remotion Player handle its own playback timing when playing
  useEffect(() => {
    if (!playerRef.current) return;

    // CRITICAL: Don't seek during playback - let Player control its own timing
    // Only seek when paused or when clip/url changes
    if (isPlaying) return;

    if (!previewClip || !videoState.url) {
      playerRef.current.seekTo(0);
      return;
    }

    const recSeconds = getRecordingSeconds(previewClip, currentTime)
    const frameRate = 30
    const targetFrame = Math.floor(recSeconds * frameRate)
    playerRef.current.seekTo(targetFrame);
  }, [currentTime, previewClip, videoState.url, isPlaying, getRecordingSeconds])

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

  const videoWidth = previewRecording?.width || 1920
  const videoHeight = previewRecording?.height || 1080

  const project = useProjectStore(state => state.currentProject)
  const timelineEffects = project?.timeline.effects

  // Build recording-time event streams (pass ALL events, no filtering)
  // Effects are recording-scoped, so metadata must also be recording-scoped
  const adjustedEvents = useMemo(() => {
    const recordingMeta: any = previewRecording?.metadata || {}

    // Pass all events unfiltered - let effects access full recording timeline
    return {
      mouseEvents: recordingMeta.mouseEvents || [],
      clickEvents: recordingMeta.clickEvents || [],
      scrollEvents: recordingMeta.scrollEvents || [],
      keyboardEvents: recordingMeta.keyboardEvents || []
    }
  }, [previewRecording?.metadata, previewClip?.id])

  // Get effects from both recording (source space) and timeline (global effects)
  const activeEffects = useMemo(() => {
    // Get recording effects (zoom, etc. in source space)
    const recordingEffects = previewRecording?.effects || []

    // Filter recording effects to only those that overlap with clip's source range
    const clipSourceIn = previewClip?.sourceIn || 0
    const clipSourceOut = previewClip?.sourceOut || Infinity

    const clipScopedEffects = recordingEffects.filter(effect =>
      effect.startTime < clipSourceOut && effect.endTime > clipSourceIn
    )

    // Get global timeline effects (background, cursor, keystroke)
    const globalEffects = timelineEffects || []

    // Merge with local effect overrides
    let mergedEffects: Effect[] = [...clipScopedEffects, ...globalEffects]

    if (localEffects) {
      const byId = new Map<string, Effect>(mergedEffects.map(e => [e.id, e]))
      for (const le of localEffects) {
        const existing = byId.get(le.id)
        if (existing) {
          byId.set(le.id, { ...existing, data: { ...(existing as any).data, ...(le as any).data } as any, enabled: le.enabled ?? existing.enabled } as Effect)
        } else {
          byId.set(le.id, le)
        }
      }
      mergedEffects = Array.from(byId.values())
    }

    return mergedEffects
  }, [previewRecording?.effects, previewClip?.sourceIn, previewClip?.sourceOut, timelineEffects, localEffects])

  const compositionProps = useMemo(() => {
    return {
      videoUrl: videoState.url || '',
      clip: previewClip,
      nextClip: nextClip || undefined,
      effects: activeEffects,
      cursorEvents: adjustedEvents.mouseEvents,
      clickEvents: adjustedEvents.clickEvents,
      keystrokeEvents: adjustedEvents.keyboardEvents,
      scrollEvents: adjustedEvents.scrollEvents,
      videoWidth,
      videoHeight,
      isSplitTransition: isNextClipSplit
    }
  }, [previewClip, nextClip, videoState.url, activeEffects, adjustedEvents, videoWidth, videoHeight, isNextClipSplit])

  const calculateOptimalCompositionSize = useCallback(() => {
    const preset = QUALITY_PRESETS[DEFAULT_PREVIEW_QUALITY]
    const videoAspectRatio = videoWidth / videoHeight

    const scaleByWidth = preset.maxWidth / videoWidth
    const scaleByHeight = preset.maxHeight / videoHeight
    const scale = Math.min(scaleByWidth, scaleByHeight)

    let compositionWidth = Math.max(320, Math.round(videoWidth * scale))
    let compositionHeight = Math.max(180, Math.round(videoHeight * scale))

    if (Math.abs(compositionWidth / compositionHeight - videoAspectRatio) > 0.001) {
      compositionHeight = Math.round(compositionWidth / videoAspectRatio)
    }

    compositionWidth = Math.floor(compositionWidth / 2) * 2
    compositionHeight = Math.floor(compositionHeight / 2) * 2

    return { compositionWidth, compositionHeight }
  }, [videoWidth, videoHeight])
  
  const { compositionWidth, compositionHeight } = calculateOptimalCompositionSize()

  const durationInFrames = useMemo(() => {
    if (previewRecording) {
      return Math.ceil((previewRecording.duration / 1000) * 30)
    }
    if (previewClip) {
      return Math.ceil((previewClip.duration / 1000) * 30)
    }
    return 900
  }, [previewRecording?.duration, previewClip?.duration]);

  // Compute initial frame at mount to avoid first-frame flash
  const initialFrame = useMemo(() => {
    if (previewClip) {
      const recSeconds = getRecordingSeconds(previewClip, currentTime)
      return Math.floor(recSeconds * 30)
    }
    return 0
  }, [previewClip?.id, videoState.recording?.id])

  const playerKey = useMemo(() => {
    const recordingId = videoState.recording?.id || 'none'
    return `${recordingId}`
  }, [videoState.recording?.id])

  if (!previewClip || !previewRecording || !videoState.url) {
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
        <div className="relative w-full h-full flex items-center justify-center">
          <Player
            key={playerKey}
            ref={playerRef}
            component={MainComposition as any}
            inputProps={compositionProps}
            durationInFrames={durationInFrames || 900}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            fps={30}
            initialFrame={initialFrame}
            style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
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

'use client'

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '@/remotion/compositions/MainComposition'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Recording, Effect } from '@/types/project'
import { EffectType } from '@/types/project'

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
  
  // Video state
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null)
  const [activeClip, setActiveClip] = useState<Clip | null>(null)
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null)
  
  const DEFAULT_PREVIEW_QUALITY: PreviewQuality = 'auto'
  
  const nextClip = useProjectStore(state => state.nextClip)
  const nextRecording = useProjectStore(state => state.nextRecording)
  const allTracks = useProjectStore(state => state.currentProject?.timeline.tracks)
  
  // Helper: compute recording-seconds from global timeline time and current clip
  const getRecordingSeconds = useCallback((clip: Clip, nowMs: number) => {
    const clipStart = clip.startTime
    const elapsedMs = Math.max(0, nowMs - clipStart)
    const sourceInMs = clip.sourceIn || 0
    
    // If clip has time remap periods, use them
    if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
      // Calculate remapped source time
      let currentSourceTime = sourceInMs
      let remainingElapsed = elapsedMs
      const playbackRate = clip.playbackRate || 1
      
      for (const period of clip.timeRemapPeriods) {
        const periodDuration = period.sourceEndTime - period.sourceStartTime
        const periodPlaybackDuration = periodDuration / period.speedMultiplier
        
        // If we're before this period starts
        if (currentSourceTime < period.sourceStartTime) {
          const gapDuration = period.sourceStartTime - currentSourceTime
          const gapPlaybackDuration = gapDuration / playbackRate
          
          if (remainingElapsed <= gapPlaybackDuration) {
            // We're in the gap before this period
            return (currentSourceTime + remainingElapsed * playbackRate) / 1000
          }
          
          remainingElapsed -= gapPlaybackDuration
          currentSourceTime = period.sourceStartTime
        }
        
        // If we're within this period
        if (currentSourceTime >= period.sourceStartTime && currentSourceTime < period.sourceEndTime) {
          const remainingInPeriod = period.sourceEndTime - currentSourceTime
          const remainingPlaybackInPeriod = remainingInPeriod / period.speedMultiplier
          
          if (remainingElapsed <= remainingPlaybackInPeriod) {
            // We end within this period
            return (currentSourceTime + remainingElapsed * period.speedMultiplier) / 1000
          }
          
          remainingElapsed -= remainingPlaybackInPeriod
          currentSourceTime = period.sourceEndTime
        }
      }
      
      // Any remaining time after all periods plays at normal rate
      return (currentSourceTime + remainingElapsed * playbackRate) / 1000
    }
    
    // Otherwise use simple calculation with playback rate
    const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
    return (sourceInMs / 1000) + (elapsedMs / 1000) * rate
  }, [])
  
  // Handle clip transitions
  useEffect(() => {
    if (playheadClip && playheadRecording) {
      const recordingChanged = !activeRecording || activeRecording.id !== playheadRecording.id
      if (recordingChanged) {
        let url = RecordingStorage.getBlobUrl(playheadRecording.id)
        
        if (url) {
          setActiveVideoUrl(url)
        } else if (playheadRecording.filePath) {
          // Use video-stream:// URL for consistency
          const encodedPath = encodeURIComponent(playheadRecording.filePath)
          const videoStreamUrl = `video-stream://local/${encodedPath}`
          setActiveVideoUrl(videoStreamUrl)
        }
        setActiveRecording(playheadRecording)
      }
      setActiveClip(playheadClip)
    }
  }, [playheadClip?.id, playheadRecording?.id])
  
  // Preload next recording if different
  useEffect(() => {
    if (nextClip && nextRecording && activeRecording) {
      if (nextRecording.id !== activeRecording.id) {
        const existingUrl = RecordingStorage.getBlobUrl(nextRecording.id)
        if (!existingUrl && nextRecording.filePath) {
          globalBlobManager.ensureVideoLoaded(nextRecording.id, nextRecording.filePath).catch(() => {})
        }
      }
    }
  }, [nextClip?.id, nextRecording?.id, activeRecording?.id])
  
  const previewClip = playheadClip || activeClip
  const previewRecording = playheadRecording || activeRecording

  const isNextClipSplit = useMemo(() => {
    if (!nextClip || !nextRecording || !activeRecording) return false
    return nextRecording.id === activeRecording.id
  }, [nextClip, nextRecording?.id, activeRecording?.id])

  // Sync playback state
  useEffect(() => {
    if (!playerRef.current) return;
    if (isPlaying && previewClip && previewRecording) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [isPlaying, previewClip, previewRecording]);

  // Sync frame to store time to avoid dynamic startFrom flicker
  useEffect(() => {
    if (!playerRef.current) return;
    if (!previewClip || !activeVideoUrl) {
      playerRef.current.seekTo(0);
      return;
    }
    const recSeconds = getRecordingSeconds(previewClip, currentTime)
    const frameRate = 30
    const targetFrame = Math.floor(recSeconds * frameRate)
    playerRef.current.seekTo(targetFrame);
  }, [currentTime, previewClip, activeVideoUrl, getRecordingSeconds]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (!previewClip || !activeVideoUrl) return;
    // Seek once when the clip changes to align to the new source offset
    const recSeconds = getRecordingSeconds(previewClip, currentTime)
    const frameRate = 30
    const targetFrame = Math.floor(recSeconds * frameRate)
    playerRef.current.seekTo(targetFrame)
  }, [previewClip?.id, activeVideoUrl])

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

  const timelineEffects = useProjectStore(state => state.currentProject?.timeline.effects)

  // Build recording-time event streams (filtered to clip window)
  const adjustedEvents = useMemo(() => {
    const recordingMeta: any = previewRecording?.metadata || {}
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

    const within = (ts: number) => ts >= sourceIn && ts <= sourceOut

    const mouseEvents = (recordingMeta.mouseEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({ ...e, timestamp: e.timestamp }))
    const clickEvents = (recordingMeta.clickEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({ ...e, timestamp: e.timestamp }))
    const scrollEvents = (recordingMeta.scrollEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({ ...e, timestamp: e.timestamp }))
    const keyboardEvents = (recordingMeta.keyboardEvents || []).filter((e: any) => within(e.timestamp)).map((e: any) => ({ ...e, timestamp: e.timestamp }))

    return { mouseEvents, clickEvents, scrollEvents, keyboardEvents }
  }, [previewClip, previewRecording?.metadata])

  // Convert effects to recording-time windows; keep background persistent
  const clipRelativeEffects = useMemo(() => {
    if (!previewClip) return null

    const clipStart = previewClip.startTime
    const clipEnd = previewClip.startTime + previewClip.duration
    const rate = previewClip.playbackRate && previewClip.playbackRate > 0 ? previewClip.playbackRate : 1
    const sourceIn = previewClip.sourceIn || 0

    const EPS = 1 // ms

    const baseEffects: Effect[] = (timelineEffects || []) as Effect[]

    let mergedEffects: Effect[] = baseEffects

    if (localEffects) {
      const byId = new Map<string, Effect>(baseEffects.map(e => [e.id, e]))
      for (const le of localEffects) {
        const existing = byId.get(le.id)
        if (existing) {
          byId.set(le.id, { ...existing, startTime: existing.startTime, endTime: existing.endTime, data: { ...(existing as any).data, ...(le as any).data } as any, enabled: le.enabled ?? existing.enabled } as Effect)
        } else {
          byId.set(le.id, le)
        }
      }
      mergedEffects = Array.from(byId.values())
    }

    const effectsToConvert = mergedEffects.filter(effect => effect.enabled)

    // Collect all clips for this recording to compute continuous rec window
    const recordingClips: Array<any> = (allTracks || []).flatMap((t: any) => t.clips || []).filter((c: any) => c.recordingId === previewRecording?.id)

    return effectsToConvert.map(effect => {
      if (effect.type === EffectType.Background) {
        return { ...effect, startTime: 0, endTime: Number.MAX_SAFE_INTEGER }
      }

      // For zoom/screen, compute a continuous recording-time window across all overlapping clips of this recording
      if (effect.type === EffectType.Zoom || effect.type === EffectType.Screen) {
        let segRecStarts: number[] = []
        let segRecEnds: number[] = []
        for (const c of recordingClips) {
          const cRate = c.playbackRate && c.playbackRate > 0 ? c.playbackRate : 1
          const cStart = c.startTime
          const cEnd = c.startTime + c.duration
          const overlapStart = Math.max(effect.startTime, cStart)
          const overlapEnd = Math.min(effect.endTime, cEnd)
          if (overlapEnd > overlapStart) {
            const recStartSeg = (c.sourceIn || 0) + (overlapStart - cStart) * cRate
            const recEndSeg = (c.sourceIn || 0) + (overlapEnd - cStart) * cRate
            segRecStarts.push(recStartSeg)
            segRecEnds.push(recEndSeg)
          }
        }
        if (segRecStarts.length > 0) {
          const recStart = Math.max(0, Math.min(...segRecStarts) - EPS)
          const recEnd = Math.max(...segRecEnds) + EPS
          return { ...effect, startTime: recStart, endTime: recEnd }
        }
        // No overlap with this recording; drop
        return { ...effect, startTime: Number.MAX_SAFE_INTEGER - 1, endTime: Number.MAX_SAFE_INTEGER }
      }

      // For other effects (annotations, cursor, keystroke), project current clip window to recording time
      const windowStart = Math.max(effect.startTime, clipStart)
      const windowEnd = Math.min(effect.endTime, clipEnd)
      const recStart = Math.max(0, sourceIn + (windowStart - clipStart) * rate - EPS)
      const recEnd = sourceIn + (windowEnd - clipStart) * rate + EPS
      return { ...effect, startTime: recStart, endTime: recEnd }
    })
  }, [previewClip, previewRecording?.id, localEffects, timelineEffects, allTracks])

  const compositionProps = useMemo(() => {
    return {
      videoUrl: activeVideoUrl || '',
      clip: previewClip,
      nextClip: nextClip || undefined,
      effects: clipRelativeEffects,
      cursorEvents: adjustedEvents.mouseEvents,
      clickEvents: adjustedEvents.clickEvents,
      keystrokeEvents: adjustedEvents.keyboardEvents,
      scrollEvents: adjustedEvents.scrollEvents,
      videoWidth,
      videoHeight,
      isSplitTransition: isNextClipSplit
    }
  }, [previewClip, nextClip, activeVideoUrl, clipRelativeEffects, adjustedEvents, videoWidth, videoHeight, isNextClipSplit])

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
  }, [previewClip?.id, activeRecording?.id])

  const playerKey = useMemo(() => {
    const recordingId = activeRecording?.id || 'none'
    return `${recordingId}`
  }, [activeRecording?.id])

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
import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Group, Rect, Text, Image } from 'react-konva'
import Konva from 'konva'
import type { Clip, Recording } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-converter'
import { ClipPositioning } from '@/lib/timeline/clip-positioning'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { useTimelineColors } from '@/lib/timeline/colors'
import { WaveformAnalyzer, type WaveformData } from '@/lib/audio/waveform-analyzer'
import { EffectLayerType } from '@/types/effects'
import { TypingDetector, type TypingSuggestions, type TypingPeriod } from '@/lib/timeline/typing-detector'
import { TypingSuggestionsBar } from './typing-suggestions-bar'

import { useProjectStore } from '@/stores/project-store'
import { mapRecordingToClipTime } from '@/lib/timeline/clip-utils'
import { ApplyTypingSpeedCommand } from '@/lib/commands'
import { DefaultCommandContext } from '@/lib/commands'

interface TimelineClipProps {
  clip: Clip
  recording?: Recording | null
  trackType: 'video' | 'audio'
  trackY: number
  trackHeight: number
  pixelsPerMs: number
  isSelected: boolean
  selectedEffectType?: EffectLayerType.Zoom | EffectLayerType.Cursor | EffectLayerType.Background | null
  otherClipsInTrack?: Clip[]
  clipEffects?: any[]  // Effects for this clip from timeline.effects
  commandManager?: any  // Command manager for undo/redo
  onSelect: (clipId: string) => void
  onSelectEffect?: (type: EffectLayerType) => void
  onDragEnd: (clipId: string, newStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
  onOpenTypingSuggestion?: (opts: {
    x: number
    y: number
    period: TypingPeriod
    allPeriods: TypingPeriod[]
    onApply: (p: TypingPeriod) => Promise<void>
    onApplyAll: (ps: TypingPeriod[]) => Promise<void>
    onRemove: (p: TypingPeriod) => void
  }) => void
}

export const TimelineClip = React.memo(({
  clip,
  recording,
  trackType,
  trackY,
  trackHeight,
  pixelsPerMs,
  isSelected,
  selectedEffectType,
  otherClipsInTrack = [],
  clipEffects = [],
  commandManager,
  onSelect,
  onSelectEffect,
  onDragEnd,
  onContextMenu,
  onOpenTypingSuggestion
}: TimelineClipProps) => {
  const [thumbnails, setThumbnails] = useState<HTMLCanvasElement[]>([])
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isValidPosition, setIsValidPosition] = useState(true)
  const [originalPosition, setOriginalPosition] = useState<number>(0)
  const [typingSuggestions, setTypingSuggestions] = useState<TypingSuggestions | null>(null)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const colors = useTimelineColors()
  const { settings } = useProjectStore()

  const clipX = TimeConverter.msToPixels(clip.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TimelineConfig.MIN_CLIP_WIDTH,
    TimeConverter.msToPixels(clip.duration, pixelsPerMs)
  )

  const dismissPeriod = (period: TypingPeriod) => {
    const key = `${period.startTime}-${period.endTime}`
    setDismissedSuggestions(prev => new Set([...prev, key]))
  }

  const dismissPeriods = (periods: TypingPeriod[]) => {
    if (!periods?.length) return
    const keys = periods.map(p => `${p.startTime}-${p.endTime}`)
    setDismissedSuggestions(prev => new Set([...prev, ...keys]))
  }

  // Track height is now passed as a prop

  // Load audio waveform data
  useEffect(() => {
    if (!recording?.hasAudio || !recording?.filePath) return

    const loadWaveform = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (!blobUrl && recording.filePath) {
          blobUrl = await globalBlobManager.ensureVideoLoaded(recording.id, recording.filePath)
        }

        if (!blobUrl) return

        // Analyze audio and extract waveform
        const waveform = await WaveformAnalyzer.analyzeAudio(
          blobUrl,
          clip.id,
          clip.sourceIn,
          clip.sourceOut - clip.sourceIn,
          50 // Samples per second for smooth visualization
        )

        if (waveform) {
          setWaveformData(waveform)
        }
      } catch (error) {
        console.warn('Failed to load waveform:', error)
      }
    }

    loadWaveform()
  }, [recording?.id, recording?.filePath, recording?.hasAudio, clip.id, clip.sourceIn, clip.sourceOut])

  // Analyze typing patterns for speed-up suggestions
  useEffect(() => {
    if (!recording?.metadata?.keyboardEvents || recording.metadata.keyboardEvents.length === 0) {
      setTypingSuggestions(null)
      return
    }

    try {
      // Analyze keyboard events for typing patterns
      const suggestions = TypingDetector.analyzeTyping(recording.metadata.keyboardEvents)
      // Preserve dismissed suggestions when re-analyzing
      setTypingSuggestions(current => {
        if (!current) return suggestions
        // Keep the same dismissed set, just update the periods
        return suggestions
      })
    } catch (error) {
      console.warn('Failed to analyze typing patterns:', error)
      setTypingSuggestions(null)
    }
  }, [recording?.metadata?.keyboardEvents]) // Note: dismissedSuggestions intentionally not in deps

  // Load video and generate thumbnails for video clips
  useEffect(() => {
    if (trackType !== 'video' || !recording?.filePath) return

    const loadVideoThumbnails = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (!blobUrl && recording.filePath) {
          blobUrl = await globalBlobManager.ensureVideoLoaded(recording.id, recording.filePath)
        }

        if (!blobUrl) return

        // Create video element
        const video = document.createElement('video')
        video.src = blobUrl
        video.crossOrigin = 'anonymous'
        video.muted = true

        // Wait for metadata
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve
          video.onerror = reject
          video.load()
        })

        videoRef.current = video

        // Calculate thumbnail dimensions
        const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
        const aspectRatio = video.videoWidth / video.videoHeight
        const thumbWidth = Math.floor(thumbHeight * aspectRatio)

        // Calculate how many thumbnails we need based on clip width
        const thumbnailCount = Math.max(1, Math.ceil(clipWidth / thumbWidth))
        const newThumbnails: HTMLCanvasElement[] = []

        // Generate frames at different timestamps
        for (let i = 0; i < thumbnailCount; i++) {
          // Calculate which frame to show based on position in clip
          const progress = i / Math.max(1, thumbnailCount - 1)
          const timeInSeconds = (clip.sourceIn + progress * (clip.sourceOut - clip.sourceIn)) / 1000

          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          canvas.width = thumbWidth
          canvas.height = thumbHeight

          // Seek to the specific time and draw frame
          await new Promise<void>((resolve) => {
            const seekHandler = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              video.removeEventListener('seeked', seekHandler)
              resolve()
            }
            video.addEventListener('seeked', seekHandler)
            video.currentTime = timeInSeconds
          })

          newThumbnails.push(canvas)
        }

        setThumbnails(newThumbnails)
      } catch (error) {
        // Failed to load thumbnails - will show placeholder
      }
    }

    loadVideoThumbnails()

    return () => {
      if (videoRef.current) {
        videoRef.current.src = ''
        videoRef.current = null
      }
    }
  }, [recording?.id, recording?.filePath, clip.duration, clipWidth, trackHeight, trackType])

  // Calculate minimum allowed position (right of leftmost clip)
  const minAllowedTime = ClipPositioning.getLeftmostClipEnd(otherClipsInTrack, clip.id)

  // Handle applying typing speed suggestions
  const handleApplyTypingSuggestion = async (period: TypingPeriod) => {
    try {
      const store = useProjectStore.getState()
      const context = new DefaultCommandContext(store)
      const command = new ApplyTypingSpeedCommand(context, clip.id, [period], false)
      const result = await command.execute()

      if (result.success) {
        // Dismiss the suggestion visually after successful application
        dismissPeriod(period)
        // Store command for undo/redo
        if (commandManager) {
          commandManager.addToHistory(command)
        }
      } else {
        console.error('Failed to apply typing speed suggestion:', result.error)
      }
    } catch (error) {
      console.error('Failed to apply typing speed suggestion:', error)
    }
  }

  const handleApplyAllTypingSuggestions = async (periods: TypingPeriod[]) => {
    if (!periods?.length) return
    try {
      const store = useProjectStore.getState()
      const context = new DefaultCommandContext(store)
      const command = new ApplyTypingSpeedCommand(context, clip.id, periods, true)
      const result = await command.execute()

      if (result.success) {
        // Dismiss all suggestions visually after successful application
        dismissPeriods(periods)
        // Store command for undo/redo
        if (commandManager) {
          commandManager.addToHistory(command)
        }
      } else {
        console.error('Failed to apply all typing suggestions:', result.error)
      }
    } catch (error) {
      console.error('Failed to apply all typing suggestions:', error)
    }
  }

  const handleRemoveTypingSuggestion = (period: TypingPeriod) => {
    dismissPeriod(period)
  }

  return (
    <Group
      x={clipX}
      y={trackY + TimelineConfig.TRACK_PADDING}
      draggable
      dragBoundFunc={() => {
        // Force clip to snap directly to the right of the leftmost clip
        // This ensures no gaps in the timeline

        // The only valid position is immediately after the leftmost clip
        const finalTime = minAllowedTime

        // Convert to pixels for final position
        const finalX = TimeConverter.msToPixels(finalTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

        // Always valid since we're forcing to the only allowed position
        setIsValidPosition(true)

        return {
          x: finalX,
          y: trackY + TimelineConfig.TRACK_PADDING
        }
      }}
      onDragStart={() => {
        setIsDragging(true)
        setOriginalPosition(clip.startTime)
        setIsValidPosition(true)
      }}
      onDragEnd={(e) => {
        setIsDragging(false)

        // Always snap to the position right after the leftmost clip
        const finalTime = minAllowedTime

        // Check if this position would cause overlap (shouldn't happen but safety check)
        const overlapCheck = ClipPositioning.checkOverlap(
          finalTime,
          clip.duration,
          otherClipsInTrack,
          clip.id
        )

        if (overlapCheck.hasOverlap) {
          // If there's an overlap, return to original position
          const originalX = TimeConverter.msToPixels(originalPosition, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
          e.target.to({
            x: originalX,
            duration: 0.2,
            easing: Konva.Easings.EaseOut
          })
          setIsValidPosition(true)
          return
        }

        // Update clip position to be right after leftmost clip
        onDragEnd(clip.id, finalTime)
      }}
      onClick={() => {
        // Simple click handler - just select the clip
        // Suggestion bars will handle their own clicks and stop propagation
        onSelect(clip.id)
      }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }
      }}
      opacity={isDragging ? (isValidPosition ? 0.8 : 0.5) : 1}
    >
      {/* Clip background with rounded corners */}
      <Rect
        width={clipWidth}
        height={trackHeight - TimelineConfig.TRACK_PADDING * 2}
        fill={
          trackType === 'video' && thumbnails.length > 0
            ? 'transparent'
            : trackType === 'video'
              ? colors.info
              : colors.success
        }
        stroke={
          isDragging && !isValidPosition
            ? '#ef4444' // red-500 for invalid
            : isSelected
              ? colors.foreground
              : 'transparent'
        }
        strokeWidth={isDragging && !isValidPosition ? 3 : isSelected ? 2 : 1}
        cornerRadius={6}
        opacity={0.95}
        shadowColor={isDragging && !isValidPosition ? '#ef4444' : "black"}
        shadowBlur={isDragging && !isValidPosition ? 15 : isSelected ? 10 : 4}
        shadowOpacity={isDragging && !isValidPosition ? 0.5 : 0.3}
        shadowOffsetY={2}
      />

      {/* Video thumbnails */}
      {trackType === 'video' && thumbnails.length > 0 && (
        <Group clipFunc={(ctx) => {
          // Clip to rounded rectangle
          ctx.beginPath()
          ctx.roundRect(0, 0, clipWidth, trackHeight - TimelineConfig.TRACK_PADDING * 2, 6)
          ctx.closePath()
        }}>
          {/* Render each thumbnail frame */}
          {thumbnails.map((canvas, i) => {
            const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const aspectRatio = canvas.width / canvas.height
            const thumbWidth = Math.floor(thumbHeight * aspectRatio)

            return (
              <Image
                key={i}
                image={canvas}
                x={i * thumbWidth}
                y={0}
                width={thumbWidth}
                height={thumbHeight}
                opacity={0.95}
              />
            )
          })}
          {/* Gradient overlay for text visibility */}
          <Rect
            width={clipWidth}
            height={24}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: 24 }}
            fillLinearGradientColorStops={[
              0, 'rgba(0,0,0,0.6)',
              1, 'rgba(0,0,0,0)'
            ]}
          />
        </Group>
      )}

      {/* Audio waveform visualization for clips with audio */}
      {trackType === 'video' && recording?.hasAudio && (
        <Group
          y={trackHeight / 2}
          opacity={0.7}
          clipFunc={(ctx) => {
            // Clip to the bounds of the clip for clean edges
            ctx.beginPath()
            ctx.rect(0, -trackHeight / 2 + 4, clipWidth, trackHeight - 8)
            ctx.closePath()
          }}
        >
          {/* Generate waveform bars from real audio data or fallback */}
          {(() => {
            const barWidth = 2
            const barGap = 2
            const barCount = Math.floor(clipWidth / (barWidth + barGap))

            // Use real waveform data if available, otherwise use a simple pattern
            const peaks = waveformData
              ? WaveformAnalyzer.resamplePeaks(waveformData.peaks, clipWidth, barWidth, barGap)
              : Array.from({ length: barCount }, (_, i) => {
                // Fallback: simple sine wave pattern if no real data yet
                const progress = i / Math.max(1, barCount - 1)
                const envelope = Math.min(1, Math.min(progress * 10, (1 - progress) * 10))
                return Math.abs(Math.sin(i * 0.2)) * envelope * 0.7
              })

            return peaks.map((peak, i) => {
              const x = i * (barWidth + barGap) + 2
              const maxHeight = (trackHeight - 16) / 2
              const barHeight = Math.max(1, peak * maxHeight)

              // Only render bars that fit within the clip width
              if (x + barWidth > clipWidth) return null

              return (
                <Group key={i}>
                  {/* Main waveform bar - symmetrical */}
                  <Rect
                    x={x}
                    y={-barHeight}
                    width={barWidth}
                    height={barHeight * 2}
                    fill={colors.foreground}
                    opacity={0.25 + peak * 0.2}
                    cornerRadius={1}
                  />
                  {/* Highlight on peaks for depth */}
                  {peak > 0.7 && (
                    <Rect
                      x={x}
                      y={-barHeight * 0.9}
                      width={barWidth}
                      height={barHeight * 1.8}
                      fill={colors.foreground}
                      opacity={0.08}
                      cornerRadius={1}
                    />
                  )}
                </Group>
              )
            }).filter(Boolean)
          })()}

          {/* Subtle center line */}
          <Rect
            x={0}
            y={-0.5}
            width={clipWidth}
            height={1}
            fill={colors.foreground}
            opacity={0.1}
          />
        </Group>
      )}

      {/* Clip ID label */}
      <Text
        x={8}
        y={8}
        text={`${clip.id.slice(-4)}`}
        fontSize={11}
        fill={colors.foreground}
        fontFamily="system-ui"
        fontStyle="bold"
        shadowColor="black"
        shadowBlur={3}
        shadowOpacity={0.8}
      />

      {/* Effect badges for video clips - clickable indicators */}
      {trackType === 'video' && (() => {
        const badges = []
        let xOffset = 0

        const handleBadgeClick = (e: any, type: EffectLayerType) => {
          e.cancelBubble = true
          onSelect(clip.id)
          onSelectEffect?.(type)
        }

        const hasZoomEffect = clipEffects.some(e => e.type === 'zoom' && e.enabled)
        if (hasZoomEffect) {
          badges.push(
            <Group
              key="zoom"
              x={xOffset}
              y={0}
              onClick={(e) => handleBadgeClick(e, EffectLayerType.Zoom)}
              onTap={(e) => handleBadgeClick(e, EffectLayerType.Zoom)}
            >
              <Rect
                width={32}
                height={14}
                fill={selectedEffectType === EffectLayerType.Zoom ? colors.info : colors.muted}
                cornerRadius={2}
                opacity={selectedEffectType === EffectLayerType.Zoom ? 1 : 0.7}
              />
              <Text x={5} y={3} text="Z" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }

        // Only show cursor badge when cursor is enabled
        const hasCursorEffect = clipEffects.some(e => e.type === 'cursor' && e.enabled)
        if (hasCursorEffect) {
          badges.push(
            <Group
              key="cursor"
              x={xOffset}
              y={0}
              onClick={(e) => handleBadgeClick(e, EffectLayerType.Cursor)}
              onTap={(e) => handleBadgeClick(e, EffectLayerType.Cursor)}
            >
              <Rect
                width={32}
                height={14}
                fill={selectedEffectType === EffectLayerType.Cursor ? colors.success : colors.muted}
                cornerRadius={2}
                opacity={selectedEffectType === EffectLayerType.Cursor ? 1 : 0.7}
              />
              <Text x={5} y={3} text="C" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }

        const backgroundEffect = clipEffects.find(e => e.type === 'background' && e.enabled)
        if (backgroundEffect?.data?.type && backgroundEffect.data.type !== 'none') {
          badges.push(
            <Group
              key="bg"
              x={xOffset}
              y={0}
              onClick={(e) => handleBadgeClick(e, EffectLayerType.Background)}
              onTap={(e) => handleBadgeClick(e, EffectLayerType.Background)}
            >
              <Rect
                width={32}
                height={14}
                fill={selectedEffectType === EffectLayerType.Background ? colors.zoomBlock : colors.muted}
                cornerRadius={2}
                opacity={selectedEffectType === EffectLayerType.Background ? 1 : 0.7}
              />
              <Text x={5} y={3} text="B" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }

        // Playback rate badge
        if (clip.playbackRate && clip.playbackRate !== 1.0) {
          badges.push(
            <Group
              key="speed"
              x={xOffset}
              y={0}
            >
              <Rect
                width={40}
                height={14}
                fill={colors.warning || '#f59e0b'}
                cornerRadius={2}
                opacity={0.8}
              />
              <Text
                x={3}
                y={3}
                text={`${clip.playbackRate.toFixed(clip.playbackRate === Math.floor(clip.playbackRate) ? 0 : 1)}x`}
                fontSize={8}
                fill={colors.foreground}
                fontFamily="system-ui"
                fontStyle="bold"
              />
            </Group>
          )
          xOffset += 44
        }

        // Audio badge is now optional since we have waveform visualization
        // Only show it if the clip is very small
        if (recording?.hasAudio && clipWidth < 100) {
          badges.push(
            <Group
              key="audio"
              x={xOffset}
              y={0}
            >
              <Rect
                width={20}
                height={14}
                fill={colors.success || '#10b981'}
                cornerRadius={2}
                opacity={0.7}
              />
              <Text x={5} y={3} text="♫" fontSize={9} fill={colors.foreground} fontFamily="system-ui" />
            </Group>
          )
          xOffset += 24
        }

        return badges.length > 0 ? <Group x={6} y={trackHeight - TimelineConfig.TRACK_PADDING * 2 - 20}>{badges}</Group> : null
      })()}

      {/* Typing suggestions bar - only show for video clips with typing detected and enabled in settings */}
      {trackType === 'video' && typingSuggestions && settings.showTypingSuggestions && (
        <TypingSuggestionsBar
          suggestions={{
            ...typingSuggestions,
            periods: typingSuggestions.periods.filter(p => !dismissedSuggestions.has(`${p.startTime}-${p.endTime}`))
          }}
          clipStartTime={clip.startTime}
          clipDuration={clip.duration}
          clipWidth={clipWidth}
          pixelsPerMs={pixelsPerMs}
          clip={clip}
          onApplySuggestion={handleApplyTypingSuggestion}
          onApplyAllSuggestions={handleApplyAllTypingSuggestions}
          onRemoveSuggestion={handleRemoveTypingSuggestion}
          onOpenTypingSuggestion={onOpenTypingSuggestion}
        />
      )}

    </Group>
  )
})
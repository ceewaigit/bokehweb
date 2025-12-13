import React, { useEffect, useState } from 'react'
import { Group, Rect, Text, Image } from 'react-konva'
import type { Clip, Recording } from '@/types/project'
import { TrackType } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { ClipReorderService } from '@/lib/timeline/clip-reorder-service'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { useTimelineColors } from '@/lib/timeline/colors'
import { WaveformAnalyzer, type WaveformData } from '@/lib/audio/waveform-analyzer'
import { EffectLayerType } from '@/types/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { TypingDetector, type TypingSuggestions, type TypingPeriod } from '@/lib/timeline/typing-detector'
import { TypingSuggestionsBar } from './typing-suggestions-bar'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'

import { useProjectStore } from '@/stores/project-store'
import { ApplyTypingSpeedCommand, ApplyTypingSpeedToAllClipsCommand } from '@/lib/commands'
import { DefaultCommandContext } from '@/lib/commands'
import { CommandManager } from '@/lib/commands'
import { toast } from 'sonner'

// No global tracking needed - metadata is the source of truth

interface TimelineClipProps {
  clip: Clip
  recording?: Recording | null
  trackType: TrackType.Video | TrackType.Audio
  trackY: number
  trackHeight: number
  pixelsPerMs: number
  isSelected: boolean
  selectedEffectType?: EffectLayerType.Zoom | EffectLayerType.Cursor | EffectLayerType.Background | null
  otherClipsInTrack?: Clip[]
  clipEffects?: any[]  // Effects for this clip from timeline.effects
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
    onApplyAll?: (ps: TypingPeriod[]) => Promise<void>
    onRemove?: (p: TypingPeriod) => void
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
  onSelect,
  onSelectEffect,
  onDragEnd,
  onContextMenu,
  onOpenTypingSuggestion
}: TimelineClipProps) => {
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null)
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isValidPosition, setIsValidPosition] = useState(true)
  const [originalPosition, setOriginalPosition] = useState<number>(0)
  const [typingSuggestions, setTypingSuggestions] = useState<TypingSuggestions | null>(null)
  const [cachedSnapPositions, setCachedSnapPositions] = useState<number[]>([])
  const colors = useTimelineColors()
  const { settings } = useProjectStore()

  const clipX = TimeConverter.msToPixels(clip.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TimelineConfig.MIN_CLIP_WIDTH,
    TimeConverter.msToPixels(clip.duration, pixelsPerMs)
  )

  // Track height is now passed as a prop

  // Load audio waveform data
  useEffect(() => {
    if (!recording?.hasAudio || !recording?.filePath) return

    const loadWaveform = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (!blobUrl && recording.filePath) {
          blobUrl = await globalBlobManager.loadVideos({
            id: recording.id,
            filePath: recording.filePath,
            folderPath: recording.folderPath
          })
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
  }, [recording?.id, recording?.filePath, recording?.folderPath, recording?.hasAudio, clip.id, clip.sourceIn, clip.sourceOut])

  // Analyze typing patterns for speed-up suggestions
  useEffect(() => {
    // Don't show suggestions if typing speed has already been applied
    if (clip.typingSpeedApplied) {
      setTypingSuggestions(null)
      return
    }

    if (!recording?.metadata?.keyboardEvents || recording.metadata.keyboardEvents.length === 0) {
      setTypingSuggestions(null)
      return
    }

    try {
      // Use cached typing analysis for better performance
      const suggestions = TypingDetector.analyzeTyping(recording)

      // Cache results if not already cached (through store to handle Immer frozen objects)
      if (suggestions.periods.length > 0 && !recording.metadata?.detectedTypingPeriods) {
        useProjectStore.getState().cacheTypingPeriods(recording.id, suggestions.periods)
      }

      // Only show suggestions for typing periods that fall within this clip's time range
      const clipStart = clip.sourceIn || 0
      const clipEnd = clip.sourceOut || (clipStart + clip.duration * (clip.playbackRate || 1))

      const relevantPeriods = suggestions.periods.filter(period => {
        // Check if this typing period overlaps with this clip's source range
        return period.startTime < clipEnd && period.endTime > clipStart
      })

      // Only show suggestions if we have relevant periods for this clip
      if (relevantPeriods.length > 0) {
        setTypingSuggestions({
          ...suggestions,
          periods: relevantPeriods
        })
      } else {
        setTypingSuggestions(null)
      }
    } catch (error) {
      console.warn('Failed to analyze typing patterns:', error)
      setTypingSuggestions(null)
    }
  }, [recording?.metadata?.keyboardEvents, clip.id, clip.sourceIn, clip.sourceOut, clip.duration, clip.playbackRate, clip.typingSpeedApplied])

  // Load single cached thumbnail for video clips - optimized for performance
  useEffect(() => {
    if (trackType !== 'video' || !recording?.filePath) return

    let cancelled = false

    const loadThumbnail = async () => {
      try {
        // Use ThumbnailGenerator for cached, efficient thumbnail generation
        const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
        const thumbWidth = Math.floor(thumbHeight * (16 / 9)) // Assume 16:9 aspect ratio

        // Cache key includes recording ID and source position to allow re-use
        const cacheKey = `${recording.id}_${clip.sourceIn}_${thumbWidth}x${thumbHeight}`

        const dataUrl = await ThumbnailGenerator.generateThumbnail(
          recording.filePath,
          cacheKey,
          {
            width: thumbWidth,
            height: thumbHeight,
            timestamp: clip.sourceIn / 1000 / (recording.duration || 1) // Convert to percentage
          }
        )

        if (cancelled || !dataUrl) return

        // Create image element from data URL
        const img = document.createElement('img')
        img.src = dataUrl
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = reject
        })

        if (!cancelled) {
          setThumbnail(img)
        }
      } catch (error) {
        // Failed to load thumbnail - will show placeholder
      }
    }

    loadThumbnail()

    return () => {
      cancelled = true
    }
  }, [recording?.id, recording?.filePath, clip.sourceIn, trackHeight, trackType, recording?.duration])


  // Handle applying typing speed suggestions
  const handleApplyTypingSuggestion = async (period: TypingPeriod) => {
    try {
      const store = useProjectStore.getState()
      const context = new DefaultCommandContext(store)
      const command = new ApplyTypingSpeedCommand(context, clip.id, [period])

      // Execute through command manager for undo/redo support
      const manager = CommandManager.getInstance(context)
      const result = await manager.execute(command)

      if (result.success) {
        setTypingSuggestions(null)
        toast.success('Applied typing suggestion')
      } else {
        console.error('[TimelineClip] Failed to apply typing speed suggestion:', result.error)
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to apply typing suggestion')
      }
    } catch (error: any) {
      console.error('[TimelineClip] Exception applying typing speed suggestion:', error)
      toast.error(error?.message || 'Failed to apply typing suggestion')
    }
  }

  const handleApplyAllTypingSuggestions = async (periods: TypingPeriod[]) => {
    if (!periods?.length) return

    try {
      // Apply typing speed to ALL clips in the timeline (not just this one)
      const store = useProjectStore.getState()
      const context = new DefaultCommandContext(store)
      const command = new ApplyTypingSpeedToAllClipsCommand(context, 'Apply typing speed-up to all clips')

      // Execute through command manager for undo/redo support
      const manager = CommandManager.getInstance(context)
      const result = await manager.execute(command)

      if (result.success) {
        const clipsProcessed = (command as ApplyTypingSpeedToAllClipsCommand).getClipsProcessed()
        setTypingSuggestions(null)
        toast.success(`Applied typing speed-up to ${clipsProcessed} clip${clipsProcessed !== 1 ? 's' : ''}`)
      } else {
        console.error('[TimelineClip] Failed to apply typing suggestions:', result.error)
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to apply typing suggestions')
      }
    } catch (error: any) {
      console.error('[TimelineClip] Exception applying all typing suggestions:', error)
      toast.error(error?.message || 'Failed to apply typing suggestions')
    }
  }

  const handleRemoveTypingSuggestion = (period: TypingPeriod) => {
    // Just hide this specific period from the UI
    setTypingSuggestions(current => {
      if (!current) return null
      const filteredPeriods = current.periods.filter(p =>
        !(p.startTime === period.startTime && p.endTime === period.endTime)
      )
      return filteredPeriods.length > 0 ? { ...current, periods: filteredPeriods } : null
    })
  }

  return (
    <Group
      x={clipX}
      y={trackY + TimelineConfig.TRACK_PADDING}
      draggable
      dragBoundFunc={(pos) => {
        // Convert drag position to time
        const proposedTime = TimeConverter.pixelsToMs(
          pos.x - TimelineConfig.TRACK_LABEL_WIDTH,
          pixelsPerMs
        )

        // Use cached snap positions (computed at drag start)
        const snapPositions = cachedSnapPositions.length > 0
          ? cachedSnapPositions
          : ClipReorderService.computeSnapPositions(otherClipsInTrack || [], clip.id)

        // Find nearest snap position using the service
        const { position: nearestSnap } = ClipReorderService.findNearestSnapPosition(
          proposedTime,
          snapPositions
        )

        setIsValidPosition(true)

        // Convert snapped time to pixels
        const snappedX = TimeConverter.msToPixels(nearestSnap, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

        return {
          x: snappedX,
          y: trackY + TimelineConfig.TRACK_PADDING
        }
      }}
      onDragStart={() => {
        setIsDragging(true)
        setOriginalPosition(clip.startTime)
        setIsValidPosition(true)
        // Cache snap positions at drag start for performance
        setCachedSnapPositions(
          ClipReorderService.computeSnapPositions(otherClipsInTrack || [], clip.id)
        )
      }}
      onDragEnd={(e) => {
        setIsDragging(false)

        // Get the final snapped position
        const finalX = e.target.x()
        const snappedTime = TimeConverter.pixelsToMs(
          finalX - TimelineConfig.TRACK_LABEL_WIDTH,
          pixelsPerMs
        )

        // Find which snap position we're at to determine insert index
        const { index: newIndex } = ClipReorderService.findNearestSnapPosition(
          snappedTime,
          cachedSnapPositions
        )

        // Check if reorder would change anything
        const allClips = (() => {
          if (!otherClipsInTrack || otherClipsInTrack.length === 0) return [clip]
          return otherClipsInTrack.some(c => c.id === clip.id)
            ? otherClipsInTrack
            : [...otherClipsInTrack, clip]
        })()
        if (ClipReorderService.wouldChangeOrder(allClips, clip.id, newIndex)) {
          useProjectStore.getState().reorderClip(clip.id, newIndex)
        }

        // Clear cached snap positions
        setCachedSnapPositions([])
        setIsValidPosition(true)
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
          trackType === TrackType.Video && thumbnail
            ? 'transparent'
            : trackType === TrackType.Video
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

      {/* Video thumbnail - single frame tiled across clip */}
      {trackType === TrackType.Video && thumbnail && (
        <Group clipFunc={(ctx) => {
          // Clip to rounded rectangle
          ctx.beginPath()
          ctx.roundRect(0, 0, clipWidth, trackHeight - TimelineConfig.TRACK_PADDING * 2, 6)
          ctx.closePath()
        }}>
          {/* Tile the single thumbnail across the clip width */}
          {(() => {
            const thumbHeight = trackHeight - TimelineConfig.TRACK_PADDING * 2
            const aspectRatio = thumbnail.width / thumbnail.height
            const thumbWidth = Math.floor(thumbHeight * aspectRatio)
            const tileCount = Math.max(1, Math.ceil(clipWidth / thumbWidth))

            return Array.from({ length: tileCount }, (_, i) => (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image
                key={i}
                image={thumbnail}
                x={i * thumbWidth}
                y={0}
                width={thumbWidth}
                height={thumbHeight}
                opacity={0.95}
              />
            ))
          })()}
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
      {trackType === TrackType.Video && recording?.hasAudio && (
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

      {/* Speed indicator badge - only shown when playback rate is modified */}
      {trackType === TrackType.Video && clip.playbackRate && clip.playbackRate !== 1.0 && (() => {
        const rateText = `${clip.playbackRate.toFixed(clip.playbackRate === Math.floor(clip.playbackRate) ? 0 : 1)}x`
        return (
          <Group x={6} y={trackHeight - TimelineConfig.TRACK_PADDING * 2 - 14}>
            <Rect
              width={22}
              height={10}
              fill={colors.warning || '#f59e0b'}
              cornerRadius={5}
              opacity={0.9}
            />
            <Text
              x={11}
              y={5}
              text={rateText}
              fontSize={7}
              fill={colors.foreground}
              fontFamily="system-ui"
              fontStyle="bold"
              align="center"
              offsetX={rateText.length * 2}
              offsetY={3}
            />
          </Group>
        )
      })()}

      {/* Typing suggestions bar - only show for video clips with typing detected and enabled in settings */}
      {trackType === TrackType.Video && typingSuggestions && settings.showTypingSuggestions && (
        <TypingSuggestionsBar
          suggestions={typingSuggestions}
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

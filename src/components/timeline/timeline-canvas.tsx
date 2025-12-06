'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Group, Text } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { cn, clamp } from '@/lib/utils'
import type { Project, ZoomBlock, ZoomEffectData, Effect } from '@/types/project'
import { EffectType, TrackType, TimelineTrackType } from '@/types/project'
import { EffectsFactory } from '@/lib/effects/effects-factory'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TypingSuggestionPopover } from './typing-suggestion-popover'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineEffectBlock } from './timeline-effect-block'
import { EffectLayerType, type SelectedEffectLayer } from '@/types/effects'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'

// Utilities
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useCommandKeyboard } from '@/hooks/use-command-keyboard'
import { useTimelinePlayback } from '@/hooks/use-timeline-playback'
import { useTimelineColors } from '@/lib/timeline/colors'

// Commands
import {
  CommandManager,
  DefaultCommandContext,
  UpdateClipCommand,
  RemoveClipCommand,
  SplitClipCommand,
  DuplicateClipCommand,
  TrimCommand,
  CopyCommand,
  ChangePlaybackRateCommand
} from '@/lib/commands'

interface TimelineCanvasProps {
  className?: string
  currentProject: Project | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onClipSelect: (clipId: string) => void
  onZoomChange: (zoom: number) => void
  onZoomBlockUpdate?: (blockId: string, updates: Partial<ZoomBlock>) => void
}

export function TimelineCanvas({
  className = "h-full w-full",
  currentProject,
  currentTime,
  isPlaying,
  zoom,
  onPlay,
  onPause,
  onSeek,
  onClipSelect,
  onZoomChange,
  onZoomBlockUpdate
}: TimelineCanvasProps) {
  const {
    selectedClips,
    selectedEffectLayer,
    selectClip,
    selectEffectLayer,
    clearEffectSelection,
    removeClip,
    updateClip,
    updateEffect,
    clearSelection,
    splitClip,
    duplicateClip
  } = useProjectStore()

  const [stageSize, setStageSize] = useState({ width: 800, height: 400 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)
  const [typingPopover, setTypingPopover] = useState<{
    x: number
    y: number
    period: TypingPeriod
    allPeriods: TypingPeriod[]
    onApply: (p: TypingPeriod) => Promise<void>
    onApplyAll?: (ps: TypingPeriod[]) => Promise<void>
    onRemove?: (p: TypingPeriod) => void
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const colors = useTimelineColors()

  // Force re-render when theme changes by using colors as part of key
  const themeKey = React.useMemo(() => {
    // Create a simple hash from primary color to detect theme changes
    return colors.primary + colors.background
  }, [colors.primary, colors.background])

  // Calculate timeline dimensions
  const duration = currentProject?.timeline?.duration || 10000
  const pixelsPerMs = TimeConverter.calculatePixelsPerMs(stageSize.width, zoom)
  const timelineWidth = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, stageSize.width)
  // Show zoom track if ANY zoom effects exist (enabled or disabled)
  // Check if ANY recording has zoom effects (effects are stored in source space on recordings)
  const zoomTrackExists = currentProject?.recordings.some(r =>
    r.effects?.some(e => e.type === EffectType.Zoom)
  ) ?? false

  // Determine if any zoom block is enabled
  const allZoomEffects = currentProject?.recordings.flatMap(r =>
    EffectsFactory.getZoomEffects(r.effects || [])
  ) || []
  const isZoomEnabled = allZoomEffects.some(e => e.enabled)

  // Calculate adaptive zoom limits based on zoom blocks and timeline duration
  const adaptiveZoomLimits = React.useMemo(() => {
    const zoomBlocks = allZoomEffects.map(e => ({
      startTime: e.startTime,
      endTime: e.endTime
    }))
    return TimeConverter.calculateAdaptiveZoomLimits(
      duration,
      stageSize.width,
      zoomBlocks,
      TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
    )
  }, [allZoomEffects, duration, stageSize.width])

  // Show keystroke track if ANY keystroke effects exist
  const hasKeystrokeTrack = EffectsFactory.hasKeystrokeTrack(currentProject?.timeline.effects || [])

  // Calculate track heights based on number of tracks
  const calculateTrackHeights = () => {
    const rulerHeight = TimelineConfig.RULER_HEIGHT
    const remainingHeight = stageSize.height - rulerHeight
    const totalTracks = 2 + (zoomTrackExists ? 1 : 0) + (hasKeystrokeTrack ? 1 : 0)

    // Define height ratios for different track configurations
    const heightRatios: Record<number, { video: number; audio: number; zoom?: number; keystroke?: number }> = {
      2: { video: 0.55, audio: 0.45 },
      3: { video: 0.4, audio: 0.3, zoom: 0.3, keystroke: 0.3 },
      4: { video: 0.35, audio: 0.25, zoom: 0.2, keystroke: 0.2 }
    }

    const ratios = heightRatios[totalTracks] || heightRatios[2]

    return {
      ruler: rulerHeight,
      video: Math.floor(remainingHeight * ratios.video),
      audio: Math.floor(remainingHeight * ratios.audio),
      zoom: zoomTrackExists ? Math.floor(remainingHeight * (ratios.zoom || 0)) : 0,
      keystroke: hasKeystrokeTrack ? Math.floor(remainingHeight * (ratios.keystroke || 0)) : 0
    }
  }

  const trackHeights = calculateTrackHeights()
  const rulerHeight = trackHeights.ruler
  const videoTrackHeight = trackHeights.video
  const audioTrackHeight = trackHeights.audio
  const zoomTrackHeight = trackHeights.zoom
  const keystrokeTrackHeight = trackHeights.keystroke
  const stageWidth = Math.max(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, stageSize.width)

  // Initialize command manager
  const commandManagerRef = useRef<CommandManager | null>(null)

  useEffect(() => {
    const store = useProjectStore.getState()
    const ctx = new DefaultCommandContext(store)
    commandManagerRef.current = CommandManager.getInstance(ctx)
  }, [])

  // Use command-based keyboard shortcuts for editing operations (copy, cut, paste, delete, etc.)
  useCommandKeyboard({ enabled: true })

  // Use playback-specific keyboard shortcuts (play, pause, seek, shuttle, etc.)
  useTimelinePlayback({ enabled: true })

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Auto-scroll during playback
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return
    const playheadX = TimeConverter.msToPixels(currentTime, pixelsPerMs)
    const container = containerRef.current
    const scrollWidth = container.scrollWidth - container.clientWidth

    if (playheadX > scrollLeft + stageSize.width - 100) {
      const newScroll = Math.min(scrollWidth, playheadX - 100)
      container.scrollLeft = newScroll
      setScrollLeft(newScroll)
    }
  }, [currentTime, isPlaying, pixelsPerMs, scrollLeft, stageSize.width])

  // Handle clip context menu
  const handleClipContextMenu = useCallback((e: { evt: { clientX: number; clientY: number } }, clipId: string) => {
    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      clipId
    })
  }, [])

  // Handle clip selection
  const handleClipSelect = useCallback((clipId: string) => {
    onClipSelect(clipId)
    selectClip(clipId)
  }, [onClipSelect, selectClip])

  // Handle clip drag using command pattern
  const handleClipDragEnd = useCallback(async (clipId: string, newStartTime: number) => {
    const manager = commandManagerRef.current
    if (!manager) return

    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new UpdateClipCommand(
      freshContext,
      clipId,
      { startTime: newStartTime }
    )
    await manager.execute(command)

    // Keep selection on the moved clip so UI/playhead stay in sync
    selectClip(clipId)
  }, [selectClip])

  // Handle control actions using command pattern
  const handleSplit = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore.getState())
      const command = new SplitClipCommand(
        freshContext,
        selectedClips[0],
        currentTime
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimStart = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore.getState())
      const command = new TrimCommand(
        freshContext,
        selectedClips[0],
        currentTime,
        'start'
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimEnd = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore.getState())
      const command = new TrimCommand(
        freshContext,
        selectedClips[0],
        currentTime,
        'end'
      )
      await manager.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleDelete = useCallback(async () => {
    const manager = commandManagerRef.current
    if (!manager) return

    // Begin group for multiple deletions
    if (selectedClips.length > 1) {
      manager.beginGroup(`delete-${Date.now()}`)
    }

    for (const clipId of selectedClips) {
      const freshContext = new DefaultCommandContext(useProjectStore.getState())
      const command = new RemoveClipCommand(freshContext, clipId)
      await manager.execute(command)
    }

    if (selectedClips.length > 1) {
      await manager.endGroup()
    }

    clearSelection()
  }, [selectedClips, clearSelection])

  const handleDuplicate = useCallback(async () => {
    const manager = commandManagerRef.current
    if (selectedClips.length === 1 && manager) {
      const freshContext = new DefaultCommandContext(useProjectStore.getState())
      const command = new DuplicateClipCommand(
        freshContext,
        selectedClips[0]
      )
      await manager.execute(command)
    }
  }, [selectedClips])

  // Context menu wrappers - reuse existing handlers
  const handleClipSplit = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new SplitClipCommand(freshContext, clipId, currentTime)
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimStart = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new TrimCommand(freshContext, clipId, currentTime, 'start')
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimEnd = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new TrimCommand(freshContext, clipId, currentTime, 'end')
    await manager.execute(command)
  }, [currentTime])

  const handleClipDuplicate = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new DuplicateClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipCopy = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new CopyCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipDelete = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new RemoveClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipSpeedUp = useCallback(async (clipId: string) => {
    selectClip(clipId) // Ensure UI syncs
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore.getState())
    const command = new ChangePlaybackRateCommand(freshContext, clipId, 2.0)
    await manager.execute(command)
  }, [selectClip])

  // Stage click handler - click to seek and clear selections
  const handleStageClick = useCallback((e: { target: any; evt: { offsetX: number } }) => {
    if (e.target === e.target.getStage()) {
      clearEffectSelection()

      const x = e.evt.offsetX - TimelineConfig.TRACK_LABEL_WIDTH
      if (x > 0) {
        const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
        const maxTime = currentProject?.timeline?.duration || 0
        const targetTime = clamp(time, 0, maxTime)
        onSeek(targetTime)
      }
    }
  }, [currentProject, pixelsPerMs, onSeek, clearEffectSelection])

  if (!currentProject) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50 rounded-lg", className)}>
        <p className="text-muted-foreground">No project loaded</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      <TimelineControls
        isPlaying={isPlaying}
        zoom={zoom}
        currentTime={currentTime}
        maxDuration={currentProject.timeline.duration}
        minZoom={adaptiveZoomLimits.min}
        maxZoom={adaptiveZoomLimits.max}
        selectedClips={selectedClips}
        onPlay={onPlay}
        onPause={onPause}
        onSeek={onSeek}
        onZoomChange={onZoomChange}
        onSplit={handleSplit}
        onTrimStart={handleTrimStart}
        onTrimEnd={handleTrimEnd}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-background select-none outline-none focus:outline-none"
        tabIndex={0}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onMouseDown={() => {
          // Ensure container maintains focus for keyboard events
          containerRef.current?.focus()
        }}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          outline: 'none'
        }}
      >
        <Stage
          key={themeKey}
          width={stageWidth}
          height={stageSize.height}
          onMouseDown={handleStageClick}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        >
          {/* Background Layer */}
          <Layer>
            <Rect
              x={0}
              y={0}
              width={stageWidth}
              height={stageSize.height}
              fill={colors.background}
            />

            <Rect
              x={0}
              y={0}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={rulerHeight}
              fill={colors.background}
            />

            <TimelineTrack
              type={TimelineTrackType.Video}
              y={rulerHeight}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={videoTrackHeight}
            />

            {zoomTrackExists && (
              <TimelineTrack
                type={TimelineTrackType.Zoom}
                y={rulerHeight + videoTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={zoomTrackHeight}
                muted={!isZoomEnabled}
              />
            )}

            {hasKeystrokeTrack && (
              <TimelineTrack
                type={TimelineTrackType.Keystroke}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={keystrokeTrackHeight}
              />
            )}

            <TimelineTrack
              type={TimelineTrackType.Audio}
              y={rulerHeight + videoTrackHeight + zoomTrackHeight + keystrokeTrackHeight}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={audioTrackHeight}
            />
          </Layer>

          {/* Ruler Layer */}
          <Layer>
            <TimelineRuler
              duration={currentProject.timeline.duration}
              stageWidth={stageWidth}
              zoom={zoom}
              pixelsPerMs={pixelsPerMs}
            />
          </Layer>

          {/* Clips Layer */}
          <Layer>
            {/* Video clips */}
            {(() => {
              const videoTrack = currentProject.timeline.tracks.find(t => t.type === TrackType.Video)
              const videoClips = videoTrack?.clips || []

              return videoClips.map((clip, index) => {
                const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
                // Merge effects from recording (zoom) and timeline (global)
                const recordingEffects = recording?.effects || []
                const globalEffects = currentProject.timeline.effects || []
                const clipEffects = [...recordingEffects, ...globalEffects]

                return (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    recording={recording}
                    trackType={TrackType.Video}
                    trackY={rulerHeight}
                    trackHeight={videoTrackHeight}
                    pixelsPerMs={pixelsPerMs}
                    isSelected={selectedClips.includes(clip.id)}
                    selectedEffectType={selectedClips.includes(clip.id) ? (selectedEffectLayer?.type === EffectLayerType.Screen ? null : selectedEffectLayer?.type) : null}
                    otherClipsInTrack={videoClips}
                    clipEffects={clipEffects}
                    onSelect={handleClipSelect}
                    onSelectEffect={(type) => {
                      selectEffectLayer(type)
                    }}
                    onDragEnd={handleClipDragEnd}
                    onContextMenu={handleClipContextMenu}
                    onOpenTypingSuggestion={(opts) => setTypingPopover(opts)}
                  />
                )
              })
            })()}

            {/* Zoom blocks - recording-scoped, rendered per recording */}
            {zoomTrackExists && (() => {
              // Collect and sort zoom blocks to render selected ones on top
              const zoomBlocks: React.ReactElement[] = []
              const selectedZoomBlocks: React.ReactElement[] = []

              // Get ALL zoom effects from all recordings (stored in source space)
              const allZoomEffects: Effect[] = []
              for (const recording of currentProject.recordings) {
                const recordingZoomEffects = EffectsFactory.getZoomEffects(recording.effects || [])
                allZoomEffects.push(...recordingZoomEffects)
              }
              const zoomEffects = allZoomEffects

              // Convert all zoom effects to TIMELINE space for snapping/overlap detection
              // TimelineEffectBlock needs timeline-space times for consistent comparisons
              const allBlocksInTimelineSpace: ZoomBlock[] = zoomEffects.map((effect) => {
                const recording = currentProject.recordings.find(r =>
                  r.effects?.some(e => e.id === effect.id)
                )
                if (!recording) {
                  // Fallback: return effect times unchanged (shouldn't happen)
                  return {
                    id: effect.id,
                    startTime: effect.startTime,
                    endTime: effect.endTime,
                    scale: (effect.data as ZoomEffectData).scale
                  }
                }

                // Find intersecting clips for this effect
                const clips = currentProject.timeline.tracks
                  .flatMap(t => t.clips)
                  .filter(c =>
                    c.recordingId === recording.id &&
                    (c.sourceIn || 0) < effect.endTime &&
                    ((c.sourceOut || (c.sourceIn || 0) + c.duration * (c.playbackRate || 1))) > effect.startTime
                  )
                  .sort((a, b) => a.startTime - b.startTime)

                if (clips.length === 0) {
                  return {
                    id: effect.id,
                    startTime: effect.startTime,
                    endTime: effect.endTime,
                    scale: (effect.data as ZoomEffectData).scale
                  }
                }

                const firstClip = clips[0]
                const lastClip = clips[clips.length - 1]

                // Convert source times to timeline times
                const timelineStart = TimeConverter.sourceToTimeline(
                  Math.max(effect.startTime, firstClip.sourceIn || 0),
                  firstClip
                )
                const timelineEnd = TimeConverter.sourceToTimeline(
                  Math.min(effect.endTime, lastClip.sourceOut || Infinity),
                  lastClip
                )

                return {
                  id: effect.id,
                  startTime: timelineStart,
                  endTime: timelineEnd,
                  scale: (effect.data as ZoomEffectData).scale
                }
              })

              // Render each zoom effect as a block on the timeline
              zoomEffects.forEach((effect) => {
                const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id === effect.id
                const zoomData = effect.data as ZoomEffectData

                // Find which recording this effect belongs to
                const recording = currentProject.recordings.find(r =>
                  r.effects?.some(e => e.id === effect.id)
                )
                if (!recording) return

                // Find ALL clips that intersect with this effect's source range
                // This is critical because a single effect might span across multiple split clips
                // (e.g. a Normal speed clip followed by a Fast speed clip)
                const intersectingClips = currentProject.timeline.tracks
                  .flatMap(t => t.clips)
                  .filter(c =>
                    c.recordingId === recording.id &&
                    // Check for intersection: clip.sourceIn < effect.endTime && clip.sourceOut > effect.startTime
                    (c.sourceIn || 0) < effect.endTime &&
                    ((c.sourceOut || (c.sourceIn || 0) + c.duration * (c.playbackRate || 1))) > effect.startTime
                  )
                  .sort((a, b) => a.startTime - b.startTime)

                if (intersectingClips.length === 0) return

                const firstClip = intersectingClips[0]
                const lastClip = intersectingClips[intersectingClips.length - 1]

                // Calculate start time using the first clip
                // If effect starts before this clip (shouldn't happen if we found all), clamp to clip start
                const timelineStartTime = TimeConverter.sourceToTimeline(Math.max(effect.startTime, firstClip.sourceIn || 0), firstClip)

                // Calculate end time using the last clip
                const timelineEndTime = TimeConverter.sourceToTimeline(Math.min(effect.endTime, lastClip.sourceOut || Infinity), lastClip)

                // Calculate width with minimum visual constraint
                const calculatedWidth = TimeConverter.msToPixels(timelineEndTime - timelineStartTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(timelineStartTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={rulerHeight + videoTrackHeight + TimelineConfig.TRACK_PADDING}
                    width={visualWidth}
                    height={zoomTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={timelineStartTime}
                    endTime={timelineEndTime}
                    label={`${zoomData.scale.toFixed(1)}×`}
                    fillColor={colors.zoomBlock}
                    scale={zoomData.scale}
                    introMs={zoomData.introMs}
                    outroMs={zoomData.outroMs}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allBlocksInTimelineSpace}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      // Just select the zoom effect, no clip association needed
                      selectEffectLayer(EffectLayerType.Zoom, effect.id)
                      // Force focus to container for keyboard events
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onDragEnd={(newX: number) => {
                      const newTimelineStartTime = TimeConverter.pixelsToMs(newX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)

                      // Find the clip at the new timeline position to convert back to source
                      // We need to find which clip the new start time falls into
                      const targetClip = currentProject.timeline.tracks
                        .flatMap(t => t.clips)
                        .find(c =>
                          c.recordingId === recording.id &&
                          TimeConverter.isTimelinePositionInClip(newTimelineStartTime, c)
                        )

                      // If we dragged into a valid clip, use it. Otherwise fall back to the first clip we rendered with.
                      const conversionClip = targetClip || firstClip

                      const newSourceStartTime = TimeConverter.timelineToSource(newTimelineStartTime, conversionClip)
                      const duration = effect.endTime - effect.startTime

                      // Check for overlaps with other zoom effects (mutual exclusivity)
                      const otherZooms = zoomEffects.filter(e => e.id !== effect.id)
                      let finalStartTime = Math.max(0, newSourceStartTime)

                      // Prevent overlaps (in Source Space)
                      const overlap = otherZooms.some(z => finalStartTime < z.endTime && finalStartTime + duration > z.startTime)
                      if (overlap) {
                        const sorted = [...otherZooms].sort((a, b) => a.startTime - b.startTime)
                        for (const z of sorted) {
                          if (finalStartTime < z.endTime && finalStartTime + duration > z.startTime) {
                            finalStartTime = z.endTime
                          }
                        }
                      }

                      // Update via callback which uses command system
                      onZoomBlockUpdate?.(effect.id, {
                        startTime: finalStartTime,
                        endTime: finalStartTime + duration
                      })
                    }}
                    onUpdate={(updates: Partial<ZoomBlock>) => {
                      // Convert timeline times to source times if timing updates provided
                      // This matches the conversion done in onDragEnd
                      if (updates.startTime !== undefined || updates.endTime !== undefined) {
                        // Find the clip at the new timeline position for conversion
                        const newTimelineStartTime = updates.startTime ?? timelineStartTime
                        const targetClip = currentProject.timeline.tracks
                          .flatMap(t => t.clips)
                          .find(c =>
                            c.recordingId === recording.id &&
                            TimeConverter.isTimelinePositionInClip(newTimelineStartTime, c)
                          ) || firstClip

                        const sourceUpdates: Partial<ZoomBlock> = { ...updates }

                        if (updates.startTime !== undefined) {
                          sourceUpdates.startTime = TimeConverter.timelineToSource(updates.startTime, targetClip)
                        }
                        if (updates.endTime !== undefined) {
                          // For endTime, use the clip that contains the end position
                          const endTimelinePos = updates.endTime
                          const endClip = currentProject.timeline.tracks
                            .flatMap(t => t.clips)
                            .find(c =>
                              c.recordingId === recording.id &&
                              TimeConverter.isTimelinePositionInClip(endTimelinePos, c)
                            ) || lastClip
                          sourceUpdates.endTime = TimeConverter.timelineToSource(updates.endTime, endClip)
                        }

                        onZoomBlockUpdate?.(effect.id, sourceUpdates)
                      } else {
                        // Non-timing updates (scale, introMs, etc.) can pass through directly
                        onZoomBlockUpdate?.(effect.id, updates)
                      }
                    }}
                  />
                )

                if (isBlockSelected) {
                  selectedZoomBlocks.push(blockElement)
                } else {
                  zoomBlocks.push(blockElement)
                }
              })

              return (
                <>
                  {zoomBlocks}
                  {selectedZoomBlocks}
                </>
              )
            })()}

            {/* Screen Effects blocks - recording-scoped */}
            {(() => {
              const effectsSource = currentProject.timeline.effects || []
              const screenEffects = EffectsFactory.getScreenEffects(effectsSource)
              if (screenEffects.length === 0) return null

              const yBase = rulerHeight + videoTrackHeight + (zoomTrackHeight || 0) + TimelineConfig.TRACK_PADDING

              return screenEffects.map((effect) => (
                <TimelineEffectBlock
                  key={effect.id}
                  blockId={effect.id}
                  x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                  y={yBase}
                  width={TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)}
                  height={(zoomTrackHeight || 28) - TimelineConfig.TRACK_PADDING * 2}
                  startTime={effect.startTime}
                  endTime={effect.endTime}
                  label={'3D'}
                  fillColor={colors.screenBlock}
                  isSelected={selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id === effect.id}
                  isEnabled={effect.enabled}
                  allBlocks={screenEffects as any}
                  pixelsPerMs={pixelsPerMs}
                  onSelect={() => selectEffectLayer(EffectLayerType.Screen, effect.id)}
                  onDragEnd={(newX: number) => {
                    const newStartTime = TimeConverter.pixelsToMs(newX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
                    const duration = effect.endTime - effect.startTime
                    updateEffect(effect.id, { startTime: newStartTime, endTime: newStartTime + duration })
                  }}
                  onUpdate={(updates: Partial<ZoomBlock>) => updateEffect(effect.id, updates)}
                />
              ))
            })()}

            {/* Audio clips */}
            {(() => {
              const audioTrack = currentProject.timeline.tracks.find(t => t.type === TrackType.Audio)
              const audioClips = audioTrack?.clips || []

              return audioClips.map(clip => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType={TrackType.Audio}
                  trackY={rulerHeight + videoTrackHeight + zoomTrackHeight + keystrokeTrackHeight}
                  trackHeight={audioTrackHeight}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  otherClipsInTrack={audioClips}
                  onSelect={handleClipSelect}
                  onDragEnd={handleClipDragEnd}
                  onContextMenu={handleClipContextMenu}
                />
              ))
            })()}
          </Layer>

          {/* Playhead Layer */}
          <Layer>
            <TimelinePlayhead
              currentTime={currentTime}
              totalHeight={stageSize.height}
              pixelsPerMs={pixelsPerMs}
              timelineWidth={timelineWidth}
              maxTime={currentProject.timeline.duration}
              onSeek={onSeek}
            />
          </Layer>
        </Stage>

        {/* Context Menu */}
        {contextMenu && (
          <TimelineContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            clipId={contextMenu.clipId}
            onSplit={handleClipSplit}
            onTrimStart={handleClipTrimStart}
            onTrimEnd={handleClipTrimEnd}
            onDuplicate={handleClipDuplicate}
            onCopy={handleClipCopy}
            onDelete={handleClipDelete}
            onSpeedUp={handleClipSpeedUp}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Typing suggestion popover */}
        {typingPopover && (
          <TypingSuggestionPopover
            x={typingPopover.x}
            y={typingPopover.y}
            period={typingPopover.period}
            allPeriods={typingPopover.allPeriods}
            onApply={typingPopover.onApply}
            onApplyAll={typingPopover.onApplyAll}
            onRemove={typingPopover.onRemove}
            onClose={() => setTypingPopover(null)}
          />
        )}
      </div>
    </div>
  )
}
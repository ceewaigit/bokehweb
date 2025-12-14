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
import { useWindowAppearanceStore } from '@/stores/window-appearance-store'

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
  CutCommand,
  PasteCommand,
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
  onClipSelect?: (clipId: string) => void
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
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)
  const windowSurfaceOpacity = useWindowAppearanceStore((s) => s.opacity)

  // Force re-render when theme changes by using colors as part of key
  const themeKey = React.useMemo(() => {
    // Create a simple hash from primary color to detect theme changes
    return colors.primary + colors.background + windowSurfaceMode + windowSurfaceOpacity
  }, [colors.primary, colors.background, windowSurfaceMode, windowSurfaceOpacity])

  // Calculate timeline dimensions
  const duration = currentProject?.timeline?.duration || 10000
  const pixelsPerMs = TimeConverter.calculatePixelsPerMs(stageSize.width, zoom)
  const timelineWidth = TimeConverter.calculateTimelineWidth(duration, pixelsPerMs, stageSize.width)
  // Show individual effect tracks based on their effects
  const hasZoomEffects = EffectsFactory.getZoomEffects(currentProject?.timeline.effects || []).length > 0
  const hasScreenEffects = EffectsFactory.getScreenEffects(currentProject?.timeline.effects || []).length > 0
  const zoomTrackExists = hasZoomEffects
  const screenTrackExists = hasScreenEffects

  // Determine if any zoom block is enabled
  const allZoomEffects = EffectsFactory.getZoomEffects(currentProject?.timeline.effects || [])
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

  // Show keystroke track if keystrokes exist in metadata OR any keystroke effect exists.
  // This ensures the UI exposes the keystroke lane/toggle even if the effect is disabled or missing.
  const hasAnyKeyboardEvents = (currentProject?.recordings || []).some(
    (r) => (r.metadata?.keyboardEvents?.length ?? 0) > 0
  )
  const hasAnyKeystrokeEffect = (currentProject?.timeline.effects || []).some(
    (e) => e.type === EffectType.Keystroke
  )
  const hasKeystrokeTrack = hasAnyKeystrokeEffect || hasAnyKeyboardEvents

  // Calculate track heights based on number of tracks
  const calculateTrackHeights = () => {
    const rulerHeight = TimelineConfig.RULER_HEIGHT
    const remainingHeight = stageSize.height - rulerHeight
    const totalTracks = 2 + (zoomTrackExists ? 1 : 0) + (screenTrackExists ? 1 : 0) + (hasKeystrokeTrack ? 1 : 0)

    // Define height ratios for different track configurations
    const heightRatios: Record<number, { video: number; audio: number; zoom?: number; screen?: number; keystroke?: number }> = {
      2: { video: 0.55, audio: 0.45 },
      3: { video: 0.4, audio: 0.3, zoom: 0.3, screen: 0.3, keystroke: 0.3 },
      4: { video: 0.35, audio: 0.25, zoom: 0.2, screen: 0.2, keystroke: 0.2 },
      5: { video: 0.30, audio: 0.20, zoom: 0.18, screen: 0.18, keystroke: 0.14 }
    }

    const ratios = heightRatios[totalTracks] || heightRatios[2]

    return {
      ruler: rulerHeight,
      video: Math.floor(remainingHeight * ratios.video),
      audio: Math.floor(remainingHeight * ratios.audio),
      zoom: zoomTrackExists ? Math.floor(remainingHeight * (ratios.zoom || 0)) : 0,
      screen: screenTrackExists ? Math.floor(remainingHeight * (ratios.screen || 0)) : 0,
      keystroke: hasKeystrokeTrack ? Math.floor(remainingHeight * (ratios.keystroke || 0)) : 0
    }
  }

  const trackHeights = calculateTrackHeights()
  const rulerHeight = trackHeights.ruler
  const videoTrackHeight = trackHeights.video
  const audioTrackHeight = trackHeights.audio
  const zoomTrackHeight = trackHeights.zoom
  const screenTrackHeight = trackHeights.screen
  const keystrokeTrackHeight = trackHeights.keystroke
  const stageWidth = Math.max(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, stageSize.width)

  // Initialize command manager
  const commandManagerRef = useRef<CommandManager | null>(null)

  useEffect(() => {
    const ctx = new DefaultCommandContext(useProjectStore)
    commandManagerRef.current = CommandManager.getInstance(ctx)
  }, [])

  // Use command-based keyboard shortcuts for editing operations (copy, cut, paste, delete, etc.)
  useCommandKeyboard({ enabled: true })

  // Use playback-specific keyboard shortcuts (play, pause, seek, shuttle, etc.)
  useTimelinePlayback({ enabled: true })

  // Handle window resize with debouncing to prevent excessive re-renders
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }

    const debouncedUpdateSize = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(updateSize, 100) // 100ms debounce
    }

    updateSize() // Initial size
    window.addEventListener('resize', debouncedUpdateSize)

    return () => {
      window.removeEventListener('resize', debouncedUpdateSize)
      if (timeoutId) clearTimeout(timeoutId)
    }
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
    // Match common UX: right-clicking a clip selects it so actions operate on the intended target.
    selectClip(clipId)
    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      clipId
    })
  }, [selectClip])

  // Handle clip selection
  const handleClipSelect = useCallback((clipId: string) => {
    selectClip(clipId)
    onClipSelect?.(clipId)
  }, [selectClip, onClipSelect])

  const handleReorderClip = useCallback((clipId: string, newIndex: number) => {
    useProjectStore.getState().reorderClip(clipId, newIndex)
  }, [])

  const handleCacheTypingPeriods = useCallback((recordingId: string, periods: TypingPeriod[]) => {
    useProjectStore.getState().cacheTypingPeriods(recordingId, periods)
  }, [])

  // Handle clip drag using command pattern
  const handleClipDragEnd = useCallback(async (clipId: string, newStartTime: number) => {
    const manager = commandManagerRef.current
    if (!manager) return

    const freshContext = new DefaultCommandContext(useProjectStore)
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
      const freshContext = new DefaultCommandContext(useProjectStore)
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
      const freshContext = new DefaultCommandContext(useProjectStore)
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
      const freshContext = new DefaultCommandContext(useProjectStore)
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
      const freshContext = new DefaultCommandContext(useProjectStore)
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
      const freshContext = new DefaultCommandContext(useProjectStore)
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
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new SplitClipCommand(freshContext, clipId, currentTime)
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimStart = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new TrimCommand(freshContext, clipId, currentTime, 'start')
    await manager.execute(command)
  }, [currentTime])

  const handleClipTrimEnd = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new TrimCommand(freshContext, clipId, currentTime, 'end')
    await manager.execute(command)
  }, [currentTime])

  const handleClipDuplicate = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new DuplicateClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipCopy = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new CopyCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipCut = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new CutCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handlePaste = useCallback(async () => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new PasteCommand(freshContext, currentTime)
    await manager.execute(command)
  }, [currentTime])

  const handleClipDelete = useCallback(async (clipId: string) => {
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
    const command = new RemoveClipCommand(freshContext, clipId)
    await manager.execute(command)
  }, [])

  const handleClipSpeedUp = useCallback(async (clipId: string) => {
    selectClip(clipId) // Ensure UI syncs
    const manager = commandManagerRef.current
    if (!manager) return
    const freshContext = new DefaultCommandContext(useProjectStore)
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

  // The timeline panel already sits on a `.window-surface`; avoid painting an extra opaque canvas layer in glass modes.
  const backgroundOpacity = windowSurfaceMode === 'solid' ? 1 : 0

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
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-transparent select-none outline-none focus:outline-none"
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
              opacity={backgroundOpacity}
            />

            <Rect
              x={0}
              y={0}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={rulerHeight}
              fill={colors.background}
              opacity={backgroundOpacity}
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

            {screenTrackExists && (
              <TimelineTrack
                type={TimelineTrackType.Screen}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={screenTrackHeight}
              />
            )}

            {hasKeystrokeTrack && (
              <TimelineTrack
                type={TimelineTrackType.Keystroke}
                y={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={keystrokeTrackHeight}
              />
            )}

            <TimelineTrack
              type={TimelineTrackType.Audio}
              y={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight}
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
                    onReorderClip={handleReorderClip}
                    onCacheTypingPeriods={handleCacheTypingPeriods}
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

            {/* Zoom blocks - SIMPLIFIED: All zoom effects are now in timeline-space */}
            {zoomTrackExists && (() => {
              // Collect and sort zoom blocks to render selected ones on top
              const zoomBlocks: React.ReactElement[] = []
              const selectedZoomBlocks: React.ReactElement[] = []

              // All zoom effects are now in timeline.effects (timeline-space)
              // No more dual-space complexity!
              const zoomEffects = EffectsFactory.getZoomEffects(currentProject.timeline.effects || [])

              // Convert to ZoomBlock array for snapping/overlap detection
              const allBlocksInTimelineSpace: ZoomBlock[] = zoomEffects.map(e => ({
                id: e.id,
                startTime: e.startTime,
                endTime: e.endTime,
                scale: (e.data as ZoomEffectData).scale,
                targetX: (e.data as ZoomEffectData).targetX,
                targetY: (e.data as ZoomEffectData).targetY,
                introMs: (e.data as ZoomEffectData).introMs,
                outroMs: (e.data as ZoomEffectData).outroMs,
              }))

              // Render each zoom effect as a block on the timeline
              zoomEffects.forEach((effect) => {
                const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id === effect.id
                const zoomData = effect.data as ZoomEffectData

                // Use effect times directly (already in timeline-space)
                const timelineStartTime = effect.startTime
                const timelineEndTime = effect.endTime

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
                      selectEffectLayer(EffectLayerType.Zoom, effect.id)
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => {
                      // All updates are in timeline-space, pass through directly
                      onZoomBlockUpdate?.(effect.id, updates)
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

            {/* Screen Effects blocks - rendered in dedicated Screen track */}
            {screenTrackExists && (() => {
              const effectsSource = currentProject.timeline.effects || []
              const screenEffects = EffectsFactory.getScreenEffects(effectsSource)
              if (screenEffects.length === 0) return null

              // Collect and sort screen blocks to render selected ones on top (same behavior as zoom blocks)
              const screenBlocks: React.ReactElement[] = []
              const selectedScreenBlocks: React.ReactElement[] = []

              const allScreenBlocks = screenEffects.map((e) => ({
                id: e.id,
                startTime: e.startTime,
                endTime: e.endTime,
              }))

              // Render in the dedicated Screen track (below zoom track)
              const yBase = rulerHeight + videoTrackHeight + zoomTrackHeight + TimelineConfig.TRACK_PADDING

              screenEffects.forEach((effect) => {
                const isBlockSelected =
                  selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id === effect.id

                const calculatedWidth = TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                // Get screen effect data for intro/outro
                const screenData = EffectsFactory.getScreenData(effect)

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={yBase}
                    width={visualWidth}
                    height={screenTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={effect.startTime}
                    endTime={effect.endTime}
                    label={'3D'}
                    fillColor={colors.screenBlock}
                    scale={1.3}  // Use a fixed scale to show the intro/outro curve
                    introMs={screenData?.introMs ?? 400}
                    outroMs={screenData?.outroMs ?? 400}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={allScreenBlocks}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      selectEffectLayer(EffectLayerType.Screen, effect.id)
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => updateEffect(effect.id, updates)}
                  />
                )

                if (isBlockSelected) {
                  selectedScreenBlocks.push(blockElement)
                } else {
                  screenBlocks.push(blockElement)
                }
              })

              return (
                <>
                  {screenBlocks}
                  {selectedScreenBlocks}
                </>
              )
            })()}

            {/* Keystroke blocks - rendered in dedicated Keystroke track */}
            {hasKeystrokeTrack && (() => {
              const effectsSource = currentProject.timeline.effects || []
              const keystrokeEffects = effectsSource.filter((e) => e.type === EffectType.Keystroke)
              if (keystrokeEffects.length === 0) return null

              const blocks: React.ReactElement[] = []
              const selectedBlocks: React.ReactElement[] = []

              const renderBlocks = keystrokeEffects.map((e) => {
                const startTime = Math.max(0, e.startTime)
                const endTime = Math.min(currentProject.timeline.duration, e.endTime)
                return { id: e.id, startTime, endTime }
              })

              const yBase = rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + TimelineConfig.TRACK_PADDING

              keystrokeEffects.forEach((effect) => {
                const isBlockSelected =
                  selectedEffectLayer?.type === EffectLayerType.Keystroke && selectedEffectLayer?.id === effect.id

                const startTime = Math.max(0, effect.startTime)
                const endTime = Math.min(currentProject.timeline.duration, effect.endTime)

                const calculatedWidth = TimeConverter.msToPixels(endTime - startTime, pixelsPerMs)
                const visualWidth = Math.max(TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX, calculatedWidth)
                const isCompact = calculatedWidth < TimelineConfig.ZOOM_EFFECT_COMPACT_THRESHOLD_PX

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={yBase}
                    width={visualWidth}
                    height={keystrokeTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    isCompact={isCompact}
                    startTime={startTime}
                    endTime={endTime}
                    label={'Keys'}
                    fillColor={colors.warning}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={renderBlocks}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      selectEffectLayer(EffectLayerType.Keystroke, effect.id)
                      setTimeout(() => {
                        containerRef.current?.focus()
                      }, 0)
                    }}
                    onUpdate={(updates) => updateEffect(effect.id, updates)}
                  />
                )

                if (isBlockSelected) {
                  selectedBlocks.push(blockElement)
                } else {
                  blocks.push(blockElement)
                }
              })

              return (
                <>
                  {blocks}
                  {selectedBlocks}
                </>
              )
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
                  trackY={rulerHeight + videoTrackHeight + zoomTrackHeight + screenTrackHeight + keystrokeTrackHeight}
                  trackHeight={audioTrackHeight}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  otherClipsInTrack={audioClips}
                  onSelect={handleClipSelect}
                  onReorderClip={handleReorderClip}
                  onCacheTypingPeriods={handleCacheTypingPeriods}
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
            onCut={handleClipCut}
            onCopy={handleClipCopy}
            onPaste={handlePaste}
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

'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Group, Text } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import type { Project, ZoomBlock, ZoomEffectData } from '@/types/project'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineEffectBlock } from './timeline-effect-block'
import { EffectLayerType, type SelectedEffectLayer } from '@/types/effects'

// Utilities
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-converter'
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
  CopyCommand
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
  const zoomTrackExists = currentProject?.timeline.effects?.some(e => e.type === 'zoom') ?? false
  // Determine if any zoom block is enabled
  const isZoomEnabled = currentProject?.timeline.effects?.some(e => e.type === 'zoom' && e.enabled) ?? false
  // Show keystroke track if ANY keystroke effects exist
  const hasKeystrokeTrack = currentProject?.timeline.effects?.some(e => e.type === 'keystroke' && e.enabled) ?? false

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
  const handleClipContextMenu = useCallback((e: any, clipId: string) => {
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
  }, [])

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

  // Stage click handler - click to seek and clear selections
  const handleStageClick = useCallback((e: any) => {
    if (e.target === e.target.getStage()) {
      clearEffectSelection()

      const x = e.evt.offsetX - TimelineConfig.TRACK_LABEL_WIDTH
      if (x > 0) {
        const time = TimeConverter.pixelsToMs(x, pixelsPerMs)
        const maxTime = currentProject?.timeline?.duration || 0
        const targetTime = Math.max(0, Math.min(maxTime, time))
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
              type="video"
              y={rulerHeight}
              width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
              height={videoTrackHeight}
            />

            {zoomTrackExists && (
              <TimelineTrack
                type="zoom"
                y={rulerHeight + videoTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={zoomTrackHeight}
                muted={!isZoomEnabled}
              />
            )}

            {hasKeystrokeTrack && (
              <TimelineTrack
                type="keystroke"
                y={rulerHeight + videoTrackHeight + zoomTrackHeight}
                width={timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH}
                height={keystrokeTrackHeight}
              />
            )}

            <TimelineTrack
              type="audio"
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
              const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video')
              const videoClips = videoTrack?.clips || []

              return videoClips.map(clip => {
                const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
                // Get effects that overlap with this clip's time range
                const clipEffects = currentProject.timeline.effects?.filter(e =>
                  e.startTime < clip.startTime + clip.duration &&
                  e.endTime > clip.startTime
                ) || []
                return (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    recording={recording}
                    trackType="video"
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
                  />
                )
              })
            })()}

            {/* Zoom blocks - timeline-global, not tied to clips */}
            {zoomTrackExists && (() => {
              // Collect and sort zoom blocks to render selected ones on top
              const zoomBlocks: React.ReactElement[] = []
              const selectedZoomBlocks: React.ReactElement[] = []

              // Get ALL zoom effects from timeline.effects (timeline-global)
              const effectsSource = currentProject.timeline.effects || []
              const zoomEffects = effectsSource.filter(e => e.type === 'zoom')


              // Render each zoom effect as a block on the timeline
              zoomEffects.forEach((effect) => {
                const isBlockSelected = selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id === effect.id
                const zoomData = effect.data as ZoomEffectData

                const blockElement = (
                  <TimelineEffectBlock
                    key={effect.id}
                    blockId={effect.id}
                    x={TimeConverter.msToPixels(effect.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH}
                    y={rulerHeight + videoTrackHeight + TimelineConfig.TRACK_PADDING}
                    width={TimeConverter.msToPixels(effect.endTime - effect.startTime, pixelsPerMs)}
                    height={zoomTrackHeight - TimelineConfig.TRACK_PADDING * 2}
                    startTime={effect.startTime}
                    endTime={effect.endTime}
                    label={`${zoomData.scale.toFixed(1)}×`}
                    fillColor={colors.zoomBlock}
                    scale={zoomData.scale}
                    introMs={zoomData.introMs}
                    outroMs={zoomData.outroMs}
                    isSelected={isBlockSelected}
                    isEnabled={effect.enabled}
                    allBlocks={zoomEffects as any}
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
                      const newStartTime = TimeConverter.pixelsToMs(newX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
                      const duration = effect.endTime - effect.startTime

                      // Check for overlaps with other zoom effects (mutual exclusivity)
                      const otherZooms = zoomEffects.filter(e => e.id !== effect.id)
                      let finalStartTime = Math.max(0, newStartTime)

                      // Prevent overlaps
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

            {/* Screen Effects blocks - timeline-global */}
            {(() => {
              const effectsSource = currentProject.timeline.effects || []
              const screenEffects = effectsSource.filter(e => e.type === 'screen')
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
              const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio')
              const audioClips = audioTrack?.clips || []

              return audioClips.map(clip => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType="audio"
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
            onSplit={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new SplitClipCommand(
                  freshContext,
                  id,
                  currentTime
                )
                await manager.execute(command)
              }
            }}
            onTrimStart={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new TrimCommand(
                  freshContext,
                  id,
                  currentTime,
                  'start'
                )
                await manager.execute(command)
              }
            }}
            onTrimEnd={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new TrimCommand(
                  freshContext,
                  id,
                  currentTime,
                  'end'
                )
                await manager.execute(command)
              }
            }}
            onDuplicate={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new DuplicateClipCommand(
                  freshContext,
                  id
                )
                await manager.execute(command)
              }
            }}
            onCopy={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new CopyCommand(
                  freshContext,
                  id
                )
                await manager.execute(command)
              }
            }}
            onDelete={async (id) => {
              const manager = commandManagerRef.current
              if (manager) {
                const freshContext = new DefaultCommandContext(useProjectStore.getState())
                const command = new RemoveClipCommand(
                  freshContext,
                  id
                )
                await manager.execute(command)
              }
            }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  )
}
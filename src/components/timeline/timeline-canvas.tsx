'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Group, Text } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { cn, formatTime } from '@/lib/utils'
import type { Project, ZoomBlock, ClipEffects } from '@/types/project'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineZoomBlock } from './timeline-zoom-block'

// Utilities
import { TIMELINE_LAYOUT, TimelineUtils } from '@/lib/timeline'
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
  TrimStartCommand,
  TrimEndCommand
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
  localEffects?: ClipEffects | null
  onZoomBlockUpdate?: (clipId: string, blockId: string, updates: Partial<ZoomBlock>) => void
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
  localEffects,
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
    updateZoomBlock,
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
  const pixelsPerMs = TimelineUtils.calculatePixelsPerMs(stageSize.width, zoom)
  const timelineWidth = TimelineUtils.calculateTimelineWidth(duration, pixelsPerMs, stageSize.width)
  // Show zoom track if ANY video clip has zoom enabled
  const hasZoomTrack = currentProject?.timeline.tracks
    .find(t => t.type === 'video')?.clips
    .some(c => c.effects?.zoom?.enabled) ?? false

  // Dynamic track heights
  const rulerHeight = TIMELINE_LAYOUT.RULER_HEIGHT
  const remainingHeight = stageSize.height - rulerHeight
  const videoTrackHeight = Math.floor(remainingHeight * (hasZoomTrack ? 0.45 : 0.55))
  const audioTrackHeight = Math.floor(remainingHeight * (hasZoomTrack ? 0.35 : 0.45))
  const zoomTrackHeight = hasZoomTrack ? Math.floor(remainingHeight * 0.2) : 0
  const stageWidth = Math.max(timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH, stageSize.width)

  // Initialize command manager
  const commandManagerRef = useRef<CommandManager | null>(null)
  const commandContextRef = useRef<DefaultCommandContext | null>(null)
  
  useEffect(() => {
    const store = useProjectStore.getState()
    commandContextRef.current = new DefaultCommandContext(store)
    commandManagerRef.current = CommandManager.getInstance(commandContextRef.current)
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
    const playheadX = TimelineUtils.timeToPixel(currentTime, pixelsPerMs)
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
    if (!commandManagerRef.current || !commandContextRef.current) return
    
    const command = new UpdateClipCommand(
      commandContextRef.current,
      clipId,
      { startTime: newStartTime }
    )
    await commandManagerRef.current.execute(command)
  }, [])

  // Handle control actions using command pattern
  const handleSplit = useCallback(async () => {
    if (selectedClips.length === 1 && commandManagerRef.current && commandContextRef.current) {
      const command = new SplitClipCommand(
        commandContextRef.current,
        selectedClips[0],
        currentTime
      )
      await commandManagerRef.current.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimStart = useCallback(async () => {
    if (selectedClips.length === 1 && commandManagerRef.current && commandContextRef.current) {
      const command = new TrimStartCommand(
        commandContextRef.current,
        selectedClips[0],
        currentTime
      )
      await commandManagerRef.current.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleTrimEnd = useCallback(async () => {
    if (selectedClips.length === 1 && commandManagerRef.current && commandContextRef.current) {
      const command = new TrimEndCommand(
        commandContextRef.current,
        selectedClips[0],
        currentTime
      )
      await commandManagerRef.current.execute(command)
    }
  }, [selectedClips, currentTime])

  const handleDelete = useCallback(async () => {
    if (!commandManagerRef.current || !commandContextRef.current) return
    
    // Begin group for multiple deletions
    if (selectedClips.length > 1) {
      commandManagerRef.current.beginGroup(`delete-${Date.now()}`)
    }
    
    for (const clipId of selectedClips) {
      const command = new RemoveClipCommand(commandContextRef.current, clipId)
      await commandManagerRef.current.execute(command)
    }
    
    if (selectedClips.length > 1) {
      await commandManagerRef.current.endGroup()
    }
    
    clearSelection()
  }, [selectedClips, clearSelection])

  const handleDuplicate = useCallback(async () => {
    if (selectedClips.length === 1 && commandManagerRef.current && commandContextRef.current) {
      const command = new DuplicateClipCommand(
        commandContextRef.current,
        selectedClips[0]
      )
      await commandManagerRef.current.execute(command)
    }
  }, [selectedClips])

  // Stage click handler - click to seek and clear selections
  const handleStageClick = useCallback((e: any) => {
    if (e.target === e.target.getStage()) {
      clearEffectSelection()

      const x = e.evt.offsetX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
      if (x > 0) {
        const time = TimelineUtils.pixelToTime(x, pixelsPerMs)
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
        className="flex-1 overflow-x-auto overflow-y-hidden relative"
        tabIndex={0}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onMouseDown={() => {
          // Ensure container maintains focus for keyboard events
          containerRef.current?.focus()
        }}
      >
        <Stage
          key={themeKey}
          width={stageWidth}
          height={stageSize.height}
          onMouseDown={handleStageClick}
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
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
              height={rulerHeight}
              fill={colors.card}
            />

            <TimelineTrack
              type="video"
              y={rulerHeight}
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
              height={videoTrackHeight}
            />

            {hasZoomTrack && (
              <TimelineTrack
                type="zoom"
                y={rulerHeight + videoTrackHeight}
                width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
                height={zoomTrackHeight}
              />
            )}

            <TimelineTrack
              type="audio"
              y={rulerHeight + videoTrackHeight + zoomTrackHeight}
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
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
            {currentProject.timeline.tracks
              .find(t => t.type === 'video')
              ?.clips.map(clip => {
                const recording = currentProject.recordings.find(r => r.id === clip.recordingId)
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
                    selectedEffectType={selectedClips.includes(clip.id) ? selectedEffectLayer?.type : null}
                    onSelect={handleClipSelect}
                    onSelectEffect={(type) => {
                      selectEffectLayer(type)
                    }}
                    onDragEnd={handleClipDragEnd}
                    onContextMenu={handleClipContextMenu}
                  />
                )
              })}

            {/* Zoom blocks - show for ALL video clips with zoom enabled */}
            {hasZoomTrack && (() => {
              const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video')
              if (!videoTrack) return null

              // Collect and sort zoom blocks to render selected ones on top
              const zoomBlocks: React.ReactElement[] = []
              const selectedZoomBlocks: React.ReactElement[] = []
              
              videoTrack.clips.forEach(clip => {
                const isSelectedClip = selectedClips.includes(clip.id)
                const clipEffects = (isSelectedClip && localEffects) || clip.effects

                if (!clipEffects?.zoom?.enabled || !clipEffects.zoom.blocks?.length) return

                const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH

                clipEffects.zoom.blocks.forEach((block: ZoomBlock) => {
                  const isBlockSelected = isSelectedClip && selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id === block.id
                  
                  const blockElement = (
                    <TimelineZoomBlock
                      key={`${clip.id}-${block.id}`}
                      blockId={block.id}
                      x={clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)}
                      y={rulerHeight + videoTrackHeight + TIMELINE_LAYOUT.TRACK_PADDING}
                      width={TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)}
                      height={zoomTrackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
                      startTime={block.startTime}
                      endTime={block.endTime}
                      scale={block.scale}
                      introMs={block.introMs}
                      outroMs={block.outroMs}
                      isSelected={isBlockSelected}
                      allBlocks={clipEffects.zoom.blocks || []}
                      clipX={clipX}
                      pixelsPerMs={pixelsPerMs}
                      onSelect={() => {
                        // Ensure selection is properly set
                        selectClip(clip.id)
                        selectEffectLayer('zoom', block.id)
                        // Force focus to container for keyboard events
                        setTimeout(() => {
                          containerRef.current?.focus()
                        }, 0)
                      }}
                      onDragEnd={(newX) => {
                        const newStartTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
                        const updates = {
                          startTime: Math.max(0, Math.min(clip.duration - (block.endTime - block.startTime), newStartTime)),
                          endTime: Math.max(0, Math.min(clip.duration, newStartTime + (block.endTime - block.startTime)))
                        }
                        if (isSelectedClip && onZoomBlockUpdate) {
                          onZoomBlockUpdate(clip.id, block.id, updates)
                        } else {
                          updateZoomBlock(clip.id, block.id, updates)
                        }
                      }}
                      onUpdate={(updates) => {
                        if (isSelectedClip && onZoomBlockUpdate) {
                          onZoomBlockUpdate(clip.id, block.id, updates)
                        } else {
                          updateZoomBlock(clip.id, block.id, updates)
                        }
                      }}
                    />
                  )
                  
                  // Add to appropriate array
                  if (isBlockSelected) {
                    selectedZoomBlocks.push(blockElement)
                  } else {
                    zoomBlocks.push(blockElement)
                  }
                })
              })
              
              // Render non-selected blocks first, then selected ones on top
              return [...zoomBlocks, ...selectedZoomBlocks]
            })()}

            {/* Audio clips */}
            {currentProject.timeline.tracks
              .find(t => t.type === 'audio')
              ?.clips.map(clip => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType="audio"
                  trackY={rulerHeight + videoTrackHeight + zoomTrackHeight}
                  trackHeight={audioTrackHeight}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  onSelect={handleClipSelect}
                  onDragEnd={handleClipDragEnd}
                />
              ))}
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
      </div>

      {/* Timeline Info - Compact */}
      <div className="flex items-center justify-between px-3 py-1 bg-card">
        <span className="text-[10px] font-medium text-muted-foreground">
          {selectedClips.length > 0 ? `${selectedClips.length} SELECTED` : ''}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(currentProject.timeline.duration)}
        </span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          clipId={contextMenu.clipId}
          onSplit={async (id) => {
            if (commandManagerRef.current && commandContextRef.current) {
              const command = new SplitClipCommand(
                commandContextRef.current,
                id,
                currentTime
              )
              await commandManagerRef.current.execute(command)
            }
          }}
          onTrimStart={async (id) => {
            if (commandManagerRef.current && commandContextRef.current) {
              const command = new TrimStartCommand(
                commandContextRef.current,
                id,
                currentTime
              )
              await commandManagerRef.current.execute(command)
            }
          }}
          onTrimEnd={async (id) => {
            if (commandManagerRef.current && commandContextRef.current) {
              const command = new TrimEndCommand(
                commandContextRef.current,
                id,
                currentTime
              )
              await commandManagerRef.current.execute(command)
            }
          }}
          onDuplicate={async (id) => {
            if (commandManagerRef.current && commandContextRef.current) {
              const command = new DuplicateClipCommand(
                commandContextRef.current,
                id
              )
              await commandManagerRef.current.execute(command)
            }
          }}
          onCopy={(id) => {
            // Copy is handled by keyboard shortcuts
          }}
          onDelete={async (id) => {
            if (commandManagerRef.current && commandContextRef.current) {
              const command = new RemoveClipCommand(
                commandContextRef.current,
                id
              )
              await commandManagerRef.current.execute(command)
            }
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
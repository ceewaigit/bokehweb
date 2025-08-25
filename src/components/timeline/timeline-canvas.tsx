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
import { useTimelineKeyboard } from '@/hooks/use-timeline-keyboard'
import { useTimelineColors } from '@/lib/timeline/colors'

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
    trimClipStart,
    trimClipEnd,
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

  // Use keyboard shortcuts
  useTimelineKeyboard({ enabled: true })

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

  // Handle clip drag
  const handleClipDragEnd = useCallback((clipId: string, newStartTime: number) => {
    updateClip(clipId, { startTime: newStartTime })
  }, [updateClip])

  // Handle control actions
  const handleSplit = useCallback(() => {
    if (selectedClips.length === 1) {
      splitClip(selectedClips[0], currentTime)
    }
  }, [selectedClips, splitClip, currentTime])

  const handleTrimStart = useCallback(() => {
    if (selectedClips.length === 1) {
      trimClipStart(selectedClips[0], currentTime)
    }
  }, [selectedClips, trimClipStart, currentTime])

  const handleTrimEnd = useCallback(() => {
    if (selectedClips.length === 1) {
      trimClipEnd(selectedClips[0], currentTime)
    }
  }, [selectedClips, trimClipEnd, currentTime])

  const handleDelete = useCallback(() => {
    selectedClips.forEach(clipId => removeClip(clipId))
    clearSelection()
  }, [selectedClips, removeClip, clearSelection])

  const handleDuplicate = useCallback(() => {
    if (selectedClips.length === 1) {
      duplicateClip(selectedClips[0])
    }
  }, [selectedClips, duplicateClip])

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
    <div className={cn("flex flex-col h-full w-full bg-background", className)}>
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
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-card/50"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
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

              // Render zoom blocks for ALL clips that have zoom enabled
              return videoTrack.clips.map(clip => {
                // Use local effects if this is the selected clip, otherwise use clip's effects
                const isSelectedClip = selectedClips.includes(clip.id)
                const clipEffects = (isSelectedClip && localEffects) || clip.effects

                if (!clipEffects?.zoom?.enabled || !clipEffects.zoom.blocks?.length) return null

                const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH

                return clipEffects.zoom.blocks.map((block: ZoomBlock) => (
                  <TimelineZoomBlock
                    key={block.id}
                    blockId={block.id}
                    x={clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)}
                    y={rulerHeight + videoTrackHeight + TIMELINE_LAYOUT.TRACK_PADDING}
                    width={TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)}
                    height={zoomTrackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
                    startTime={block.startTime}
                    endTime={block.endTime}
                    scale={block.scale}
                    isSelected={isSelectedClip && selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id === block.id}
                    allBlocks={clipEffects.zoom.blocks || []}
                    clipX={clipX}
                    pixelsPerMs={pixelsPerMs}
                    onSelect={() => {
                      selectClip(clip.id) // Select the clip
                      selectEffectLayer('zoom', block.id) // Select zoom block
                    }}
                    onDragEnd={(newX) => {
                      const newStartTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
                      const updates = {
                        startTime: Math.max(0, Math.min(clip.duration - (block.endTime - block.startTime), newStartTime)),
                        endTime: Math.max(0, Math.min(clip.duration, newStartTime + (block.endTime - block.startTime)))
                      }
                      // Use prop if provided, otherwise use store
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
                ))
              })
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
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-card">
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
          onSplit={(id) => splitClip(id, currentTime)}
          onTrimStart={(id) => trimClipStart(id, currentTime)}
          onTrimEnd={(id) => trimClipEnd(id, currentTime)}
          onDuplicate={duplicateClip}
          onCopy={(id) => {
            // Copy is handled by keyboard shortcuts
            console.log('Copy clip:', id)
          }}
          onDelete={removeClip}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
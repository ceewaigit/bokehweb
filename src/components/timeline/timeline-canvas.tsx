'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Group, Text } from 'react-konva'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/project'

// Sub-components
import { TimelineRuler } from './timeline-ruler'
import { TimelineClip } from './timeline-clip'
import { TimelineTrack } from './timeline-track'
import { TimelinePlayhead } from './timeline-playhead'
import { TimelineControls } from './timeline-controls'
import { TimelineContextMenu } from './timeline-context-menu'
import { TimelineZoomBlock } from './timeline-zoom-block'

// Utilities
import { TIMELINE_LAYOUT, TimelineUtils } from './timeline-constants'
import { useTimelineKeyboard } from './use-timeline-keyboard'

interface TimelineCanvasProps {
  className?: string
}

export function TimelineCanvas({ className = "h-full w-full" }: TimelineCanvasProps) {
  const {
    currentProject,
    selectedClips,
    currentTime,
    isPlaying,
    zoom,
    seek,
    play,
    pause,
    setZoom,
    selectClip,
    removeClip,
    updateClip,
    updateZoomBlock,
    addZoomBlock,
    removeZoomBlock,
    addClip,
    clearSelection,
    splitClip,
    trimClipStart,
    trimClipEnd,
    duplicateClip
  } = useProjectStore()

  const [stageSize, setStageSize] = useState({ width: 800, height: 400 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [copiedClip, setCopiedClip] = useState<Clip | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate timeline dimensions
  const duration = currentProject?.timeline?.duration || 10000
  const pixelsPerMs = TimelineUtils.calculatePixelsPerMs(stageSize.width, zoom)
  const timelineWidth = TimelineUtils.calculateTimelineWidth(duration, pixelsPerMs, stageSize.width)
  const hasZoomTrack = selectedClips.length > 0 &&
    currentProject?.timeline.tracks.find(t => t.type === 'video')?.clips.some(
      c => selectedClips.includes(c.id) && c.effects?.zoom?.enabled
    )
  const totalHeight = TimelineUtils.getTotalHeight(hasZoomTrack)

  // Use keyboard shortcuts
  useTimelineKeyboard({
    isPlaying,
    selectedClips,
    currentTime,
    play,
    pause,
    splitClip,
    removeClip,
    duplicateClip,
    clearSelection
  })

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        // Use full container dimensions
        setStageSize({ width: rect.width, height: Math.max(400, rect.height - 60) })  // Leave room for controls
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || !currentProject) return

    let animationFrameId: number
    let lastTimestamp: number | null = null

    const animate = (timestamp: number) => {
      if (lastTimestamp === null) {
        lastTimestamp = timestamp
      }

      const deltaTime = timestamp - lastTimestamp
      lastTimestamp = timestamp

      // Update current time based on elapsed time
      const newTime = currentTime + deltaTime

      // Check if we've reached the end
      if (newTime >= currentProject.timeline.duration) {
        pause()
        seek(currentProject.timeline.duration)
      } else {
        seek(newTime)
        animationFrameId = requestAnimationFrame(animate)
      }
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isPlaying, currentTime, currentProject, seek, pause])

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
    selectClip(clipId)
  }, [selectClip])

  // Handle clip drag
  const handleClipDragEnd = useCallback((clipId: string, newStartTime: number) => {
    updateClip(clipId, { startTime: newStartTime })
  }, [updateClip])

  // Get clip by ID
  const getClipById = useCallback((clipId: string) => {
    if (!currentProject) return null
    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return clip
    }
    return null
  }, [currentProject])

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

  const handleCopy = useCallback(() => {
    if (selectedClips.length === 1) {
      const clip = getClipById(selectedClips[0])
      if (clip) setCopiedClip(clip)
    }
  }, [selectedClips, getClipById])

  const handlePaste = useCallback(() => {
    if (copiedClip) {
      const newClip: Clip = {
        ...copiedClip,
        id: `${copiedClip.id}-copy-${Date.now()}`,
        startTime: currentTime
      }
      addClip(newClip)
      selectClip(newClip.id)
    }
  }, [copiedClip, currentTime, addClip, selectClip])

  const handleDuplicate = useCallback(() => {
    if (selectedClips.length === 1) {
      duplicateClip(selectedClips[0])
    }
  }, [selectedClips, duplicateClip])

  // Stage click handler
  const handleStageClick = useCallback((e: any) => {
    if (e.target === e.target.getStage()) {
      const x = e.evt.offsetX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
      if (x > 0) {
        const time = TimelineUtils.pixelToTime(x, pixelsPerMs)
        const maxTime = currentProject?.timeline?.duration || 0
        seek(Math.max(0, Math.min(maxTime, time)))
      }
    }
  }, [currentProject, pixelsPerMs, seek])

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
        copiedClip={!!copiedClip}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onZoomChange={setZoom}
        onSplit={handleSplit}
        onTrimStart={handleTrimStart}
        onTrimEnd={handleTrimEnd}
        onDelete={handleDelete}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDuplicate={handleDuplicate}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <Stage
          width={stageSize.width}
          height={Math.max(totalHeight, stageSize.height)}
          onMouseDown={handleStageClick}
        >
          {/* Background Layer */}
          <Layer>
            <Rect
              x={0}
              y={0}
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
              height={TIMELINE_LAYOUT.RULER_HEIGHT}
              fill="#0f0f23"
            />

            <TimelineTrack
              type="video"
              y={TimelineUtils.getTrackY('video')}
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
              height={TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT}
            />

            {hasZoomTrack && (
              <TimelineTrack
                type="zoom"
                y={TimelineUtils.getTrackY('zoom')}
                width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
                height={TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT}
              />
            )}

            <TimelineTrack
              type="audio"
              y={TimelineUtils.getTrackY('audio', hasZoomTrack)}
              width={timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
              height={TIMELINE_LAYOUT.AUDIO_TRACK_HEIGHT}
            />
          </Layer>

          {/* Ruler Layer */}
          <Layer>
            <TimelineRuler
              duration={currentProject.timeline.duration}
              zoom={zoom}
              pixelsPerMs={pixelsPerMs}
            />
          </Layer>

          {/* Clips Layer */}
          <Layer>
            {/* Video clips */}
            {currentProject.timeline.tracks
              .find(t => t.type === 'video')
              ?.clips.map(clip => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType="video"
                  trackY={TimelineUtils.getTrackY('video')}
                  pixelsPerMs={pixelsPerMs}
                  isSelected={selectedClips.includes(clip.id)}
                  onSelect={handleClipSelect}
                  onDragEnd={handleClipDragEnd}
                  onContextMenu={handleClipContextMenu}
                />
              ))}

            {/* Zoom blocks - draggable */}
            {hasZoomTrack && selectedClips.length > 0 && (() => {
              const selectedClip = currentProject.timeline.tracks
                .find(t => t.type === 'video')
                ?.clips.find(c => selectedClips.includes(c.id))

              if (!selectedClip?.effects?.zoom?.enabled) return null

              const clipX = TimelineUtils.timeToPixel(selectedClip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
              
              return selectedClip.effects.zoom.blocks?.map(block => (
                <TimelineZoomBlock
                  key={block.id}
                  x={clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)}
                  y={TimelineUtils.getTrackY('zoom')}
                  width={TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)}
                  height={TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT}
                  startTime={block.startTime}
                  endTime={block.endTime}
                  introMs={block.introMs}
                  outroMs={block.outroMs}
                  scale={block.scale}
                  isSelected={false}
                  onSelect={() => {}}
                  onDragEnd={(newX) => {
                    const newStartTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
                    updateZoomBlock(selectedClip.id, block.id, { 
                      startTime: newStartTime,
                      endTime: newStartTime + (block.endTime - block.startTime)
                    })
                  }}
                  onResize={(newWidth, side) => {
                    if (side === 'right') {
                      updateZoomBlock(selectedClip.id, block.id, {
                        endTime: block.startTime + TimelineUtils.pixelToTime(newWidth, pixelsPerMs)
                      })
                    }
                  }}
                  onIntroChange={(newIntroMs) => {
                    updateZoomBlock(selectedClip.id, block.id, { introMs: newIntroMs })
                  }}
                  onOutroChange={(newOutroMs) => {
                    updateZoomBlock(selectedClip.id, block.id, { outroMs: newOutroMs })
                  }}
                />
              ))
            })()}

            {/* Audio clips */}
            {currentProject.timeline.tracks
              .find(t => t.type === 'audio')
              ?.clips.map(clip => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  trackType="audio"
                  trackY={TimelineUtils.getTrackY('audio', hasZoomTrack)}
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
              totalHeight={totalHeight}
              pixelsPerMs={pixelsPerMs}
              timelineWidth={timelineWidth}
              maxTime={currentProject.timeline.duration}
              onSeek={seek}
            />
          </Layer>
        </Stage>
      </div>

      {/* Timeline Info */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{selectedClips.length} clip(s) selected</span>
        <span>
          {TimelineUtils.formatTime(currentTime)} / {TimelineUtils.formatTime(currentProject.timeline.duration)}
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
            const clip = getClipById(id)
            if (clip) setCopiedClip(clip)
          }}
          onDelete={removeClip}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
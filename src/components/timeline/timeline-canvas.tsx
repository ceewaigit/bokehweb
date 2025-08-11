'use client'

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { useProjectStore } from '@/stores/project-store'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  Clipboard,
  ChevronsLeft,
  ChevronsRight,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/project'
import { RecordingStorage } from '@/lib/storage/recording-storage'

interface TimelineCanvasProps {
  className?: string
}

// Constants for timeline layout
const RULER_HEIGHT = 32
const TRACK_LABEL_WIDTH = 80
const VIDEO_TRACK_HEIGHT = 120
const AUDIO_TRACK_HEIGHT = 60
const ZOOM_TRACK_HEIGHT = 48
const TRACK_PADDING = 4
const MIN_CLIP_WIDTH = 40
const SNAP_THRESHOLD = 10 // pixels
const SNAP_INTERVAL = 100 // milliseconds

export function TimelineCanvas({ className = "h-[400px]" }: TimelineCanvasProps) {
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
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, HTMLImageElement>>(new Map())

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const playheadRef = useRef<Konva.Line>(null)

  // Calculate timeline dimensions
  const duration = currentProject?.timeline?.duration
    ? Math.max(10000, currentProject.timeline.duration + 500)
    : 10000

  // Improved scaling: At zoom 1.0, show 10 seconds in viewport width
  // This gives much better default visibility for clips
  const basePixelsPerMs = (stageSize.width - TRACK_LABEL_WIDTH) / 10000 // pixels per ms for 10 second view
  const pixelsPerMs = basePixelsPerMs * zoom
  const timelineWidth = Math.max(duration * pixelsPerMs, stageSize.width - TRACK_LABEL_WIDTH)

  // Convert time to pixel position
  const timeToPixel = useCallback((time: number) => time * pixelsPerMs, [pixelsPerMs])

  // Convert pixel position to time
  const pixelToTime = useCallback((pixel: number) => pixel / pixelsPerMs, [pixelsPerMs])

  // Snap time to nearest interval
  const snapToGrid = useCallback((time: number) => {
    return Math.round(time / SNAP_INTERVAL) * SNAP_INTERVAL
  }, [])

  // Get clip by ID
  const getClipById = useCallback((clipId: string) => {
    if (!currentProject) return null
    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return { clip, track }
    }
    return null
  }, [currentProject])

  // Generate thumbnail for clip
  const generateThumbnail = useCallback(async (recordingId: string, timestamp: number) => {
    const cacheKey = `${recordingId}-${Math.floor(timestamp / 1000)}`
    if (thumbnailCache.has(cacheKey)) {
      return thumbnailCache.get(cacheKey)
    }

    const blobUrl = RecordingStorage.getBlobUrl(recordingId)
    if (!blobUrl) return null

    return new Promise<HTMLImageElement | null>((resolve) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true

      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 90

      video.addEventListener('loadedmetadata', () => {
        video.currentTime = timestamp / 1000
      })

      video.addEventListener('seeked', () => {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = new window.Image()
          img.onload = () => {
            setThumbnailCache(prev => new Map(prev).set(cacheKey, img))
            resolve(img)
          }
          img.src = canvas.toDataURL()
        }
        video.remove()
      })

      video.addEventListener('error', () => {
        video.remove()
        resolve(null)
      })

      video.src = blobUrl
      video.load()
    })
  }, [thumbnailCache])

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height - 200 }) // Account for controls
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Auto-scroll during playback
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return

    const playheadX = timeToPixel(currentTime)
    const container = containerRef.current
    const scrollWidth = container.scrollWidth - container.clientWidth

    if (playheadX > scrollLeft + stageSize.width - 100) {
      const newScroll = Math.min(scrollWidth, playheadX - 100)
      container.scrollLeft = newScroll
      setScrollLeft(newScroll)
    }
  }, [currentTime, isPlaying, timeToPixel, scrollLeft, stageSize.width])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        isPlaying ? pause() : play()
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (selectedClips.length === 1) {
          splitClip(selectedClips[0], currentTime)
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        selectedClips.forEach(clipId => removeClip(clipId))
        clearSelection()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedClips.length === 1) {
          duplicateClip(selectedClips[0])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTime, selectedClips, isPlaying, play, pause, splitClip, removeClip, clearSelection, duplicateClip])

  // Render timeline ruler
  const renderRuler = useMemo(() => {
    const marks: React.ReactNode[] = []

    let majorInterval = 1000
    let minorInterval = 100

    if (zoom < 0.5) {
      majorInterval = 5000
      minorInterval = 1000
    } else if (zoom < 1) {
      majorInterval = 2000
      minorInterval = 500
    } else if (zoom > 2) {
      majorInterval = 1000
      minorInterval = 50
    }

    const maxRulerTime = currentProject?.timeline?.duration || 0

    for (let time = 0; time <= maxRulerTime; time += minorInterval) {
      const isMajor = time % majorInterval === 0
      const x = timeToPixel(time) + TRACK_LABEL_WIDTH

      marks.push(
        <Line
          key={`mark-${time}`}
          points={[x, RULER_HEIGHT - (isMajor ? 16 : 8), x, RULER_HEIGHT]}
          stroke="#666"
          strokeWidth={isMajor ? 2 : 1}
        />
      )

      if (isMajor) {
        marks.push(
          <Text
            key={`label-${time}`}
            x={x + 4}
            y={4}
            text={time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(1)}s`}
            fontSize={11}
            fill="#999"
          />
        )
      }
    }

    return marks
  }, [zoom, currentProject, timeToPixel])

  // Render clips
  const renderClips = useCallback(() => {
    if (!currentProject) return null

    const clips: React.ReactNode[] = []

    // Calculate track positions
    const videoTrackY = RULER_HEIGHT
    const zoomTrackY = videoTrackY + VIDEO_TRACK_HEIGHT
    const audioTrackY = selectedClips.length > 0 &&
      currentProject.timeline.tracks.find(t => t.type === 'video')?.clips.find(c =>
        selectedClips.includes(c.id) && c.effects?.zoom?.enabled
      ) ? zoomTrackY + ZOOM_TRACK_HEIGHT : videoTrackY + VIDEO_TRACK_HEIGHT

    // Video track clips
    const videoTrack = currentProject.timeline.tracks.find(t => t.type === 'video')
    if (videoTrack) {
      videoTrack.clips.forEach(clip => {
        const clipX = timeToPixel(clip.startTime) + TRACK_LABEL_WIDTH
        const clipWidth = Math.max(MIN_CLIP_WIDTH, timeToPixel(clip.duration))
        const isSelected = selectedClips.includes(clip.id)
        const trackY = videoTrackY // Capture the correct Y position

        clips.push(
          <Group
            key={clip.id}
            x={clipX}
            y={trackY + TRACK_PADDING}
            draggable
            dragBoundFunc={(pos) => {
              const newX = Math.max(TRACK_LABEL_WIDTH, pos.x)
              const newTime = snapToGrid(pixelToTime(newX - TRACK_LABEL_WIDTH))
              return {
                x: timeToPixel(newTime) + TRACK_LABEL_WIDTH,
                y: trackY + TRACK_PADDING // Use captured Y position
              }
            }}
            onDragEnd={(e) => {
              const newX = e.target.x()
              const newTime = pixelToTime(newX - TRACK_LABEL_WIDTH)
              updateClip(clip.id, { startTime: Math.max(0, newTime) })
            }}
            onClick={() => selectClip(clip.id)}
            onContextMenu={(e) => {
              e.evt.preventDefault()
              setContextMenu({
                x: e.evt.clientX,
                y: e.evt.clientY,
                clipId: clip.id
              })
            }}
          >
            <Rect
              width={clipWidth}
              height={VIDEO_TRACK_HEIGHT - TRACK_PADDING * 2}
              fill="#2563eb"
              stroke={isSelected ? '#60a5fa' : '#1e40af'}
              strokeWidth={isSelected ? 3 : 1}
              cornerRadius={6}
              shadowColor="black"
              shadowBlur={5}
              shadowOpacity={0.3}
              shadowOffsetY={2}
            />

            {/* Clip label */}
            <Text
              x={8}
              y={VIDEO_TRACK_HEIGHT - TRACK_PADDING * 2 - 20}
              text={`Clip ${clip.id.slice(-4)}`}
              fontSize={12}
              fill="white"
              fontStyle="bold"
            />

            {/* Effect badges with proper text centering */}
            {clip.effects?.zoom?.enabled && (
              <Group x={8} y={8}>
                <Rect
                  width={50}
                  height={20}
                  fill="rgba(59, 130, 246, 0.9)"
                  cornerRadius={3}
                />
                <Text
                  x={4}
                  y={5}  // Vertically center text
                  text="Zoom"
                  fontSize={10}
                  fill="white"
                />
              </Group>
            )}

            {clip.effects?.cursor?.visible && (
              <Group x={clip.effects?.zoom?.enabled ? 64 : 8} y={8}>
                <Rect
                  width={50}
                  height={20}
                  fill="rgba(34, 197, 94, 0.9)"
                  cornerRadius={3}
                />
                <Text
                  x={4}
                  y={5}  // Vertically center text
                  text="Cursor"
                  fontSize={10}
                  fill="white"
                />
              </Group>
            )}

            {clip.effects?.background?.type && clip.effects.background.type !== 'none' && (
              <Group x={8} y={32}>
                <Rect
                  width={35}
                  height={20}
                  fill="rgba(168, 85, 247, 0.9)"
                  cornerRadius={3}
                />
                <Text
                  x={4}
                  y={5}  // Vertically center text
                  text="BG"
                  fontSize={10}
                  fill="white"
                />
              </Group>
            )}
          </Group>
        )
      })
    }

    // Zoom track visualization - show zoom regions as rectangles
    if (selectedClips.length > 0) {
      const selectedClip = videoTrack?.clips.find(c => selectedClips.includes(c.id))
      if (selectedClip?.effects?.zoom?.enabled && selectedClip.effects.zoom.keyframes.length > 0) {
        const clipX = timeToPixel(selectedClip.startTime) + TRACK_LABEL_WIDTH
        const keyframes = selectedClip.effects.zoom.keyframes

        // Create zoom regions between keyframes
        for (let i = 0; i < keyframes.length - 1; i++) {
          const startKf = keyframes[i]
          const endKf = keyframes[i + 1]

          // Only show rectangles for zoomed-in regions (zoom > 1)
          if (startKf.zoom > 1 || endKf.zoom > 1) {
            const startX = timeToPixel(selectedClip.startTime + startKf.time) + TRACK_LABEL_WIDTH
            const endX = timeToPixel(selectedClip.startTime + endKf.time) + TRACK_LABEL_WIDTH
            const width = endX - startX

            // Calculate average zoom level for opacity
            const avgZoom = (startKf.zoom + endKf.zoom) / 2
            const opacity = Math.min(0.6, (avgZoom - 1) * 0.3 + 0.2)

            clips.push(
              <Group key={`zoom-region-${i}`}>
                <Rect
                  x={startX}
                  y={zoomTrackY + 4}
                  width={width}
                  height={ZOOM_TRACK_HEIGHT - 8}
                  fill="rgba(59, 130, 246, 0.8)"
                  opacity={opacity}
                  cornerRadius={4}
                />
                <Text
                  x={startX + 4}
                  y={zoomTrackY + ZOOM_TRACK_HEIGHT / 2 - 6}
                  text={`${avgZoom.toFixed(1)}x`}
                  fontSize={10}
                  fill="white"
                  opacity={0.9}
                />
              </Group>
            )
          }
        }
      }
    }

    // Audio track clips
    const audioTrack = currentProject.timeline.tracks.find(t => t.type === 'audio')
    if (audioTrack) {
      audioTrack.clips.forEach(clip => {
        const clipX = timeToPixel(clip.startTime) + TRACK_LABEL_WIDTH
        const clipWidth = Math.max(MIN_CLIP_WIDTH, timeToPixel(clip.duration))
        const isSelected = selectedClips.includes(clip.id)
        const trackY = audioTrackY // Capture the correct Y position

        clips.push(
          <Group
            key={clip.id}
            x={clipX}
            y={trackY + TRACK_PADDING}
            draggable
            dragBoundFunc={(pos) => {
              const newX = Math.max(TRACK_LABEL_WIDTH, pos.x)
              const newTime = snapToGrid(pixelToTime(newX - TRACK_LABEL_WIDTH))
              return {
                x: timeToPixel(newTime) + TRACK_LABEL_WIDTH,
                y: trackY + TRACK_PADDING // Use captured Y position
              }
            }}
            onDragEnd={(e) => {
              const newX = e.target.x()
              const newTime = pixelToTime(newX - TRACK_LABEL_WIDTH)
              updateClip(clip.id, { startTime: Math.max(0, newTime) })
            }}
            onClick={() => selectClip(clip.id)}
          >
            <Rect
              width={clipWidth}
              height={AUDIO_TRACK_HEIGHT - TRACK_PADDING * 2}
              fill="#10b981"
              stroke={isSelected ? '#34d399' : '#059669'}
              strokeWidth={isSelected ? 3 : 1}
              cornerRadius={4}
              shadowColor="black"
              shadowBlur={3}
              shadowOpacity={0.2}
              shadowOffsetY={1}
            />
            <Text
              x={8}
              y={8}
              text={`Audio ${clip.id.slice(-4)}`}
              fontSize={12}
              fill="white"
            />
          </Group>
        )
      })
    }

    return clips
  }, [currentProject, selectedClips, timeToPixel, pixelToTime, selectClip, updateClip, snapToGrid])

  // Render track backgrounds and labels
  const renderTracks = useMemo(() => {
    const tracks: React.ReactNode[] = []
    let yOffset = RULER_HEIGHT

    // Video track
    tracks.push(
      <Group key="video-track">
        <Rect
          x={0}
          y={yOffset}
          width={timelineWidth + TRACK_LABEL_WIDTH}
          height={VIDEO_TRACK_HEIGHT}
          fill="#0a0a0f"
          opacity={0.8}
        />
        <Rect
          x={0}
          y={yOffset}
          width={TRACK_LABEL_WIDTH}
          height={VIDEO_TRACK_HEIGHT}
          fill="#1a1a2e"
        />
        <Text
          x={10}
          y={yOffset + VIDEO_TRACK_HEIGHT / 2 - 6}
          text="Video"
          fontSize={12}
          fill="#e2e8f0"
        />
      </Group>
    )
    yOffset += VIDEO_TRACK_HEIGHT

    // Zoom track (conditional)
    if (selectedClips.length > 0) {
      tracks.push(
        <Group key="zoom-track">
          <Rect
            x={0}
            y={yOffset}
            width={timelineWidth + TRACK_LABEL_WIDTH}
            height={ZOOM_TRACK_HEIGHT}
            fill="rgba(59, 130, 246, 0.08)"
          />
          <Rect
            x={0}
            y={yOffset}
            width={TRACK_LABEL_WIDTH}
            height={ZOOM_TRACK_HEIGHT}
            fill="#1a1a2e"
          />
          <Text
            x={10}
            y={yOffset + ZOOM_TRACK_HEIGHT / 2 - 6}
            text="Zoom"
            fontSize={11}
            fill="#60a5fa"
            fontStyle="italic"
          />
        </Group>
      )
      yOffset += ZOOM_TRACK_HEIGHT
    }

    // Audio track
    tracks.push(
      <Group key="audio-track">
        <Rect
          x={0}
          y={yOffset}
          width={timelineWidth + TRACK_LABEL_WIDTH}
          height={AUDIO_TRACK_HEIGHT}
          fill="#0a0a0f"
          opacity={0.6}
        />
        <Rect
          x={0}
          y={yOffset}
          width={TRACK_LABEL_WIDTH}
          height={AUDIO_TRACK_HEIGHT}
          fill="#1a1a2e"
        />
        <Text
          x={10}
          y={yOffset + AUDIO_TRACK_HEIGHT / 2 - 6}
          text="Audio"
          fontSize={12}
          fill="#e2e8f0"
        />
      </Group>
    )

    return tracks
  }, [timelineWidth, selectedClips.length])

  // Calculate total height
  const totalHeight = RULER_HEIGHT + VIDEO_TRACK_HEIGHT + AUDIO_TRACK_HEIGHT +
    (selectedClips.length > 0 ? ZOOM_TRACK_HEIGHT : 0)

  if (!currentProject) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50 rounded-lg", className)}>
        <p className="text-muted-foreground">No project loaded</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col bg-background border border-border rounded-lg", className)}>
      {/* Timeline Controls */}
      <div className="flex items-center justify-between p-2 border-b border-border">
        <div className="flex items-center space-x-2">
          {/* Playback Controls */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => seek(Math.max(0, currentTime - 1000))}
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => isPlaying ? pause() : play()}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const maxTime = currentProject?.timeline?.duration || 0
              seek(Math.min(maxTime, currentTime + 1000))
            }}
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Edit Controls */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClips.length === 1 && splitClip(selectedClips[0], currentTime)}
            disabled={selectedClips.length !== 1}
            title="Split at playhead (S)"
          >
            <Scissors className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClips.length === 1 && trimClipStart(selectedClips[0], currentTime)}
            disabled={selectedClips.length !== 1}
            title="Trim start to playhead (Q)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClips.length === 1 && trimClipEnd(selectedClips[0], currentTime)}
            disabled={selectedClips.length !== 1}
            title="Trim end to playhead (W)"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              selectedClips.forEach(clipId => removeClip(clipId))
              clearSelection()
            }}
            disabled={selectedClips.length === 0}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (selectedClips.length === 1) {
                const result = getClipById(selectedClips[0])
                if (result) setCopiedClip(result.clip)
              }
            }}
            disabled={selectedClips.length !== 1}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (copiedClip) {
                const newClip: Clip = {
                  ...copiedClip,
                  id: `${copiedClip.id}-copy-${Date.now()}`,
                  startTime: currentTime
                }
                addClip(newClip)
                selectClip(newClip.id)
              }
            }}
            disabled={!copiedClip}
          >
            <Clipboard className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClips.length === 1 && duplicateClip(selectedClips[0])}
            disabled={selectedClips.length !== 1}
            title="Duplicate (Cmd/Ctrl+D)"
          >
            <Layers className="w-4 h-4" />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Slider
            value={[zoom]}
            onValueChange={([value]) => setZoom(value)}
            min={0.1}
            max={3}
            step={0.05}
            className="w-32"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(Math.min(3, zoom + 0.1))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas Timeline */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        style={{ minHeight: '200px', maxHeight: '600px' }}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={Math.max(totalHeight, stageSize.height)}
          onMouseDown={(e) => {
            // Click on empty space to seek
            if (e.target === e.target.getStage()) {
              const x = e.evt.offsetX - TRACK_LABEL_WIDTH
              if (x > 0) {
                const time = pixelToTime(x)
                const maxTime = currentProject?.timeline?.duration || 0
                seek(Math.max(0, Math.min(maxTime, time)))
              }
            }
          }}
        >
          {/* Background Layer */}
          <Layer>
            {/* Ruler background */}
            <Rect
              x={0}
              y={0}
              width={timelineWidth + TRACK_LABEL_WIDTH}
              height={RULER_HEIGHT}
              fill="#0f0f23"
            />

            {/* Track backgrounds with darker colors */}
            {renderTracks}
          </Layer>

          {/* Ruler Layer */}
          <Layer>
            {renderRuler}
          </Layer>

          {/* Clips Layer */}
          <Layer>
            {renderClips()}
          </Layer>

          {/* Playhead Layer - On top for visibility */}
          <Layer>
            {/* Draggable group for entire playhead */}
            <Group
              x={timeToPixel(currentTime) + TRACK_LABEL_WIDTH}
              y={0}
              draggable
              dragBoundFunc={(pos) => {
                const newX = Math.max(TRACK_LABEL_WIDTH, Math.min(timelineWidth + TRACK_LABEL_WIDTH, pos.x))
                return {
                  x: newX,
                  y: 0
                }
              }}
              onDragMove={(e) => {
                const newX = e.target.x() - TRACK_LABEL_WIDTH
                const time = pixelToTime(newX)
                const maxTime = currentProject?.timeline?.duration || 0
                seek(Math.max(0, Math.min(maxTime, time)))
              }}
            >
              {/* Playhead shadow for better visibility */}
              <Line
                points={[1, 0, 1, totalHeight]}
                stroke="rgba(0, 0, 0, 0.5)"
                strokeWidth={3}
                listening={false}
              />
              {/* Main playhead line */}
              <Line
                ref={playheadRef}
                points={[0, 0, 0, totalHeight]}
                stroke="#dc2626"
                strokeWidth={2}
                hitStrokeWidth={10} // Larger hit area for easier dragging
              />
              {/* Playhead handle - diamond shape at top */}
              <Rect
                x={-7}
                y={-2}
                width={14}
                height={14}
                fill="#dc2626"
                rotation={45}
                shadowColor="black"
                shadowBlur={3}
                shadowOpacity={0.5}
              />
            </Group>
          </Layer>
        </Stage>
      </div>

      {/* Timeline Info */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{selectedClips.length} clip(s) selected</span>
        <span>{(currentTime / 1000).toFixed(2)}s / {((currentProject?.timeline?.duration || 0) / 1000).toFixed(2)}s</span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-popover border border-border rounded-md shadow-md p-1 z-[100]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => {
              splitClip(contextMenu.clipId, currentTime)
              setContextMenu(null)
            }}
          >
            <Scissors className="w-4 h-4 mr-2" />
            Split at Playhead
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => {
              trimClipStart(contextMenu.clipId, currentTime)
              setContextMenu(null)
            }}
          >
            <ChevronsLeft className="w-4 h-4 mr-2" />
            Trim Start
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => {
              trimClipEnd(contextMenu.clipId, currentTime)
              setContextMenu(null)
            }}
          >
            <ChevronsRight className="w-4 h-4 mr-2" />
            Trim End
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => {
              duplicateClip(contextMenu.clipId)
              setContextMenu(null)
            }}
          >
            <Layers className="w-4 h-4 mr-2" />
            Duplicate
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => {
              const result = getClipById(contextMenu.clipId)
              if (result) setCopiedClip(result.clip)
              setContextMenu(null)
            }}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-sm"
            onClick={() => {
              removeClip(contextMenu.clipId)
              setContextMenu(null)
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
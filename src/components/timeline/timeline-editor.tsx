'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
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
  MousePointer,
  Search,
  Palette,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/project'
import { VideoThumbnail } from './video-thumbnail'

interface TimelineEditorProps {
  className?: string
}

export function TimelineEditor({ className = "h-80" }: TimelineEditorProps) {
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

  const [isDragging, setIsDragging] = useState(false)
  const [draggedClip, setDraggedClip] = useState<string | null>(null)
  const [copiedClip, setCopiedClip] = useState<Clip | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)

  // Use timeline duration directly, add padding for better UX
  const duration = currentProject?.timeline?.duration 
    ? Math.max(10000, currentProject.timeline.duration + 500) 
    : 10000

  // Calculate pixels per millisecond - at zoom 1.0, we want 100px per second (0.1px per ms)
  // But that's too small, so let's use a more reasonable scale: 200px per second at zoom 1.0
  const pixelsPerMs = zoom * 0.2 // At zoom 1: 200px/sec, zoom 2: 400px/sec, etc.
  const timelineWidth = Math.max(duration * pixelsPerMs, 800) // Minimum width for usability

  // Render zoom track (like Screen Studio)
  const renderZoomTrack = () => {
    if (!currentProject || !selectedClips.length) return null

    // Get the first selected clip
    const selectedClip = currentProject.timeline.tracks
      .flatMap(t => t.clips)
      .find(c => selectedClips.includes(c.id))

    if (!selectedClip || !selectedClip.effects?.zoom?.enabled) return null

    const clipX = timeToPixel(selectedClip.startTime)
    const clipWidth = timeToPixel(selectedClip.duration)

    // Generate zoom visualization
    const zoomKeyframes = selectedClip.effects.zoom.keyframes || []

    return (
      <div
        className="absolute h-12 bg-blue-500/10 border border-blue-500/30 rounded"
        style={{
          left: `${clipX}px`,
          width: `${clipWidth}px`,
          top: '4px'
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          {/* Zoom level visualization */}
          <svg className="w-full h-full">
            <polyline
              points={zoomKeyframes.map((kf, i) => {
                const x = (kf.time / selectedClip.duration) * clipWidth
                const y = 12 - (kf.zoom * 6) // Invert and scale
                return `${x},${y}`
              }).join(' ')}
              fill="none"
              stroke="rgb(59, 130, 246)"
              strokeWidth="2"
            />
            {/* Keyframe dots */}
            {zoomKeyframes.map((kf, i) => {
              const x = (kf.time / selectedClip.duration) * clipWidth
              const y = 12 - (kf.zoom * 6)
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="rgb(59, 130, 246)"
                  className="cursor-move hover:r-4"
                />
              )
            })}
          </svg>
        </div>
        <div className="absolute top-0 left-2 text-[10px] text-blue-500 font-medium">
          Zoom
        </div>
      </div>
    )
  }



  // Convert time to pixel position
  const timeToPixel = (time: number) => time * pixelsPerMs

  // Convert pixel position to time
  const pixelToTime = (pixel: number) => pixel / pixelsPerMs

  // Get all clips from all tracks
  const getAllClips = useCallback(() => {
    if (!currentProject) return []
    const clips: Clip[] = []
    for (const track of currentProject.timeline.tracks) {
      clips.push(...track.clips)
    }
    return clips
  }, [currentProject])

  // Get clip by ID
  const getClipById = useCallback((clipId: string) => {
    if (!currentProject) return null
    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return clip
    }
    return null
  }, [currentProject])

  // Handle timeline click for playhead positioning
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || isDraggingPlayhead) return

    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)
    const time = pixelToTime(x)
    seek(Math.max(0, Math.min(duration, time)))
  }

  // Split clip at current time
  const handleSplitClip = useCallback(() => {
    if (selectedClips.length !== 1) return
    const clipId = selectedClips[0]
    splitClip(clipId, currentTime)
  }, [selectedClips, currentTime, splitClip])

  // Trim clip start to current time
  const handleTrimStart = useCallback(() => {
    if (selectedClips.length !== 1) return
    const clipId = selectedClips[0]
    trimClipStart(clipId, currentTime)
  }, [selectedClips, currentTime, trimClipStart])

  // Trim clip end to current time
  const handleTrimEnd = useCallback(() => {
    if (selectedClips.length !== 1) return
    const clipId = selectedClips[0]
    trimClipEnd(clipId, currentTime)
  }, [selectedClips, currentTime, trimClipEnd])

  // Copy selected clip
  const handleCopyClip = useCallback(() => {
    if (selectedClips.length !== 1) return
    const clipId = selectedClips[0]
    const clip = getClipById(clipId)
    if (clip) {
      setCopiedClip(clip)
    }
  }, [selectedClips, getClipById])

  // Paste clip
  const handlePasteClip = useCallback(() => {
    if (!copiedClip) return

    const newClip: Clip = {
      ...copiedClip,
      id: `${copiedClip.id}-copy-${Date.now()}`,
      startTime: currentTime
    }

    addClip(newClip)
    selectClip(newClip.id)
  }, [copiedClip, currentTime, addClip, selectClip])

  // Delete selected clips
  const handleDeleteClips = useCallback(() => {
    selectedClips.forEach(clipId => {
      removeClip(clipId)
    })
    clearSelection()
  }, [selectedClips, removeClip, clearSelection])

  // Duplicate selected clip
  const handleDuplicateClip = useCallback(() => {
    if (selectedClips.length !== 1) return
    const clipId = selectedClips[0]
    const newClipId = duplicateClip(clipId)
    if (newClipId) {
      selectClip(newClipId)
    }
  }, [selectedClips, duplicateClip, selectClip])

  // Handle clip drag start
  const handleClipDragStart = (clipId: string) => {
    setIsDragging(true)
    setDraggedClip(clipId)
  }

  // Handle clip drag end
  const handleClipDragEnd = () => {
    setIsDragging(false)
    setDraggedClip(null)
  }

  // Handle clip drop
  const handleClipDrop = (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault()
    if (!draggedClip) return

    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)
    const newStartTime = pixelToTime(x)

    updateClip(draggedClip, {
      startTime: Math.max(0, newStartTime)
    })

    handleClipDragEnd()
  }

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, clipId })

    // Select the clip if not already selected
    if (!selectedClips.includes(clipId)) {
      selectClip(clipId)
    }
  }

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Handle context menu actions
  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu) return

    const clipId = contextMenu.clipId

    switch (action) {
      case 'split':
        splitClip(clipId, currentTime)
        break
      case 'trim-start':
        trimClipStart(clipId, currentTime)
        break
      case 'trim-end':
        trimClipEnd(clipId, currentTime)
        break
      case 'duplicate':
        duplicateClip(clipId)
        break
      case 'copy':
        const clip = getClipById(clipId)
        if (clip) setCopiedClip(clip)
        break
      case 'delete':
        removeClip(clipId)
        break
    }

    closeContextMenu()
  }, [contextMenu, currentTime, splitClip, trimClipStart, trimClipEnd, duplicateClip, removeClip, getClipById, closeContextMenu])

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu()
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu, closeContextMenu])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're not typing in an input field
      if ((e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
        return
      }

      // Split at playhead (S)
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handleSplitClip()
      }
      // Trim start to playhead (Q)
      else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        handleTrimStart()
      }
      // Trim end to playhead (W)
      else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        handleTrimEnd()
      }
      // Delete selected clips (Delete or Backspace)
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteClips()
      }
      // Duplicate clip (Cmd/Ctrl+D)
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        handleDuplicateClip()
      }
      // Copy clip (Cmd/Ctrl+C)
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        handleCopyClip()
      }
      // Paste clip (Cmd/Ctrl+V)
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        handlePasteClip()
      }
      // Play/Pause (Space)
      else if (e.key === ' ') {
        e.preventDefault()
        isPlaying ? pause() : play()
      }
      // Jump backward (Left Arrow)
      else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) {
          // Jump 5 seconds with shift
          seek(Math.max(0, currentTime - 5000))
        } else {
          // Jump 1 second
          seek(Math.max(0, currentTime - 1000))
        }
      }
      // Jump forward (Right Arrow)
      else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) {
          // Jump 5 seconds with shift
          seek(Math.min(duration, currentTime + 5000))
        } else {
          // Jump 1 second
          seek(Math.min(duration, currentTime + 1000))
        }
      }
      // Jump to start (Home)
      else if (e.key === 'Home') {
        e.preventDefault()
        seek(0)
      }
      // Jump to end (End)
      else if (e.key === 'End') {
        e.preventDefault()
        seek(duration)
      }
      // Zoom in (=)
      else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setZoom(Math.min(3, zoom + 0.1))
      }
      // Zoom out (-)
      else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setZoom(Math.max(0.1, zoom - 0.1))
      }
      // Clear selection (Escape)
      else if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    currentTime,
    duration,
    isPlaying,
    zoom,
    handleSplitClip,
    handleTrimStart,
    handleTrimEnd,
    handleDeleteClips,
    handleDuplicateClip,
    handleCopyClip,
    handlePasteClip,
    seek,
    play,
    pause,
    setZoom,
    clearSelection
  ])

  // Scroll playhead into view and update during playback
  useEffect(() => {
    if (!playheadRef.current || !timelineRef.current) return

    const playheadX = timeToPixel(currentTime)
    const container = timelineRef.current
    const containerWidth = container.clientWidth
    const scrollLeft = container.scrollLeft

    // Auto-scroll to keep playhead visible
    if (isPlaying) {
      // During playback, smoothly follow the playhead
      if (playheadX > scrollLeft + containerWidth - 100) {
        container.scrollLeft = playheadX - 100
      } else if (playheadX < scrollLeft + 50) {
        container.scrollLeft = Math.max(0, playheadX - 50)
      }
    } else {
      // When not playing, only scroll if playhead is out of view
      if (playheadX < scrollLeft + 50) {
        container.scrollLeft = Math.max(0, playheadX - 50)
      } else if (playheadX > scrollLeft + containerWidth - 50) {
        container.scrollLeft = playheadX - containerWidth + 50
      }
    }
  }, [currentTime, isPlaying, timeToPixel])

  // Render timeline ruler with dynamic intervals based on zoom
  const renderRuler = () => {
    const marks = []

    // Adjust interval based on zoom level for better visibility
    let majorInterval = 1000 // 1 second
    let minorInterval = 100 // 100ms

    // At very low zoom, show fewer marks
    if (zoom < 0.5) {
      majorInterval = 5000 // 5 seconds
      minorInterval = 1000 // 1 second
    } else if (zoom < 1) {
      majorInterval = 2000 // 2 seconds  
      minorInterval = 500 // 500ms
    } else if (zoom > 2) {
      // At high zoom, show more detail
      majorInterval = 1000 // 1 second
      minorInterval = 50 // 50ms
    }

    for (let time = 0; time <= duration; time += minorInterval) {
      const isMajor = time % majorInterval === 0
      const x = timeToPixel(time)

      marks.push(
        <div
          key={time}
          className={cn(
            "absolute top-0",
            isMajor ? "h-4 border-l-2 border-muted-foreground" : "h-2 border-l border-muted-foreground/50"
          )}
          style={{ left: `${x}px` }}
        >
          {isMajor && (
            <span className="absolute -top-5 left-1 text-xs text-muted-foreground whitespace-nowrap">
              {time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      )
    }
    return marks
  }

  // Render clips for a track
  const renderTrackClips = (trackIndex: number, trackType: 'video' | 'audio') => {
    if (!currentProject) return null

    const track = currentProject.timeline.tracks.find(t => t.type === trackType)
    if (!track) {
      console.log(`No ${trackType} track found in project`)
      return null
    }

    console.log(`Rendering ${track.clips.length} clips for ${trackType} track`)
    return track.clips.map((clip) => {
      const clipX = timeToPixel(clip.startTime)
      const clipWidth = timeToPixel(clip.duration)
      const isSelected = selectedClips.includes(clip.id)

      return (
        <div
          key={clip.id}
          className={cn(
            "absolute top-1 bottom-1 rounded cursor-move transition-all overflow-hidden",
            trackType === 'video' ? "bg-blue-900/50" : "bg-green-900/50",
            isSelected && "ring-2 ring-primary ring-offset-1",
            isDragging && draggedClip === clip.id && "opacity-50"
          )}
          style={{
            left: `${clipX}px`,
            width: `${Math.max(clipWidth, 40)}px`, // Ensure minimum visible width
            minWidth: '40px' // Ensure clips are always visible
          }}
          draggable
          onDragStart={() => handleClipDragStart(clip.id)}
          onDragEnd={handleClipDragEnd}
          onClick={(e) => {
            e.stopPropagation()
            if (e.shiftKey) {
              selectClip(clip.id, true)
            } else {
              selectClip(clip.id)
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, clip.id)}
        >
          {trackType === 'video' ? (
            <div className="relative w-full h-full">
              {/* Video thumbnail strip */}
              <div className="absolute inset-0 flex">
                {/* Generate multiple thumbnails across the clip */}
                {Array.from({ length: Math.min(5, Math.max(1, Math.floor(clipWidth / 60))) }).map((_, i, arr) => {
                  const thumbTimestamp = clip.sourceIn + (clip.sourceOut - clip.sourceIn) * (i / arr.length)
                  return (
                    <div key={i} className="flex-1 h-full">
                      <VideoThumbnail
                        recordingId={clip.recordingId}
                        width={Math.max(80, clipWidth / arr.length)}
                        height={80}
                        timestamp={thumbTimestamp}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )
                })}
              </div>
              {/* Overlay with clip info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

              {/* Effect indicators (Screen Studio style) */}
              <div className="absolute top-1 left-1 flex gap-1">
                {clip.effects?.zoom?.enabled && (
                  <div className="bg-blue-500/80 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Zoom enabled">
                    <Search className="w-3 h-3 text-white" />
                    <span className="text-[10px] text-white font-medium">Zoom</span>
                  </div>
                )}
                {clip.effects?.cursor?.visible !== false && (
                  <div className="bg-green-500/80 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Cursor overlay">
                    <MousePointer className="w-3 h-3 text-white" />
                    <span className="text-[10px] text-white font-medium">Cursor</span>
                  </div>
                )}
                {clip.effects?.background?.type && clip.effects.background.type !== 'none' && (
                  <div className="bg-purple-500/80 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Background effect">
                    <Palette className="w-3 h-3 text-white" />
                    <span className="text-[10px] text-white font-medium">BG</span>
                  </div>
                )}
                {(clip.effects?.annotations?.length ?? 0) > 0 && (
                  <div className="bg-orange-500/80 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Annotations">
                    <Sparkles className="w-3 h-3 text-white" />
                    <span className="text-[10px] text-white font-medium">{clip.effects.annotations!.length}</span>
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 px-2 py-1">
                <div className="text-xs text-white truncate font-medium">
                  Clip {clip.id.slice(-4)}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-2 py-1 text-xs text-white truncate">
              Audio {clip.id.slice(-4)}
            </div>
          )}
        </div>
      )
    })
  }

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
            onClick={() => seek(Math.min(duration, currentTime + 1000))}
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Edit Controls */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSplitClip}
            disabled={selectedClips.length !== 1}
            title="Split at playhead (S)"
          >
            <Scissors className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrimStart}
            disabled={selectedClips.length !== 1}
            title="Trim start to playhead (Q)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrimEnd}
            disabled={selectedClips.length !== 1}
            title="Trim end to playhead (W)"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDeleteClips}
            disabled={selectedClips.length === 0}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyClip}
            disabled={selectedClips.length !== 1}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePasteClip}
            disabled={!copiedClip}
          >
            <Clipboard className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDuplicateClip}
            disabled={selectedClips.length !== 1}
            title="Duplicate (Cmd/Ctrl+D)"
          >
            <Layers className="w-4 h-4" />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <div onClick={(e) => e.stopPropagation()}>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={0.1}
              max={3}
              step={0.05}
              className="w-32"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(Math.min(3, zoom + 0.1))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Timeline Area */}
      <div
        ref={timelineRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative min-h-0"
        onClick={handleTimelineClick}
      >
        <div className="relative min-h-full" style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
          {/* Ruler */}
          <div className="h-8 border-b border-border relative sticky top-0 bg-background z-10">
            {renderRuler()}
          </div>

          {/* Tracks */}
          <div className="relative">
            {/* Video Track */}
            <div
              className="h-24 border-b border-border relative bg-muted/20"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleClipDrop(e, 0)}
            >
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-background border-r border-border flex items-center justify-center sticky left-0 z-10">
                <span className="text-xs text-muted-foreground font-medium">Video</span>
              </div>
              <div className="ml-20 relative h-full">
                {renderTrackClips(0, 'video')}
              </div>
            </div>

            {/* Zoom Track (like Screen Studio) */}
            {selectedClips.length > 0 && (
              <div className="h-12 border-b border-border relative bg-purple-900/10">
                <div className="relative h-full">
                  {renderZoomTrack()}
                </div>
              </div>
            )}

            {/* Audio Track */}
            <div
              className="h-16 border-b border-border relative bg-muted/10"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleClipDrop(e, 1)}
            >
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-background border-r border-border flex items-center justify-center sticky left-0 z-10">
                <span className="text-xs text-muted-foreground font-medium">Audio</span>
              </div>
              <div className="ml-20 relative h-full">
                {renderTrackClips(1, 'audio')}
              </div>
            </div>

            {/* Add more space for future tracks */}
            <div className="h-12 bg-muted/5" />
          </div>

          {/* Playhead */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-30 cursor-col-resize"
            style={{ left: `${timeToPixel(currentTime) - 6}px`, width: '12px' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              setIsDraggingPlayhead(true)

              const startX = e.clientX
              const startTime = currentTime

              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX
                const deltaTime = pixelToTime(deltaX)
                const newTime = Math.max(0, Math.min(duration, startTime + deltaTime))
                seek(newTime)
              }

              const handleMouseUp = () => {
                setIsDraggingPlayhead(false)
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
              }

              document.addEventListener('mousemove', handleMouseMove)
              document.addEventListener('mouseup', handleMouseUp)
            }}
          >
            {/* Playhead line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none" style={{ left: '6px' }} />
            {/* Playhead handle */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
          </div>
        </div>
      </div>

      {/* Timeline Info */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{selectedClips.length} clip(s) selected</span>
        <span>{(currentTime / 1000).toFixed(2)}s / {(duration / 1000).toFixed(2)}s</span>
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
            onClick={() => handleContextMenuAction('split')}
          >
            <Scissors className="w-4 h-4 mr-2" />
            Split at Playhead
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => handleContextMenuAction('trim-start')}
          >
            <ChevronsLeft className="w-4 h-4 mr-2" />
            Trim Start
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => handleContextMenuAction('trim-end')}
          >
            <ChevronsRight className="w-4 h-4 mr-2" />
            Trim End
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => handleContextMenuAction('duplicate')}
          >
            <Layers className="w-4 h-4 mr-2" />
            Duplicate
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
            onClick={() => handleContextMenuAction('copy')}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </button>
          <div className="h-px bg-border my-1" />
          <button
            className="flex items-center w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-sm"
            onClick={() => handleContextMenuAction('delete')}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
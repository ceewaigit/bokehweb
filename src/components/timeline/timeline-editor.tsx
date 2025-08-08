'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
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
  Clipboard
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineClip } from '@/types'

interface TimelineEditorProps {
  className?: string
}

export function TimelineEditor({ className = "h-80" }: TimelineEditorProps) {
  const {
    project,
    selectedClips,
    currentTime,
    isPlaying,
    zoom,
    setCurrentTime,
    setPlaying,
    setZoom,
    selectClip,
    removeClip,
    updateClip,
    addClip,
    clearSelection
  } = useTimelineStore()

  const [isDragging, setIsDragging] = useState(false)
  const [draggedClip, setDraggedClip] = useState<string | null>(null)
  const [copiedClip, setCopiedClip] = useState<TimelineClip | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)

  const duration = project ? Math.max(
    project.settings.duration,
    ...project.clips.map(clip => clip.startTime + clip.duration)
  ) : 0

  const pixelsPerMs = zoom * 0.1 // Zoom factor for timeline width
  const timelineWidth = duration * pixelsPerMs

  // Convert time to pixel position
  const timeToPixel = (time: number) => time * pixelsPerMs

  // Convert pixel position to time
  const pixelToTime = (pixel: number) => pixel / pixelsPerMs

  // Handle timeline click for playhead positioning
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return

    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)
    const time = pixelToTime(x)
    setCurrentTime(Math.max(0, Math.min(duration, time)))
  }

  // Split clip at current time
  const handleSplitClip = useCallback(() => {
    if (selectedClips.length !== 1) return

    const clipId = selectedClips[0]
    const clip = project?.clips.find(c => c.id === clipId)
    if (!clip) return

    // Check if playhead is within clip bounds
    if (currentTime < clip.startTime || currentTime > clip.startTime + clip.duration) {
      return
    }

    const splitPoint = currentTime - clip.startTime

    // Create two new clips
    const firstClip: TimelineClip = {
      ...clip,
      id: `${clip.id}-1-${Date.now()}`,
      duration: splitPoint
    }

    const secondClip: TimelineClip = {
      ...clip,
      id: `${clip.id}-2-${Date.now()}`,
      startTime: currentTime,
      duration: clip.duration - splitPoint
    }

    // Remove original clip
    removeClip(clip.id)

    // Add new clips
    addClip(firstClip)
    addClip(secondClip)

    // Select the second clip
    selectClip(secondClip.id)
  }, [selectedClips, project, currentTime, removeClip, addClip, selectClip])

  // Trim clip start to current time
  const handleTrimStart = useCallback(() => {
    if (selectedClips.length !== 1) return

    const clipId = selectedClips[0]
    const clip = project?.clips.find(c => c.id === clipId)
    if (!clip) return

    // Check if playhead is within clip bounds
    if (currentTime <= clip.startTime || currentTime >= clip.startTime + clip.duration) {
      return
    }

    const trimAmount = currentTime - clip.startTime

    updateClip(clip.id, {
      startTime: currentTime,
      duration: clip.duration - trimAmount
    })
  }, [selectedClips, project, currentTime, updateClip])

  // Trim clip end to current time
  const handleTrimEnd = useCallback(() => {
    if (selectedClips.length !== 1) return

    const clipId = selectedClips[0]
    const clip = project?.clips.find(c => c.id === clipId)
    if (!clip) return

    // Check if playhead is within clip bounds
    if (currentTime <= clip.startTime || currentTime >= clip.startTime + clip.duration) {
      return
    }

    const newDuration = currentTime - clip.startTime

    updateClip(clip.id, {
      duration: newDuration
    })
  }, [selectedClips, project, currentTime, updateClip])

  // Copy selected clip
  const handleCopyClip = useCallback(() => {
    if (selectedClips.length !== 1) return

    const clip = project?.clips.find(c => c.id === selectedClips[0])
    if (clip) {
      setCopiedClip(clip)
    }
  }, [selectedClips, project])

  // Paste copied clip
  const handlePasteClip = useCallback(() => {
    if (!copiedClip) return

    const newClip: TimelineClip = {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === ' ' && !e.shiftKey && !e.metaKey) {
        e.preventDefault()
        setPlaying(!isPlaying)
      } else if (e.key === 's' && !e.metaKey) {
        e.preventDefault()
        handleSplitClip()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteClips()
      } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleCopyClip()
      } else if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handlePasteClip()
      } else if (e.key === '[') {
        e.preventDefault()
        handleTrimStart()
      } else if (e.key === ']') {
        e.preventDefault()
        handleTrimEnd()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, setPlaying, handleSplitClip, handleDeleteClips, handleCopyClip, handlePasteClip, handleTrimStart, handleTrimEnd])

  // Early return for no project
  if (!project) {
    return (
      <div className={cn("h-64 bg-background border rounded-lg overflow-hidden p-4", className)}>
        <div className="text-center text-muted-foreground py-8">
          No project loaded. Start recording to create clips.
        </div>
      </div>
    )
  }

  return (
    <div className={cn("bg-background border rounded-lg overflow-hidden", className)}>
      {/* Timeline Controls */}
      <div className="border-b p-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCurrentTime(0)}
            title="Go to start"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPlaying(!isPlaying)}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCurrentTime(duration)}
            title="Go to end"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-6 w-[1px] bg-border" />

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSplitClip}
            disabled={selectedClips.length !== 1}
            title="Split at playhead (S)"
          >
            <Scissors className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyClip}
            disabled={selectedClips.length !== 1}
            title="Copy clip (Cmd+C)"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePasteClip}
            disabled={!copiedClip}
            title="Paste clip (Cmd+V)"
          >
            <Clipboard className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDeleteClips}
            disabled={selectedClips.length === 0}
            title="Delete selected (Delete)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-6 w-[1px] bg-border" />

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrimStart}
            disabled={selectedClips.length !== 1}
            title="Trim start to playhead ([)"
          >
            [
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrimEnd}
            disabled={selectedClips.length !== 1}
            title="Trim end to playhead (])"
          >
            ]
          </Button>
        </div>

        <div className="h-6 w-[1px] bg-border" />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(zoom * 0.8)}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-24">
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={0.1}
              max={5}
              step={0.1}
              className="w-full"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(zoom * 1.2)}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        <div className="text-sm text-muted-foreground">
          {Math.floor(currentTime / 1000)}.{Math.floor((currentTime % 1000) / 100)}s / {Math.floor(duration / 1000)}s
        </div>
      </div>

      {/* Timeline Tracks */}
      <div
        ref={timelineRef}
        className="relative h-48 overflow-x-auto overflow-y-hidden bg-muted/20"
        onClick={handleTimelineClick}
      >
        {/* Time ruler */}
        <div className="absolute top-0 left-0 h-8 border-b bg-background" style={{ width: `${timelineWidth}px` }}>
          {Array.from({ length: Math.ceil(duration / 1000) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-center justify-center text-xs text-muted-foreground"
              style={{ left: `${timeToPixel(i * 1000)}px`, width: '40px' }}
            >
              {i}s
            </div>
          ))}
        </div>

        {/* Video track */}
        <div className="absolute top-12 left-0 h-20 border-b" style={{ width: `${timelineWidth}px` }}>
          <div className="absolute left-2 top-1 text-xs text-muted-foreground">Video</div>
          {project.clips.filter(c => c.type === 'video').map((clip) => (
            <div
              key={clip.id}
              className={cn(
                "absolute top-6 h-12 bg-blue-500 rounded cursor-pointer transition-all",
                selectedClips.includes(clip.id) ? "ring-2 ring-primary" : "hover:brightness-110"
              )}
              style={{
                left: `${timeToPixel(clip.startTime)}px`,
                width: `${timeToPixel(clip.duration)}px`
              }}
              onClick={(e) => {
                e.stopPropagation()
                selectClip(clip.id, e.shiftKey)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                setIsDragging(true)
                setDraggedClip(clip.id)
              }}
            >
              <div className="px-1 text-xs text-white truncate">{clip.name}</div>
            </div>
          ))}
        </div>

        {/* Audio track */}
        <div className="absolute top-36 left-0 h-20 border-b" style={{ width: `${timelineWidth}px` }}>
          <div className="absolute left-2 top-1 text-xs text-muted-foreground">Audio</div>
          {project.clips.filter(c => c.type === 'audio').map((clip) => (
            <div
              key={clip.id}
              className={cn(
                "absolute top-6 h-12 bg-green-500 rounded cursor-pointer transition-all",
                selectedClips.includes(clip.id) ? "ring-2 ring-primary" : "hover:brightness-110"
              )}
              style={{
                left: `${timeToPixel(clip.startTime)}px`,
                width: `${timeToPixel(clip.duration)}px`
              }}
              onClick={(e) => {
                e.stopPropagation()
                selectClip(clip.id, e.shiftKey)
              }}
            >
              <div className="px-1 text-xs text-white truncate">{clip.name}</div>
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          ref={playheadRef}
          className="absolute top-0 w-[2px] bg-red-500 z-10 pointer-events-none"
          style={{
            left: `${timeToPixel(currentTime)}px`,
            height: '100%'
          }}
        >
          <div className="absolute -top-1 -left-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500" />
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="p-2 border-t bg-muted/20 text-xs text-muted-foreground">
        <span className="font-medium">Shortcuts:</span> Space (play/pause) • S (split) • [ ] (trim) • Delete • Cmd+C/V (copy/paste)
      </div>
    </div>
  )
}
import React from 'react'
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

interface TimelineControlsProps {
  isPlaying: boolean
  currentTime: number
  maxDuration: number
  zoom: number
  selectedClips: string[]
  copiedClip?: any
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onZoomChange: (zoom: number) => void
  onSplit: () => void
  onTrimStart: () => void
  onTrimEnd: () => void
  onDelete: () => void
  onCopy?: () => void
  onPaste?: () => void
  onDuplicate: () => void
}

export const TimelineControls = React.memo(({
  isPlaying,
  currentTime,
  maxDuration,
  zoom,
  selectedClips,
  copiedClip,
  onPlay,
  onPause,
  onSeek,
  onZoomChange,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate
}: TimelineControlsProps) => {
  const hasSelection = selectedClips.length > 0
  const hasSingleSelection = selectedClips.length === 1

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-background/95">
      <div className="flex items-center gap-1">
        {/* Playback Controls */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSeek(Math.max(0, currentTime - 1000))}
          className="h-7 w-7 p-0"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => isPlaying ? onPause() : onPlay()}
          className="h-7 w-7 p-0"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSeek(Math.min(maxDuration, currentTime + 1000))}
          className="h-7 w-7 p-0"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-border/50 mx-1" />

        {/* Edit Controls */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onSplit}
          disabled={!hasSingleSelection}
          title="Split at playhead (S)"
          className="h-7 w-7 p-0"
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onTrimStart}
          disabled={!hasSingleSelection}
          title="Trim start to playhead (Q)"
          className="h-7 w-7 p-0"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onTrimEnd}
          disabled={!hasSingleSelection}
          title="Trim end to playhead (W)"
          className="h-7 w-7 p-0"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={!hasSelection}
          className="h-7 w-7 p-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        
        {onCopy && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCopy}
            disabled={!hasSingleSelection}
            className="h-7 w-7 p-0"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        )}
        
        {onPaste && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onPaste}
            disabled={!copiedClip}
            className="h-7 w-7 p-0"
          >
            <Clipboard className="w-3.5 h-3.5" />
          </Button>
        )}
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onDuplicate}
          disabled={!hasSingleSelection}
          title="Duplicate (Cmd/Ctrl+D)"
          className="h-7 w-7 p-0"
        >
          <Layers className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          className="h-7 w-7 p-0"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        
        <Slider
          value={[zoom]}
          onValueChange={([value]) => onZoomChange(value)}
          min={0.1}
          max={3}
          step={0.05}
          className="w-24"
          title={`Zoom: ${(zoom * 100).toFixed(0)}%`}
        />
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
          className="h-7 w-7 p-0"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
})
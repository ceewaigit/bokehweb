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
  copiedClip: any
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onZoomChange: (zoom: number) => void
  onSplit: () => void
  onTrimStart: () => void
  onTrimEnd: () => void
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
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
    <div className="flex items-center justify-between p-2 border-b border-border">
      <div className="flex items-center space-x-2">
        {/* Playback Controls */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSeek(Math.max(0, currentTime - 1000))}
        >
          <SkipBack className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => isPlaying ? onPause() : onPlay()}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSeek(Math.min(maxDuration, currentTime + 1000))}
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-2" />

        {/* Edit Controls */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onSplit}
          disabled={!hasSingleSelection}
          title="Split at playhead (S)"
        >
          <Scissors className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onTrimStart}
          disabled={!hasSingleSelection}
          title="Trim start to playhead (Q)"
        >
          <ChevronsLeft className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onTrimEnd}
          disabled={!hasSingleSelection}
          title="Trim end to playhead (W)"
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={!hasSelection}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
          disabled={!hasSingleSelection}
        >
          <Copy className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onPaste}
          disabled={!copiedClip}
        >
          <Clipboard className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onDuplicate}
          disabled={!hasSingleSelection}
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
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        
        <Slider
          value={[zoom]}
          onValueChange={([value]) => onZoomChange(value)}
          min={0.1}
          max={3}
          step={0.05}
          className="w-32"
        />
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
})
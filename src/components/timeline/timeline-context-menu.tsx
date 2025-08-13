'use client'

import React from 'react'
import { Scissors, ChevronsLeft, ChevronsRight, Layers, Copy, Trash2 } from 'lucide-react'

interface TimelineContextMenuProps {
  x: number
  y: number
  clipId: string
  onSplit: (clipId: string) => void
  onTrimStart: (clipId: string) => void
  onTrimEnd: (clipId: string) => void
  onDuplicate: (clipId: string) => void
  onCopy: (clipId: string) => void
  onDelete: (clipId: string) => void
  onClose: () => void
}

export const TimelineContextMenu = React.memo(({
  x,
  y,
  clipId,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onDuplicate,
  onCopy,
  onDelete,
  onClose
}: TimelineContextMenuProps) => {
  const handleAction = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <div
      className="fixed bg-popover border border-border rounded-md shadow-md p-1 z-[100]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={() => handleAction(() => onSplit(clipId))}
      >
        <Scissors className="w-4 h-4 mr-2" />
        Split at Playhead
      </button>
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={() => handleAction(() => onTrimStart(clipId))}
      >
        <ChevronsLeft className="w-4 h-4 mr-2" />
        Trim Start
      </button>
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={() => handleAction(() => onTrimEnd(clipId))}
      >
        <ChevronsRight className="w-4 h-4 mr-2" />
        Trim End
      </button>
      <div className="h-px bg-border my-1" />
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={() => handleAction(() => onDuplicate(clipId))}
      >
        <Layers className="w-4 h-4 mr-2" />
        Duplicate
      </button>
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={() => handleAction(() => onCopy(clipId))}
      >
        <Copy className="w-4 h-4 mr-2" />
        Copy
      </button>
      <div className="h-px bg-border my-1" />
      <button
        className="flex items-center w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-sm"
        onClick={() => handleAction(() => onDelete(clipId))}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete
      </button>
    </div>
  )
})
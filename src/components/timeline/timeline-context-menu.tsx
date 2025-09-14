'use client'

import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Scissors, ChevronsLeft, ChevronsRight, Layers, Copy, Trash2, Zap } from 'lucide-react'

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
  onSpeedUp: (clipId: string) => void
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
  onSpeedUp,
  onClose
}: TimelineContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleAction = (action: () => void) => {
    action()
    onClose()
  }

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    // Add listener with a small delay to avoid immediate close on right-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg p-1 z-[9999] min-w-[200px]"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
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
        onClick={() => handleAction(() => onSpeedUp(clipId))}
      >
        <Zap className="w-4 h-4 mr-2" />
        Speed Up (2x)
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

  // Use portal to render at document body level
  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(menuContent, document.body)
  }

  return menuContent
})
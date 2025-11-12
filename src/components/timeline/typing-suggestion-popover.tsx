import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import type { TypingPeriod } from '@/lib/timeline/typing-detector'

interface TypingSuggestionPopoverProps {
  x: number
  y: number
  period: TypingPeriod
  allPeriods: TypingPeriod[]
  onApply: (period: TypingPeriod) => Promise<void>
  onApplyAll?: (periods: TypingPeriod[]) => Promise<void>
  onRemove?: (period: TypingPeriod) => void
  onClose: () => void
}

export function TypingSuggestionPopover({
  x,
  y,
  period,
  allPeriods,
  onApply,
  onApplyAll,
  onRemove,
  onClose
}: TypingSuggestionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onClose])

  const content = (
    <div
      ref={ref}
      className="fixed z-[9999] rounded-md shadow-xl border border-black/30 bg-[rgba(18,18,24,0.96)] text-white"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 p-2">
        {onApplyAll && allPeriods.length > 0 && (
          <button
            className="px-2 py-1 text-xs rounded bg-[#2a2f3a] hover:bg-[#343a46] text-gray-200"
            onClick={async () => {
              await onApplyAll(allPeriods);
              onClose();
            }}
          >
            Apply all ({allPeriods.length})
          </button>
        )}
        <button
          className="px-2 py-1 text-xs rounded bg-[#3b82f6] hover:bg-[#2563eb] text-white"
          onClick={async () => {
            await onApply(period);
            onClose();
          }}
        >
          Apply suggestion
        </button>
        {onRemove && (
          <button
            className="px-2 py-1 text-xs rounded bg-[#374151] hover:bg-[#4b5563] text-gray-200"
            onClick={() => { onRemove(period); onClose() }}
          >
            Remove suggestion
          </button>
        )}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(content, document.body)
  }
  return content
} 

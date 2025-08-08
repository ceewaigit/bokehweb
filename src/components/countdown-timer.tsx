'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  seconds: number
  onComplete: () => void
  onCancel?: () => void
  isVisible: boolean
}

export function CountdownTimer({
  seconds,
  onComplete,
  onCancel,
  isVisible
}: CountdownTimerProps) {
  const [count, setCount] = useState(seconds)

  useEffect(() => {
    if (!isVisible) {
      setCount(seconds)
      return
    }

    if (count === 0) {
      onComplete()
      return
    }

    const timer = setTimeout(() => {
      setCount(count - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [count, seconds, onComplete, isVisible])

  useEffect(() => {
    if (isVisible) {
      setCount(seconds)
    }
  }, [isVisible, seconds])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative">
        {/* Large countdown number */}
        <div className="relative">
          <div className={cn(
            "text-[200px] font-bold text-white animate-pulse transition-all",
            count === 0 && "text-green-500"
          )}>
            {count === 0 ? 'GO!' : count}
          </div>

          {/* Circular progress ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="4"
            />
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              fill="none"
              stroke="white"
              strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 45} ${2 * Math.PI * 45}`}
              strokeDashoffset={2 * Math.PI * 45 * (1 - (seconds - count) / seconds)}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
        </div>

        {/* Cancel button */}
        {onCancel && count > 0 && (
          <button
            onClick={onCancel}
            className="absolute -bottom-20 left-1/2 -translate-x-1/2 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Recording message */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-white text-xl font-medium whitespace-nowrap">
          Recording will start in...
        </div>
      </div>
    </div>
  )
}
"use client"

import { useEffect, useState } from 'react'
// import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface ProcessingIndicatorProps {
  isVisible: boolean
  progress: number
  phase: string
  message?: string
  currentFrame?: number
  totalFrames?: number
}

export function ProcessingIndicator({
  isVisible,
  progress,
  phase,
  message,
  currentFrame,
  totalFrames
}: ProcessingIndicatorProps) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return ''
        return prev + '.'
      })
    }, 500)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case 'initializing': return '🎬 Initializing'
      case 'processing': return '✨ Applying Effects'
      case 'finalizing': return '🎞️ Finalizing'
      case 'complete': return '✅ Complete'
      default: return '🔄 Processing'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-96 max-w-[90vw] p-6">
        <div className="text-center space-y-4">
          <div className="text-2xl font-semibold">
            {getPhaseLabel(phase)}{dots}
          </div>

          <Progress value={progress} className="w-full" />

          <div className="text-sm text-muted-foreground">
            {progress}% complete
          </div>

          {message && (
            <div className="text-sm">
              {message}
            </div>
          )}

          {currentFrame !== undefined && totalFrames !== undefined && (
            <div className="text-xs text-muted-foreground">
              Frame {currentFrame} of {totalFrames}
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-4">
            Adding Screen Studio effects to your recording...
          </div>
        </div>
      </div>
    </div>
  )
}
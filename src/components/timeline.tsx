'use client'

import React, { useCallback } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
import { useAnimationStore } from '@/stores/animation-store'

export function Timeline() {
  const {
    project,
    selectedClips,
    currentTime,
    setCurrentTime,
    selectClip,
    removeClip
  } = useTimelineStore()

  // Animation store might not be available, so handle gracefully
  const animationStore = useAnimationStore()

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
    // Only call seek if animation store is available
    if (animationStore?.seek) {
      animationStore.seek(time)
    }
  }, [setCurrentTime, animationStore])

  if (!project) {
    return (
      <div className="h-64 bg-background border rounded-lg overflow-hidden p-4">
        <div className="text-center text-muted-foreground py-8">
          No project loaded. Create a new project or start recording to see timeline.
        </div>
      </div>
    )
  }

  const duration = project.settings.duration
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="h-64 bg-background border rounded-lg overflow-hidden p-4">
      {/* Time scrubber */}
      <div className="mb-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium">Timeline</span>
          <div className="flex-1 relative">
            <div className="w-full h-2 bg-muted rounded">
              <div
                className="h-full bg-primary rounded transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={(e) => handleTimeChange(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {Math.floor(currentTime / 1000)}s / {Math.floor(duration / 1000)}s
          </span>
        </div>
      </div>

      {/* Clips */}
      <div className="space-y-2">
        {project.clips.map((clip) => (
          <div
            key={clip.id}
            className={`
              p-3 rounded border cursor-pointer transition-colors
              ${selectedClips.includes(clip.id)
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
              }
              ${clip.type === 'video' ? 'bg-blue-50' :
                clip.type === 'audio' ? 'bg-green-50' : 'bg-purple-50'}
            `}
            onClick={() => selectClip(clip.id, false)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{clip.name}</div>
                <div className="text-xs text-muted-foreground">
                  {clip.type} • {(clip.duration / 1000).toFixed(1)}s
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeClip(clip.id)
                }}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {project.clips.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No clips in timeline. Start recording to add clips.
          </div>
        )}
      </div>
    </div>
  )
}
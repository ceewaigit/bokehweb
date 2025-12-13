'use client'

import React, { useState, useEffect } from 'react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RotateCcw, Zap } from 'lucide-react'
import type { Clip } from '@/types/project'
import { useCommandManager } from '@/hooks/use-command-manager'
import { ChangePlaybackRateCommand } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'

interface ClipTabProps {
  selectedClip: Clip | null
  onClipUpdate?: (clipId: string, updates: Partial<Clip>) => void
}

export function ClipTab({ selectedClip: propSelectedClip, onClipUpdate }: ClipTabProps) {
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const commandManager = useCommandManager()

  // Get the actual selected clip from the store to ensure reactivity
  const { selectedClips, currentProject } = useProjectStore()
  const selectedClipId = selectedClips[0]

  // Find the current clip in the project to get the latest data
  const selectedClip = React.useMemo(() => {
    if (!selectedClipId || !currentProject) return propSelectedClip

    for (const track of currentProject.timeline.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId)
      if (clip) return clip
    }
    return propSelectedClip
  }, [selectedClipId, currentProject, propSelectedClip])

  // Update local state when selected clip changes
  useEffect(() => {
    if (selectedClip) {
      setPlaybackRate(selectedClip.playbackRate || 1.0)
    }
  }, [selectedClip, selectedClip?.playbackRate]) // Also listen to playbackRate changes

  const handlePlaybackRateChange = async (value: number[]) => {
    const newRate = value[0]
    setPlaybackRate(newRate)
  }

  const commitPlaybackRate = async (rate: number) => {
    if (selectedClip && commandManager) {
      try {
        const command = new ChangePlaybackRateCommand(
          commandManager.getContext(),
          selectedClip.id,
          rate
        )
        await commandManager.execute(command)
      } catch (error) {
        console.error('Failed to change playback rate:', error)
        // Revert the slider on error
        setPlaybackRate(selectedClip.playbackRate || 1.0)
      }
    }
  }

  const resetPlaybackRate = async () => {
    if (selectedClip && commandManager) {
      try {
        const command = new ChangePlaybackRateCommand(
          commandManager.getContext(),
          selectedClip.id,
          1.0
        )
        await commandManager.execute(command)
        setPlaybackRate(1.0)
      } catch (error) {
        console.error('Failed to reset playback rate:', error)
      }
    }
  }

  const setCommonSpeed = async (speed: number) => {
    setPlaybackRate(speed)
    await commitPlaybackRate(speed)
  }

  const MIN_RATE = 0.25
  const MAX_RATE = 4
  const pct = (v: number) => ((v - MIN_RATE) / (MAX_RATE - MIN_RATE)) * 100

  if (!selectedClip) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Select a clip to edit its properties</p>
      </div>
    )
  }

  // Calculate effective duration (how long it plays in the timeline)
  const effectiveDuration = selectedClip.duration / 1000 // Convert to seconds

  return (
    <div className="space-y-6">
      <div className="p-4 bg-background/40 rounded-xl space-y-1">
        <div className="text-xs text-muted-foreground">Clip ID: {selectedClip.id.slice(0, 8)}...</div>
        <div className="text-xs text-muted-foreground">
          Duration: {effectiveDuration.toFixed(2)}s
          {selectedClip.playbackRate && selectedClip.playbackRate !== 1.0 && (
            <span className="ml-1 text-orange-500">({selectedClip.playbackRate}x speed)</span>
          )}
        </div>
      </div>

      <div className="p-4 bg-background/40 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Playback Speed</h4>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {playbackRate.toFixed(2)}x
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetPlaybackRate}
              className="h-6 w-6 p-0"
              title="Reset to normal speed"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Slider
            value={[playbackRate]}
            onValueChange={handlePlaybackRateChange}
            onValueCommit={(vals) => commitPlaybackRate(vals[0])}
            min={MIN_RATE}
            max={MAX_RATE}
            step={0.25}
            className="w-full"
          />

          <div className="relative w-full h-4 mt-1">
            {/* Min label */}
            <span className="absolute text-xs text-muted-foreground" style={{ left: `${pct(MIN_RATE)}%`, transform: 'translateX(-50%)' }}>0.25x</span>
            {/* 1x label positioned at actual 1x */}
            <span className="absolute text-xs text-muted-foreground" style={{ left: `${pct(1)}%`, transform: 'translateX(-50%)' }}>1x</span>
            {/* Max label */}
            <span className="absolute text-xs text-muted-foreground" style={{ left: `${pct(MAX_RATE)}%`, transform: 'translateX(-50%)' }}>4x</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Quick Presets</div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.5)}
              className="text-xs h-7"
            >
              0.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.75) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.75)}
              className="text-xs h-7"
            >
              0.75x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.0)}
              className="text-xs h-7"
            >
              1x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.25) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.25)}
              className="text-xs h-7"
            >
              1.25x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.5)}
              className="text-xs h-7"
            >
              1.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 2.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(2.0)}
              className="text-xs h-7"
            >
              2x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 3.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(3.0)}
              className="text-xs h-7"
            >
              3x
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 

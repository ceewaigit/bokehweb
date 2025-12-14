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
import { InfoTooltip } from './info-tooltip'

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

  if (!selectedClip) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a clip to edit its properties</p>
      </div>
    )
  }

  // Calculate effective duration (how long it plays in the timeline)
  const effectiveDuration = selectedClip.duration / 1000 // Convert to seconds

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 bg-background/40 rounded-lg text-xs text-muted-foreground">
        <span>Clip ID: {selectedClip.id.slice(0, 8)}...</span>
        <span className="mx-2">•</span>
        <span>
          {effectiveDuration.toFixed(2)}s
          {selectedClip.playbackRate && selectedClip.playbackRate !== 1.0 && (
            <span className="ml-1 text-orange-500">({selectedClip.playbackRate}x)</span>
          )}
        </span>
      </div>

      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-foreground">Playback Speed</h4>
            <InfoTooltip content="Changes clip speed without changing its start time." />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-5">
              {playbackRate.toFixed(2)}x
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetPlaybackRate}
              className="h-5 w-5 p-0"
              title="Reset to normal speed"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Slider
            value={[playbackRate]}
            onValueChange={handlePlaybackRateChange}
            onValueCommit={(vals) => commitPlaybackRate(vals[0])}
            min={MIN_RATE}
            max={MAX_RATE}
            step={0.25}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
            <span>0.25x</span>
            <span>1x</span>
            <span>4x</span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <div className="text-[10px] font-medium text-muted-foreground">Quick Presets</div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.5)}
              className="text-[10px] h-6 px-2"
            >
              0.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 0.75) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(0.75)}
              className="text-[10px] h-6 px-2"
            >
              0.75x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.0)}
              className="text-[10px] h-6 px-2"
            >
              1x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.25) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.25)}
              className="text-[10px] h-6 px-2"
            >
              1.25x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 1.5) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(1.5)}
              className="text-[10px] h-6 px-2"
            >
              1.5x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 2.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(2.0)}
              className="text-[10px] h-6 px-2"
            >
              2x
            </Button>
            <Button
              size="sm"
              variant={Math.abs(playbackRate - 3.0) < 0.01 ? "default" : "outline"}
              onClick={() => setCommonSpeed(3.0)}
              className="text-[10px] h-6 px-2"
            >
              3x
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 

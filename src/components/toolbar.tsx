"use client"

import { useState } from 'react'
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Settings,
  Folder,
  Save,
  Download,
  Monitor,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings2,
  ArrowLeft,
  Home
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { useRecordingStore } from '@/stores/recording-store'
import { useTimelineStore } from '@/stores/timeline-store'
import { cn, formatTime } from '@/lib/utils'

interface ToolbarProps {
  onToggleProperties: () => void
  onExport: () => void
  showBackButton?: boolean
  onBack?: () => void
}

export function Toolbar({ onToggleProperties, onExport, showBackButton, onBack }: ToolbarProps) {
  const {
    isRecording,
    isPaused,
    duration,
    status,
    settings
  } = useRecordingStore()

  const {
    currentTime,
    isPlaying,
    project,
    setPlaying,
    setCurrentTime
  } = useTimelineStore()

  // Recording control is handled by RecordingController
  // Toolbar only shows status and delegates actions through events
  const handleRecord = () => {
    // Dispatch custom event that RecordingController will listen to
    const event = isRecording ? 'stop-recording' : 'start-recording'
    window.dispatchEvent(new CustomEvent(event))
  }

  const handlePause = () => {
    window.dispatchEvent(new CustomEvent('pause-recording'))
  }

  const handlePlay = () => {
    setPlaying(!isPlaying)
  }

  const handleRewind = () => {
    setCurrentTime(Math.max(0, currentTime - 5))
  }

  const handleForward = () => {
    setCurrentTime(currentTime + 5)
  }

  return (
    <div className="h-16 bg-card border-b border-border flex items-center px-4 space-sm">
      {/* Back Button */}
      {showBackButton && (
        <>
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-8 mr-4" />
        </>
      )}

      {/* Recording Status Only (controls via floating button) */}
      <div className="flex items-center space-sm">
        {/* Show Screen Studio branding when idle */}
        {status === 'idle' && !project?.clips.length && (
          <div className="flex items-center space-x-2">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Screen Studio</span>
          </div>
        )}

        {/* Recording Duration */}
        {(isRecording || duration > 0) && (
          <Badge variant="outline" className="font-mono">
            {formatTime(duration / 1000)}
          </Badge>
        )}

        {/* Recording Status */}
        {status !== 'idle' && (
          <Badge
            variant={status === 'recording' ? 'destructive' : 'secondary'}
            className={cn(
              "capitalize",
              status === 'recording' && "animate-pulse"
            )}
          >
            {status === 'processing' ? 'Saving...' : status}
          </Badge>
        )}

        {/* Show clip count when not recording */}
        {!isRecording && project?.clips && project.clips.length > 0 && (
          <Badge variant="outline">
            {project.clips.length} clip{project.clips.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Playback Controls */}
      <div className="flex items-center space-sm">
        <Button
          onClick={handleRewind}
          variant="ghost"
          size="sm"
          disabled={!project}
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          onClick={handlePlay}
          variant="ghost"
          size="sm"
          disabled={!project}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        <Button
          onClick={handleForward}
          variant="ghost"
          size="sm"
          disabled={!project}
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        {/* Current Time */}
        {project && (
          <Badge variant="outline" className="font-mono">
            {formatTime(currentTime)}
          </Badge>
        )}
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Audio Controls */}
      <div className="flex items-center space-sm">
        <Button variant="ghost" size="sm">
          {settings.audioInput === 'none' ?
            <VolumeX className="w-4 h-4" /> :
            <Volume2 className="w-4 h-4" />
          }
        </Button>

        <Button variant="ghost" size="sm">
          {settings.audioInput === 'microphone' || settings.audioInput === 'both' ?
            <Mic className="w-4 h-4" /> :
            <MicOff className="w-4 h-4" />
          }
        </Button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* File Controls */}
      <div className="flex items-center space-sm">
        <Button variant="ghost" size="sm">
          <Folder className="w-4 h-4 mr-2" />
          Open
        </Button>

        <Button variant="ghost" size="sm" disabled={!project}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>

        <Button variant="ghost" size="sm" disabled={!project} onClick={onExport}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>

        <Separator orientation="vertical" className="h-8" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleProperties}
        >
          <Settings2 className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="sm">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
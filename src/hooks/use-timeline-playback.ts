import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'

interface UseTimelinePlaybackProps {
  enabled?: boolean
}

/**
 * Hook that handles playback-related keyboard shortcuts only.
 * Editing operations are handled by useCommandKeyboard.
 */
export function useTimelinePlayback({ enabled = true }: UseTimelinePlaybackProps = {}) {
  const {
    currentProject,
    currentTime,
    isPlaying,
    play,
    pause,
    seek,
    selectClip
  } = useProjectStore()
  
  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Playback controls
    const handlePlayPause = () => {
      if (isPlaying) {
        pause()
      } else {
        play()
      }
    }

    // Shuttle controls
    const handleShuttleReverse = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }

      playbackSpeedRef.current = Math.max(-4, playbackSpeedRef.current - 1)
      if (playbackSpeedRef.current === 0) playbackSpeedRef.current = -1

      pause()
      
      if (playbackSpeedRef.current !== 0) {
        shuttleIntervalRef.current = setInterval(() => {
          const frameTime = (1000 / 30) * playbackSpeedRef.current
          seek(Math.max(0, currentTime + frameTime))
        }, 1000 / 30)
      }
    }

    const handleShuttleStop = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
        shuttleIntervalRef.current = null
      }
      playbackSpeedRef.current = 1
      pause()
    }

    const handleShuttleForward = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }

      playbackSpeedRef.current = Math.min(4, playbackSpeedRef.current + 1)
      if (playbackSpeedRef.current === 0) playbackSpeedRef.current = 1

      pause()
      
      if (playbackSpeedRef.current !== 0) {
        shuttleIntervalRef.current = setInterval(() => {
          const frameTime = (1000 / 30) * playbackSpeedRef.current
          const maxTime = currentProject?.timeline?.duration || 0
          seek(Math.min(maxTime, currentTime + frameTime))
        }, 1000 / 30)
      }
    }

    // Frame navigation
    const handleFramePrevious = () => {
      const frameTime = 1000 / 30 // 30fps
      seek(Math.max(0, currentTime - frameTime))
    }

    const handleFrameNext = () => {
      const frameTime = 1000 / 30
      const maxTime = currentProject?.timeline?.duration || 0
      seek(Math.min(maxTime, currentTime + frameTime))
    }

    const handleFramePrevious10 = () => {
      const frameTime = (1000 / 30) * 10
      seek(Math.max(0, currentTime - frameTime))
    }

    const handleFrameNext10 = () => {
      const frameTime = (1000 / 30) * 10
      const maxTime = currentProject?.timeline?.duration || 0
      seek(Math.min(maxTime, currentTime + frameTime))
    }

    // Timeline navigation
    const handleTimelineStart = () => {
      seek(0)
    }

    const handleTimelineEnd = () => {
      const maxTime = currentProject?.timeline?.duration || 0
      seek(maxTime)
    }

    const handleClipPrevious = () => {
      if (!currentProject) return
      const clips = currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .sort((a, b) => a.startTime - b.startTime)
        .filter(c => c.startTime < currentTime)

      if (clips.length > 0) {
        const clip = clips[clips.length - 1]
        seek(clip.startTime)
        selectClip(clip.id)
      }
    }

    const handleClipNext = () => {
      if (!currentProject) return
      const clips = currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .sort((a, b) => a.startTime - b.startTime)
        .filter(c => c.startTime > currentTime)

      if (clips.length > 0) {
        const clip = clips[0]
        seek(clip.startTime)
        selectClip(clip.id)
      }
    }

    // Register keyboard listeners
    keyboardManager.on('playPause', handlePlayPause)
    keyboardManager.on('shuttleReverse', handleShuttleReverse)
    keyboardManager.on('shuttleStop', handleShuttleStop)
    keyboardManager.on('shuttleForward', handleShuttleForward)
    keyboardManager.on('framePrevious', handleFramePrevious)
    keyboardManager.on('frameNext', handleFrameNext)
    keyboardManager.on('framePrevious10', handleFramePrevious10)
    keyboardManager.on('frameNext10', handleFrameNext10)
    keyboardManager.on('timelineStart', handleTimelineStart)
    keyboardManager.on('timelineEnd', handleTimelineEnd)
    keyboardManager.on('clipPrevious', handleClipPrevious)
    keyboardManager.on('clipNext', handleClipNext)

    return () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }

      keyboardManager.removeListener('playPause', handlePlayPause)
      keyboardManager.removeListener('shuttleReverse', handleShuttleReverse)
      keyboardManager.removeListener('shuttleStop', handleShuttleStop)
      keyboardManager.removeListener('shuttleForward', handleShuttleForward)
      keyboardManager.removeListener('framePrevious', handleFramePrevious)
      keyboardManager.removeListener('frameNext', handleFrameNext)
      keyboardManager.removeListener('framePrevious10', handleFramePrevious10)
      keyboardManager.removeListener('frameNext10', handleFrameNext10)
      keyboardManager.removeListener('timelineStart', handleTimelineStart)
      keyboardManager.removeListener('timelineEnd', handleTimelineEnd)
      keyboardManager.removeListener('clipPrevious', handleClipPrevious)
      keyboardManager.removeListener('clipNext', handleClipNext)
    }
  }, [enabled, currentProject, currentTime, isPlaying, play, pause, seek, selectClip])

  return {
    playbackSpeed: playbackSpeedRef.current
  }
}
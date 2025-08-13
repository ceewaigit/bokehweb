import { useEffect } from 'react'

interface UseTimelineKeyboardProps {
  isPlaying: boolean
  selectedClips: string[]
  currentTime: number
  play: () => void
  pause: () => void
  splitClip: (clipId: string, time: number) => void
  removeClip: (clipId: string) => void
  duplicateClip: (clipId: string) => void
  clearSelection: () => void
}

export function useTimelineKeyboard({
  isPlaying,
  selectedClips,
  currentTime,
  play,
  pause,
  splitClip,
  removeClip,
  duplicateClip,
  clearSelection
}: UseTimelineKeyboardProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          isPlaying ? pause() : play()
          break

        case 's':
        case 'S':
          e.preventDefault()
          if (selectedClips.length === 1) {
            splitClip(selectedClips[0], currentTime)
          }
          break

        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          selectedClips.forEach(clipId => removeClip(clipId))
          clearSelection()
          break

        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            if (selectedClips.length === 1) {
              duplicateClip(selectedClips[0])
            }
          }
          break

        case 'Escape':
          e.preventDefault()
          clearSelection()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTime, selectedClips, isPlaying, play, pause, splitClip, removeClip, clearSelection, duplicateClip])
}
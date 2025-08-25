import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'
import { undoManager } from '@/lib/keyboard/undo-manager'
import { toast } from 'sonner'
import type { Clip } from '@/types/project'

interface UseTimelineKeyboardProps {
  enabled?: boolean
}

export function useTimelineKeyboard({ enabled = true }: UseTimelineKeyboardProps = {}) {
  const {
    currentProject,
    currentTime,
    isPlaying,
    selectedClips,
    selectedEffectLayer,
    play,
    pause,
    seek,
    selectClip,
    clearSelection,
    removeClip,
    splitClip,
    duplicateClip,
    updateClip,
    addClip,
    setZoom,
    zoom,
    removeZoomBlock
  } = useProjectStore()

  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) return

    console.log('[useTimelineKeyboard] Initializing keyboard handlers')
    
    // Set context
    keyboardManager.setContext('timeline')

    // Playback controls
    const handlePlayPause = () => {
      if (isPlaying) pause()
      else play()
    }

    const handleShuttleReverse = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }

      if (playbackSpeedRef.current > 0 || playbackSpeedRef.current === 1) {
        playbackSpeedRef.current = -1
      } else {
        playbackSpeedRef.current = Math.max(-8, playbackSpeedRef.current * 2)
      }

      setPlaybackSpeed(playbackSpeedRef.current)
      pause()

      if (playbackSpeedRef.current !== 0) {
        const frameTime = 1000 / 30 // 30fps
        const interval = frameTime / Math.abs(playbackSpeedRef.current)
        
        shuttleIntervalRef.current = setInterval(() => {
          const newTime = currentTime + (interval * playbackSpeedRef.current)
          seek(Math.max(0, newTime))
        }, interval)

        toast(`${playbackSpeedRef.current}x`, { duration: 1000 })
      }
    }

    const handleShuttleForward = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }

      if (playbackSpeedRef.current < 0 || playbackSpeedRef.current === -1) {
        playbackSpeedRef.current = 1
      } else {
        playbackSpeedRef.current = Math.min(8, playbackSpeedRef.current * 2)
      }

      setPlaybackSpeed(playbackSpeedRef.current)
      pause()

      if (playbackSpeedRef.current !== 0) {
        const frameTime = 1000 / 30 // 30fps
        const interval = frameTime / Math.abs(playbackSpeedRef.current)
        
        shuttleIntervalRef.current = setInterval(() => {
          const newTime = currentTime + (interval * playbackSpeedRef.current)
          const maxTime = currentProject?.timeline?.duration || 0
          seek(Math.min(maxTime, newTime))
        }, interval)

        toast(`${playbackSpeedRef.current}x`, { duration: 1000 })
      }
    }

    const handleShuttleStop = () => {
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
        shuttleIntervalRef.current = null
      }
      playbackSpeedRef.current = 1
      setPlaybackSpeed(1)
      pause()
    }

    // Frame navigation
    const handleFramePrevious = () => {
      console.log('[Keyboard] Previous frame')
      const frameTime = 1000 / 30 // 30fps
      seek(Math.max(0, currentTime - frameTime))
    }

    const handleFrameNext = () => {
      console.log('[Keyboard] Next frame')
      const frameTime = 1000 / 30 // 30fps
      const maxTime = currentProject?.timeline?.duration || 0
      seek(Math.min(maxTime, currentTime + frameTime))
    }

    const handleFramePrevious10 = () => {
      const frameTime = 1000 / 30 * 10 // 10 frames
      seek(Math.max(0, currentTime - frameTime))
    }

    const handleFrameNext10 = () => {
      const frameTime = 1000 / 30 * 10 // 10 frames
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

    // Editing with undo support
    const handleCopy = () => {
      if (selectedClips.length === 1 && currentProject) {
        const clip = currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .find(c => c.id === selectedClips[0])
        
        if (clip) {
          setClipboard(clip)
          toast('Clip copied')
        }
      }
    }

    const handleCut = () => {
      if (selectedClips.length === 1 && currentProject) {
        const clip = currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .find(c => c.id === selectedClips[0])
        
        if (clip) {
          setClipboard(clip)
          
          undoManager.execute({
            id: `cut-${clip.id}`,
            timestamp: Date.now(),
            description: 'Cut clip',
            execute: () => {
              removeClip(clip.id)
            },
            undo: () => {
              addClip(clip)
            }
          })
          
          toast('Clip cut')
        }
      }
    }

    const handlePaste = () => {
      if (clipboard) {
        const newClip: Clip = {
          ...clipboard,
          id: `clip-${Date.now()}`,
          startTime: currentTime
        }
        
        undoManager.execute({
          id: `paste-${newClip.id}`,
          timestamp: Date.now(),
          description: 'Paste clip',
          execute: () => {
            addClip(newClip)
          },
          undo: () => {
            removeClip(newClip.id)
          }
        })
        
        toast('Clip pasted')
      }
    }

    const handlePasteInPlace = () => {
      if (clipboard) {
        const newClip: Clip = {
          ...clipboard,
          id: `clip-${Date.now()}`,
        }
        
        undoManager.execute({
          id: `paste-in-place-${newClip.id}`,
          timestamp: Date.now(),
          description: 'Paste clip in place',
          execute: () => {
            addClip(newClip)
          },
          undo: () => {
            removeClip(newClip.id)
          }
        })
        
        toast('Clip pasted in place')
      }
    }

    const handleDelete = () => {
      // Check if an effect layer is selected (like a zoom block)
      if (selectedEffectLayer) {
        // Handle effect-specific deletion
        if (selectedEffectLayer.type === 'zoom' && selectedEffectLayer.id && selectedClips.length === 1) {
          // Delete the specific zoom block
          removeZoomBlock(selectedClips[0], selectedEffectLayer.id)
          toast('Zoom block deleted')
        }
        // Don't delete clips when effect layer is selected
        return
      }
      
      // Only delete clips if no effect layer is selected
      if (selectedClips.length > 0 && currentProject) {
        const clips = currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .filter(c => selectedClips.includes(c.id))
        
        undoManager.beginGroup()
        
        clips.forEach(clip => {
          undoManager.execute({
            id: `delete-${clip.id}`,
            timestamp: Date.now(),
            description: `Delete ${clips.length > 1 ? `${clips.length} clips` : 'clip'}`,
            execute: () => {
              removeClip(clip.id)
            },
            undo: () => {
              addClip(clip)
            }
          })
        })
        
        undoManager.endGroup()
        clearSelection()
        toast(`${clips.length} clip${clips.length > 1 ? 's' : ''} deleted`)
      }
    }

    const handleDuplicate = () => {
      if (selectedClips.length === 1) {
        const clipId = selectedClips[0]
        const newClipId = duplicateClip(clipId)
        
        if (newClipId && currentProject) {
          const originalClip = currentProject.timeline.tracks
            .flatMap(t => t.clips)
            .find(c => c.id === clipId)
          
          const newClip = currentProject.timeline.tracks
            .flatMap(t => t.clips)
            .find(c => c.id === newClipId)
          
          if (originalClip && newClip) {
            undoManager.execute({
              id: `duplicate-${newClipId}`,
              timestamp: Date.now(),
              description: 'Duplicate clip',
              execute: () => {}, // Already executed
              undo: () => {
                removeClip(newClipId)
              },
              redo: () => {
                addClip(newClip)
              }
            })
            
            toast('Clip duplicated')
          }
        }
      }
    }

    const handleSplit = () => {
      if (selectedClips.length === 1) {
        const clipId = selectedClips[0]
        splitClip(clipId, currentTime)
        toast('Clip split')
      }
    }

    const handleSelectAll = () => {
      if (currentProject) {
        const allClipIds = currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .map(c => c.id)
        
        allClipIds.forEach(id => selectClip(id, true))
        toast(`${allClipIds.length} clips selected`)
      }
    }

    const handleUndo = async () => {
      const description = undoManager.getUndoDescription()
      if (await undoManager.undo()) {
        toast(`Undo: ${description}`)
      }
    }

    const handleRedo = async () => {
      const description = undoManager.getRedoDescription()
      if (await undoManager.redo()) {
        toast(`Redo: ${description}`)
      }
    }

    // Zoom
    const handleZoomIn = () => {
      setZoom(Math.min(3, zoom + 0.1))
    }

    const handleZoomOut = () => {
      setZoom(Math.max(0.1, zoom - 0.1))
    }

    const handleZoomFit = () => {
      setZoom(0.5)
    }

    // Project actions
    const handleSave = async () => {
      const { saveCurrentProject } = useProjectStore.getState()
      try {
        await saveCurrentProject()
        toast('Project saved')
      } catch (error) {
        toast.error('Failed to save project')
      }
    }

    // Register all handlers
    keyboardManager.on('playPause', handlePlayPause)
    keyboardManager.on('shuttleReverse', handleShuttleReverse)
    keyboardManager.on('shuttleForward', handleShuttleForward)
    keyboardManager.on('shuttleStop', handleShuttleStop)
    keyboardManager.on('framePrevious', handleFramePrevious)
    keyboardManager.on('frameNext', handleFrameNext)
    keyboardManager.on('framePrevious10', handleFramePrevious10)
    keyboardManager.on('frameNext10', handleFrameNext10)
    keyboardManager.on('timelineStart', handleTimelineStart)
    keyboardManager.on('timelineEnd', handleTimelineEnd)
    keyboardManager.on('clipPrevious', handleClipPrevious)
    keyboardManager.on('clipNext', handleClipNext)
    keyboardManager.on('copy', handleCopy)
    keyboardManager.on('cut', handleCut)
    keyboardManager.on('paste', handlePaste)
    keyboardManager.on('pasteInPlace', handlePasteInPlace)
    keyboardManager.on('delete', handleDelete)
    keyboardManager.on('duplicate', handleDuplicate)
    keyboardManager.on('split', handleSplit)
    keyboardManager.on('selectAll', handleSelectAll)
    keyboardManager.on('undo', handleUndo)
    keyboardManager.on('redo', handleRedo)
    keyboardManager.on('zoomIn', handleZoomIn)
    keyboardManager.on('zoomOut', handleZoomOut)
    keyboardManager.on('zoomFit', handleZoomFit)
    keyboardManager.on('escape', clearSelection)
    keyboardManager.on('save', handleSave)

    return () => {
      // Cleanup shuttle
      if (shuttleIntervalRef.current) {
        clearInterval(shuttleIntervalRef.current)
      }
      
      // Remove all handlers
      keyboardManager.removeAllListeners('playPause')
      keyboardManager.removeAllListeners('shuttleReverse')
      keyboardManager.removeAllListeners('shuttleForward')
      keyboardManager.removeAllListeners('shuttleStop')
      keyboardManager.removeAllListeners('framePrevious')
      keyboardManager.removeAllListeners('frameNext')
      keyboardManager.removeAllListeners('framePrevious10')
      keyboardManager.removeAllListeners('frameNext10')
      keyboardManager.removeAllListeners('timelineStart')
      keyboardManager.removeAllListeners('timelineEnd')
      keyboardManager.removeAllListeners('clipPrevious')
      keyboardManager.removeAllListeners('clipNext')
      keyboardManager.removeAllListeners('copy')
      keyboardManager.removeAllListeners('cut')
      keyboardManager.removeAllListeners('paste')
      keyboardManager.removeAllListeners('pasteInPlace')
      keyboardManager.removeAllListeners('delete')
      keyboardManager.removeAllListeners('duplicate')
      keyboardManager.removeAllListeners('split')
      keyboardManager.removeAllListeners('selectAll')
      keyboardManager.removeAllListeners('undo')
      keyboardManager.removeAllListeners('redo')
      keyboardManager.removeAllListeners('zoomIn')
      keyboardManager.removeAllListeners('zoomOut')
      keyboardManager.removeAllListeners('zoomFit')
      keyboardManager.removeAllListeners('escape')
      keyboardManager.removeAllListeners('save')
    }
  }, [
    enabled,
    currentProject,
    currentTime,
    isPlaying,
    selectedClips,
    selectedEffectLayer,
    clipboard,
    play,
    pause,
    seek,
    selectClip,
    clearSelection,
    removeClip,
    splitClip,
    duplicateClip,
    addClip,
    setZoom,
    zoom,
    removeZoomBlock
  ])

  return {
    clipboard,
    playbackSpeed,
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
    undoDescription: undoManager.getUndoDescription(),
    redoDescription: undoManager.getRedoDescription()
  }
}
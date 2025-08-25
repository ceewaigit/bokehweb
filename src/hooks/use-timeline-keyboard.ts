import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'
import { undoManager } from '@/lib/keyboard/undo-manager'
import { toast } from 'sonner'
import type { Clip } from '@/types/project'

interface UseTimelineKeyboardProps {
  enabled?: boolean
}

// Effect clipboard type for copying individual effects
interface EffectClipboard {
  type: 'zoom' | 'cursor' | 'background'
  data: any
  sourceClipId: string
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
    clearEffectSelection,
    removeClip,
    splitClip,
    duplicateClip,
    updateClip,
    addClip,
    setZoom,
    zoom,
    removeZoomBlock,
    addZoomBlock,
    updateZoomBlock
  } = useProjectStore()

  // Use refs for clipboard to avoid re-registering handlers
  const clipClipboardRef = useRef<Clip | null>(null)
  const effectClipboardRef = useRef<EffectClipboard | null>(null)
  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

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
      pause()
    }

    // Frame navigation - prevent default to stop scrolling
    const handleFramePrevious = (e?: any) => {
      if (e?.event) e.event.preventDefault()
      const frameTime = 1000 / 30 // 30fps
      seek(Math.max(0, currentTime - frameTime))
    }

    const handleFrameNext = (e?: any) => {
      if (e?.event) e.event.preventDefault()
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

    // Helper to get selected clip
    const getSelectedClip = () => {
      if (!currentProject || selectedClips.length !== 1) return null
      return currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === selectedClips[0])
    }

    // Editing with undo support
    const handleCopy = () => {
      const clip = getSelectedClip()
      if (!clip) return

      // Copy effect if one is selected
      if (selectedEffectLayer) {
        if (selectedEffectLayer.type === 'zoom' && selectedEffectLayer.id) {
          const zoomBlock = clip.effects?.zoom?.blocks?.find(b => b.id === selectedEffectLayer.id)
          if (zoomBlock) {
            effectClipboardRef.current = {
              type: 'zoom',
              data: { ...zoomBlock },
              sourceClipId: clip.id
            }
            toast('Zoom block copied')
          }
        } else {
          // Copy cursor or background settings
          const effectData = clip.effects[selectedEffectLayer.type]
          if (effectData) {
            effectClipboardRef.current = {
              type: selectedEffectLayer.type,
              data: { ...effectData },
              sourceClipId: clip.id
            }
            toast(`${selectedEffectLayer.type.charAt(0).toUpperCase() + selectedEffectLayer.type.slice(1)} copied`)
          }
        }
      } else {
        // Copy entire clip
        clipClipboardRef.current = clip
        toast('Clip copied')
      }
    }

    const handleCut = () => {
      if (selectedEffectLayer) {
        toast('Cannot cut while effect is selected')
        return
      }

      const clip = getSelectedClip()
      if (!clip) return

      clipClipboardRef.current = clip

      undoManager.execute({
        id: `cut-${clip.id}`,
        timestamp: Date.now(),
        description: 'Cut clip',
        execute: () => removeClip(clip.id),
        undo: () => addClip(clip)
      })

      toast('Clip cut')
    }

    const handlePaste = () => {
      // Paste effect if we have one and a target clip
      if (effectClipboardRef.current) {
        const targetClip = getSelectedClip()
        if (!targetClip) {
          toast.error('Select a clip to paste the effect')
          return
        }

        if (effectClipboardRef.current.type === 'zoom') {
          const zoomBlock = effectClipboardRef.current.data
          const relativeTime = Math.max(0, currentTime - targetClip.startTime)
          const newBlock = {
            ...zoomBlock,
            id: `zoom-${Date.now()}`,
            startTime: relativeTime,
            endTime: Math.min(targetClip.duration, relativeTime + (zoomBlock.endTime - zoomBlock.startTime))
          }

          // Check overlaps
          const hasOverlap = (targetClip.effects?.zoom?.blocks || []).some(b =>
            newBlock.startTime < b.endTime && newBlock.endTime > b.startTime
          )

          if (hasOverlap) {
            toast.error('Cannot paste: Would overlap with existing zoom block')
            return
          }

          undoManager.execute({
            id: `paste-zoom-${newBlock.id}`,
            timestamp: Date.now(),
            description: 'Paste zoom block',
            execute: () => addZoomBlock(targetClip.id, newBlock),
            undo: () => removeZoomBlock(targetClip.id, newBlock.id)
          })

          toast('Zoom block pasted')
        } else {
          // Paste cursor/background settings
          const prevEffects = { ...targetClip.effects }

          undoManager.execute({
            id: `paste-${effectClipboardRef.current.type}-${Date.now()}`,
            timestamp: Date.now(),
            description: `Paste ${effectClipboardRef.current.type}`,
            execute: () => updateClip(targetClip.id, {
              effects: { ...targetClip.effects, [effectClipboardRef.current!.type]: effectClipboardRef.current!.data }
            }),
            undo: () => updateClip(targetClip.id, { effects: prevEffects })
          })

          toast(`${effectClipboardRef.current.type.charAt(0).toUpperCase() + effectClipboardRef.current.type.slice(1)} pasted`)
        }
        return
      }

      // Paste clip
      if (clipClipboardRef.current) {
        const newClip: Clip = {
          ...clipClipboardRef.current,
          id: `clip-${Date.now()}`,
          startTime: currentTime
        }

        undoManager.execute({
          id: `paste-${newClip.id}`,
          timestamp: Date.now(),
          description: 'Paste clip',
          execute: () => addClip(newClip),
          undo: () => removeClip(newClip.id)
        })

        toast('Clip pasted')
      } else {
        toast('Nothing to paste')
      }
    }

    const handlePasteInPlace = () => {
      // For effects, paste at original position
      if (effectClipboardRef.current) {
        const targetClip = getSelectedClip()
        if (!targetClip) {
          toast.error('Select a clip to paste the effect')
          return
        }

        if (effectClipboardRef.current.type === 'zoom') {
          const newBlock = {
            ...effectClipboardRef.current.data,
            id: `zoom-${Date.now()}`
          }

          // Check overlaps
          const hasOverlap = (targetClip.effects?.zoom?.blocks || []).some(b =>
            newBlock.startTime < b.endTime && newBlock.endTime > b.startTime
          )

          if (hasOverlap) {
            toast.error('Cannot paste: Would overlap with existing zoom block')
            return
          }

          undoManager.execute({
            id: `paste-zoom-${newBlock.id}`,
            timestamp: Date.now(),
            description: 'Paste zoom block in place',
            execute: () => addZoomBlock(targetClip.id, newBlock),
            undo: () => removeZoomBlock(targetClip.id, newBlock.id)
          })

          toast('Zoom block pasted in place')
          return
        }
        // For cursor/background, same as regular paste
        handlePaste()
        return
      }

      if (clipClipboardRef.current) {
        const newClip: Clip = {
          ...clipClipboardRef.current,
          id: `clip-${Date.now()}`
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
          const clipId = selectedClips[0]
          const blockId = selectedEffectLayer.id

          // Find the zoom block to save for undo
          const clip = currentProject?.timeline.tracks
            .flatMap(t => t.clips)
            .find(c => c.id === clipId)
          const zoomBlock = clip?.effects?.zoom?.blocks?.find(b => b.id === blockId)

          if (zoomBlock) {
            undoManager.execute({
              id: `delete-zoom-${blockId}`,
              timestamp: Date.now(),
              description: 'Delete zoom block',
              execute: () => {
                removeZoomBlock(clipId, blockId)
                clearEffectSelection()
              },
              undo: () => {
                addZoomBlock(clipId, zoomBlock)
              }
            })
            toast('Zoom block deleted')
          }
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
      const clip = getSelectedClip()
      if (!clip) return

      const newClipId = duplicateClip(clip.id)
      if (!newClipId || !currentProject) return

      const newClip = currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === newClipId)

      if (newClip) {
        undoManager.execute({
          id: `duplicate-${newClipId}`,
          timestamp: Date.now(),
          description: 'Duplicate clip',
          execute: () => { }, // Already executed
          undo: () => removeClip(newClipId),
          redo: () => addClip(newClip)
        })

        toast('Clip duplicated')
      }
    }

    const handleSplit = () => {
      const clip = getSelectedClip()
      if (clip) {
        splitClip(clip.id, currentTime)
        toast('Clip split')
      }
    }

    const handleSelectAll = () => {
      if (currentProject) {
        // Clear effect selection first
        clearEffectSelection()

        const allClipIds = currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .map(c => c.id)

        // Clear and then select all
        clearSelection()
        allClipIds.forEach(id => selectClip(id, true))

        if (allClipIds.length > 0) {
          toast(`${allClipIds.length} clips selected`)
        }
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
    play,
    pause,
    seek,
    selectClip,
    clearSelection,
    clearEffectSelection,
    removeClip,
    splitClip,
    duplicateClip,
    updateClip,
    addClip,
    setZoom,
    zoom,
    removeZoomBlock,
    addZoomBlock,
    updateZoomBlock
  ])

}
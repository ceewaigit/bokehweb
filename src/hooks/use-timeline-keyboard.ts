import { useEffect, useRef } from 'react'
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
    clipboard,
    play,
    pause,
    seek,
    selectClip,
    selectEffectLayer,
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
    updateZoomBlock,
    copyClip,
    copyEffect,
    clearClipboard
  } = useProjectStore()
  const playbackSpeedRef = useRef(1)
  const shuttleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Store the latest values in refs to avoid stale closures
  const storeRef = useRef({
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
    selectEffectLayer,
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
    updateZoomBlock,
    copyClip,
    copyEffect,
    clearClipboard
  })
  
  // Update the ref on every render
  storeRef.current = {
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
    selectEffectLayer,
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
    updateZoomBlock,
    copyClip,
    copyEffect,
    clearClipboard
  }

  useEffect(() => {
    if (!enabled) return

    // Set context
    keyboardManager.setContext('timeline')

    // Playback controls
    const handlePlayPause = () => {
      if (storeRef.current.isPlaying) storeRef.current.pause()
      else storeRef.current.play()
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

      storeRef.current.pause()

      if (playbackSpeedRef.current !== 0) {
        const frameTime = 1000 / 30 // 30fps
        const interval = frameTime / Math.abs(playbackSpeedRef.current)

        shuttleIntervalRef.current = setInterval(() => {
          const newTime = storeRef.current.currentTime + (interval * playbackSpeedRef.current)
          storeRef.current.seek(Math.max(0, newTime))
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

      storeRef.current.pause()

      if (playbackSpeedRef.current !== 0) {
        const frameTime = 1000 / 30 // 30fps
        const interval = frameTime / Math.abs(playbackSpeedRef.current)

        shuttleIntervalRef.current = setInterval(() => {
          const newTime = storeRef.current.currentTime + (interval * playbackSpeedRef.current)
          const maxTime = storeRef.current.currentProject?.timeline?.duration || 0
          storeRef.current.seek(Math.min(maxTime, newTime))
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
      storeRef.current.pause()
    }

    // Frame navigation - prevent default to stop scrolling
    const handleFramePrevious = (e?: any) => {
      if (e?.event) e.event.preventDefault()
      const frameTime = 1000 / 30 // 30fps
      storeRef.current.seek(Math.max(0, storeRef.current.currentTime - frameTime))
    }

    const handleFrameNext = (e?: any) => {
      if (e?.event) e.event.preventDefault()
      const frameTime = 1000 / 30 // 30fps
      const maxTime = storeRef.current.currentProject?.timeline?.duration || 0
      storeRef.current.seek(Math.min(maxTime, storeRef.current.currentTime + frameTime))
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
      if (!storeRef.current.currentProject || storeRef.current.selectedClips.length !== 1) return null
      return storeRef.current.currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === storeRef.current.selectedClips[0])
    }

    // Editing with undo support
    const handleCopy = () => {
      const clip = getSelectedClip()
      if (!clip) return

      // Copy effect if one is selected
      if (storeRef.current.selectedEffectLayer) {
        if (storeRef.current.selectedEffectLayer.type === 'zoom' && storeRef.current.selectedEffectLayer.id) {
          const zoomBlock = clip.effects?.zoom?.blocks?.find(b => b.id === storeRef.current.selectedEffectLayer?.id)
          if (zoomBlock) {
            storeRef.current.copyEffect('zoom', { ...zoomBlock }, clip.id)
            toast('Zoom block copied')
          }
        } else {
          // Copy cursor or background settings
          const effectData = clip.effects[storeRef.current.selectedEffectLayer.type]
          if (effectData) {
            storeRef.current.copyEffect(
              storeRef.current.selectedEffectLayer.type,
              { ...effectData },
              clip.id
            )
            toast(`${storeRef.current.selectedEffectLayer.type.charAt(0).toUpperCase() + storeRef.current.selectedEffectLayer.type.slice(1)} copied`)
          }
        }
      } else {
        // Copy entire clip
        storeRef.current.copyClip(clip)
        toast('Clip copied')
      }
    }

    const handleCut = () => {
      if (storeRef.current.selectedEffectLayer) {
        toast('Cannot cut while effect is selected')
        return
      }

      const clip = getSelectedClip()
      if (!clip) return

      storeRef.current.copyClip(clip)

      undoManager.execute({
        id: `cut-${clip.id}`,
        timestamp: Date.now(),
        description: 'Cut clip',
        execute: () => storeRef.current.removeClip(clip.id),
        undo: () => storeRef.current.addClip(clip)
      })

      toast('Clip cut')
    }

    const handlePaste = () => {
      // Paste effect if we have one and a target clip
      if (storeRef.current.clipboard.effect) {
        const targetClip = getSelectedClip()
        if (!targetClip) {
          toast.error('Select a clip to paste the effect')
          return
        }

        if (storeRef.current.clipboard.effect.type === 'zoom') {
          const zoomBlock = storeRef.current.clipboard.effect.data
          const blockDuration = zoomBlock.endTime - zoomBlock.startTime
          let pasteStartTime = Math.max(0, storeRef.current.currentTime - targetClip.startTime)
          
          // Sort existing blocks by start time (create a copy to avoid mutating)
          const existingBlocks = [...(targetClip.effects?.zoom?.blocks || [])].sort((a, b) => a.startTime - b.startTime)
          
          // Simple strategy: if there's overlap, just place after all existing blocks
          if (existingBlocks.length > 0) {
            // Check for overlap at current position
            const hasOverlap = existingBlocks.some(b => {
              // Add small buffer to prevent edge cases
              const buffer = 10
              return pasteStartTime < (b.endTime + buffer) && (pasteStartTime + blockDuration) > (b.startTime - buffer)
            })
            
            if (hasOverlap) {
              // Just place it after the last block with a gap
              const lastBlock = existingBlocks[existingBlocks.length - 1]
              pasteStartTime = lastBlock.endTime + 200 // Decent gap
            }
          }
          
          // Don't constrain to clip duration - zoom blocks can extend beyond
          // Zoom blocks represent when to zoom, not constrained by video length
          const newBlock = {
            ...zoomBlock,
            id: `zoom-${Date.now()}`,
            startTime: pasteStartTime,
            endTime: pasteStartTime + blockDuration
          }
          
          undoManager.execute({
            id: `paste-zoom-${newBlock.id}`,
            timestamp: Date.now(),
            description: 'Paste zoom block',
            execute: () => {
              storeRef.current.addZoomBlock(targetClip.id, newBlock)
            },
            undo: () => storeRef.current.removeZoomBlock(targetClip.id, newBlock.id)
          })

          toast('Zoom block pasted')
        } else {
          // Paste cursor/background settings
          const prevEffects = { ...targetClip.effects }
          const effectType = storeRef.current.clipboard.effect.type
          const effectData = storeRef.current.clipboard.effect.data

          undoManager.execute({
            id: `paste-${effectType}-${Date.now()}`,
            timestamp: Date.now(),
            description: `Paste ${effectType}`,
            execute: () => storeRef.current.updateClip(targetClip.id, {
              effects: { ...targetClip.effects, [effectType]: effectData }
            }),
            undo: () => storeRef.current.updateClip(targetClip.id, { effects: prevEffects })
          })

          toast(`${effectType.charAt(0).toUpperCase() + effectType.slice(1)} pasted`)
        }
        return
      }

      // Paste clip
      if (storeRef.current.clipboard.clip) {
        const newClip: Clip = {
          ...storeRef.current.clipboard.clip,
          id: `clip-${Date.now()}`,
          startTime: storeRef.current.currentTime
        }

        undoManager.execute({
          id: `paste-${newClip.id}`,
          timestamp: Date.now(),
          description: 'Paste clip',
          execute: () => storeRef.current.addClip(newClip),
          undo: () => storeRef.current.removeClip(newClip.id)
        })

        toast('Clip pasted')
      } else {
        toast('Nothing to paste')
      }
    }

    const handlePasteInPlace = () => {
      // For effects, paste at original position
      if (storeRef.current.clipboard.effect) {
        const targetClip = getSelectedClip()
        if (!targetClip) {
          toast.error('Select a clip to paste the effect')
          return
        }

        if (storeRef.current.clipboard.effect.type === 'zoom') {
          const newBlock = {
            ...storeRef.current.clipboard.effect.data,
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
            execute: () => storeRef.current.addZoomBlock(targetClip.id, newBlock),
            undo: () => storeRef.current.removeZoomBlock(targetClip.id, newBlock.id)
          })

          toast('Zoom block pasted in place')
          return
        }
        // For cursor/background, same as regular paste
        handlePaste()
        return
      }

      if (storeRef.current.clipboard.clip) {
        const newClip: Clip = {
          ...storeRef.current.clipboard.clip,
          id: `clip-${Date.now()}`
        }

        undoManager.execute({
          id: `paste-in-place-${newClip.id}`,
          timestamp: Date.now(),
          description: 'Paste clip in place',
          execute: () => {
            storeRef.current.addClip(newClip)
          },
          undo: () => {
            storeRef.current.removeClip(newClip.id)
          }
        })

        toast('Clip pasted in place')
      }
    }

    const handleDelete = () => {
      // Check if an effect layer is selected (like a zoom block)
      if (storeRef.current.selectedEffectLayer) {
        // Handle effect-specific deletion
        if (storeRef.current.selectedEffectLayer.type === 'zoom' && storeRef.current.selectedEffectLayer.id && storeRef.current.selectedClips.length === 1) {
          const clipId = storeRef.current.selectedClips[0]
          const blockId = storeRef.current.selectedEffectLayer.id

          // Find the zoom block to save for undo
          const clip = storeRef.current.currentProject?.timeline.tracks
            .flatMap(t => t.clips)
            .find(c => c.id === clipId)
          const zoomBlock = clip?.effects?.zoom?.blocks?.find(b => b.id === blockId)

          if (zoomBlock) {
            // Clear selection immediately to prevent stale references
            storeRef.current.clearEffectSelection()
            
            undoManager.execute({
              id: `delete-zoom-${blockId}`,
              timestamp: Date.now(),
              description: 'Delete zoom block',
              execute: () => {
                storeRef.current.removeZoomBlock(clipId, blockId)
              },
              undo: () => {
                storeRef.current.addZoomBlock(clipId, zoomBlock)
                // Re-select the block when undoing
                storeRef.current.selectEffectLayer('zoom', zoomBlock.id)
              }
            })
            toast('Zoom block deleted')
          } else {
            // Clear the selection since the block doesn't exist
            storeRef.current.clearEffectSelection()
          }
        }
        // Don't delete clips when effect layer is selected
        return
      }

      // Only delete clips if no effect layer is selected
      if (storeRef.current.selectedClips.length > 0 && storeRef.current.currentProject) {
        const clips = storeRef.current.currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .filter(c => storeRef.current.selectedClips.includes(c.id))

        undoManager.beginGroup()

        clips.forEach(clip => {
          undoManager.execute({
            id: `delete-${clip.id}`,
            timestamp: Date.now(),
            description: `Delete ${clips.length > 1 ? `${clips.length} clips` : 'clip'}`,
            execute: () => {
              storeRef.current.removeClip(clip.id)
            },
            undo: () => {
              storeRef.current.addClip(clip)
            }
          })
        })

        undoManager.endGroup()
        storeRef.current.clearSelection()
        toast(`${clips.length} clip${clips.length > 1 ? 's' : ''} deleted`)
      }
    }

    const handleDuplicate = () => {
      const clip = getSelectedClip()
      if (!clip) return

      const newClipId = storeRef.current.duplicateClip(clip.id)
      if (!newClipId || !storeRef.current.currentProject) return

      const newClip = storeRef.current.currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === newClipId)

      if (newClip) {
        undoManager.execute({
          id: `duplicate-${newClipId}`,
          timestamp: Date.now(),
          description: 'Duplicate clip',
          execute: () => { }, // Already executed
          undo: () => storeRef.current.removeClip(newClipId),
          redo: () => storeRef.current.addClip(newClip)
        })

        toast('Clip duplicated')
      }
    }

    const handleSplit = () => {
      const clip = getSelectedClip()
      if (clip) {
        storeRef.current.splitClip(clip.id, storeRef.current.currentTime)
        toast('Clip split')
      }
    }

    const handleSelectAll = () => {
      if (storeRef.current.currentProject) {
        // Clear effect selection first
        storeRef.current.clearEffectSelection()

        const allClipIds = storeRef.current.currentProject.timeline.tracks
          .flatMap(t => t.clips)
          .map(c => c.id)

        // Clear and then select all
        storeRef.current.clearSelection()
        allClipIds.forEach(id => storeRef.current.selectClip(id, true))

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
      storeRef.current.setZoom(Math.min(3, storeRef.current.zoom + 0.1))
    }

    const handleZoomOut = () => {
      storeRef.current.setZoom(Math.max(0.1, storeRef.current.zoom - 0.1))
    }

    const handleZoomFit = () => {
      storeRef.current.setZoom(0.5)
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
    keyboardManager.on('escape', () => storeRef.current.clearSelection())
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
  }, [enabled]) // Only re-register when enabled changes

}
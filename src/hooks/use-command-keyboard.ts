import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'
import { 
  CommandManager, 
  DefaultCommandContext, 
  registerAllCommands,
  SplitClipCommand,
  DuplicateClipCommand,
  RemoveClipCommand,
  RemoveZoomBlockCommand,
  CopyCommand,
  CutCommand,
  PasteCommand
} from '@/lib/commands'
import { toast } from 'sonner'

interface UseCommandKeyboardProps {
  enabled?: boolean
}

export function useCommandKeyboard({ enabled = true }: UseCommandKeyboardProps = {}) {
  const store = useProjectStore()
  const commandManagerRef = useRef<CommandManager | null>(null)
  const contextRef = useRef<DefaultCommandContext | null>(null)

  // Initialize command manager
  useEffect(() => {
    if (!commandManagerRef.current) {
      contextRef.current = new DefaultCommandContext(store)
      commandManagerRef.current = CommandManager.getInstance(contextRef.current)
      registerAllCommands(commandManagerRef.current)
    } else {
      // Update context with latest store
      contextRef.current = new DefaultCommandContext(store)
      commandManagerRef.current.setContext(contextRef.current)
    }
  }, [store])

  useEffect(() => {
    if (!enabled || !commandManagerRef.current) return

    const manager = commandManagerRef.current

    // Copy handler
    const handleCopy = async () => {
      const currentStore = useProjectStore.getState()
      const freshContext = new DefaultCommandContext(currentStore)
      
      try {
        const command = new CopyCommand(freshContext)
        const result = await manager.execute(command)
        
        if (result.success) {
          if (result.data?.type === 'effect') {
            toast(`${result.data.effectType} block copied`)
          } else {
            toast('Clip copied')
          }
        } else {
          toast.error(result.error as string)
        }
      } catch (err) {
        console.error('[Keyboard] Copy failed:', err)
        toast.error('Failed to copy')
      }
    }

    // Cut handler
    const handleCut = async () => {
      // Update context with fresh store state
      contextRef.current = new DefaultCommandContext(useProjectStore.getState())
      const command = new CutCommand(contextRef.current)
      const result = await manager.execute(command)
      
      if (result.success) {
        toast('Clip cut')
      } else {
        toast.error(result.error as string)
      }
    }

    // Paste handler
    const handlePaste = async () => {
      const currentStore = useProjectStore.getState()
      const freshContext = new DefaultCommandContext(currentStore)
      
      try {
        const command = new PasteCommand(freshContext)
        const result = await manager.execute(command)
        
        if (result.success) {
          if (result.data?.type === 'effect') {
            toast(`${result.data.effectType} block pasted`)
          } else {
            toast('Clip pasted')
          }
        } else {
          toast.error(result.error as string)
        }
      } catch (err) {
        console.error('[Keyboard] Paste failed:', err)
        toast.error('Failed to paste')
      }
    }

    // Delete handler
    const handleDelete = async () => {
      const currentStore = useProjectStore.getState()
      
      // Create new context with fresh state
      const freshContext = new DefaultCommandContext(currentStore)
      
      // Check if an effect layer is selected (e.g., zoom block)
      const effectLayer = currentStore.selectedEffectLayer
      if (effectLayer && effectLayer.type === 'zoom' && effectLayer.id) {
        const command = new RemoveZoomBlockCommand(
          freshContext,
          effectLayer.id
        )
        
        try {
          const result = await manager.execute(command)
          if (result.success) {
            // Clear selection after successful deletion
            useProjectStore.getState().clearEffectSelection()
            toast('Zoom block deleted')
          } else {
            console.error('[Keyboard] Delete failed:', result.error)
            toast.error(result.error as string)
          }
        } catch (err) {
          console.error('[Keyboard] Delete zoom block failed:', err)
          toast.error('Failed to delete zoom block')
        }
        return
      }

      // Default behavior: delete clips
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length === 0) return

      // Begin group for multiple deletions
      if (selectedClips.length > 1) {
        manager.beginGroup(`delete-${Date.now()}`)
      }

      for (const clipId of selectedClips) {
        // Update context with fresh store state for each deletion
        contextRef.current = new DefaultCommandContext(useProjectStore.getState())
        const command = new RemoveClipCommand(contextRef.current, clipId)
        await manager.execute(command)
      }

      if (selectedClips.length > 1) {
        await manager.endGroup()
        toast(`${selectedClips.length} clips deleted`)
      } else {
        toast('Clip deleted')
      }
    }

    // Split handler
    const handleSplit = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to split')
        return
      }

      // Update context with fresh store state
      contextRef.current = new DefaultCommandContext(currentStore)
      const command = new SplitClipCommand(
        contextRef.current,
        selectedClips[0],
        currentStore.currentTime
      )
      
      const result = await manager.execute(command)
      
      if (result.success) {
        toast('Clip split')
      } else {
        toast.error(result.error as string)
      }
    }

    // Duplicate handler
    const handleDuplicate = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length === 0) return

      // Begin group for multiple duplications
      if (selectedClips.length > 1) {
        manager.beginGroup(`duplicate-${Date.now()}`)
      }

      for (const clipId of selectedClips) {
        // Update context with fresh store state
        contextRef.current = new DefaultCommandContext(currentStore)
        const command = new DuplicateClipCommand(contextRef.current, clipId)
        await manager.execute(command)
      }

      if (selectedClips.length > 1) {
        await manager.endGroup()
        toast(`${selectedClips.length} clips duplicated`)
      } else {
        toast('Clip duplicated')
      }
    }

    // Undo/Redo handlers
    const handleUndo = async () => {
      const result = await manager.undo()
      if (result.success) {
        toast('Undone')
      }
    }

    const handleRedo = async () => {
      const result = await manager.redo()
      if (result.success) {
        toast('Redone')
      }
    }

    // Register keyboard listeners
    keyboardManager.on('copy', handleCopy)
    keyboardManager.on('cut', handleCut)
    keyboardManager.on('paste', handlePaste)
    keyboardManager.on('delete', handleDelete)
    keyboardManager.on('split', handleSplit)
    keyboardManager.on('duplicate', handleDuplicate)
    keyboardManager.on('undo', handleUndo)
    keyboardManager.on('redo', handleRedo)

    return () => {
      keyboardManager.removeListener('copy', handleCopy)
      keyboardManager.removeListener('cut', handleCut)
      keyboardManager.removeListener('paste', handlePaste)
      keyboardManager.removeListener('delete', handleDelete)
      keyboardManager.removeListener('split', handleSplit)
      keyboardManager.removeListener('duplicate', handleDuplicate)
      keyboardManager.removeListener('undo', handleUndo)
      keyboardManager.removeListener('redo', handleRedo)
    }
  }, [enabled, store])

  return {
    commandManager: commandManagerRef.current,
    canUndo: () => commandManagerRef.current?.canUndo() || false,
    canRedo: () => commandManagerRef.current?.canRedo() || false,
    getUndoDescription: () => commandManagerRef.current?.getUndoDescription() || null,
    getRedoDescription: () => commandManagerRef.current?.getRedoDescription() || null
  }
}
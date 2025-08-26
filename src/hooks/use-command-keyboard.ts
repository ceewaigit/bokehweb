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
    const context = contextRef.current!

    // Copy handler
    const handleCopy = async () => {
      const command = new CopyCommand(context)
      const result = await manager.execute(command)
      
      if (result.success) {
        if (result.data?.type === 'effect') {
          toast(`${result.data.effectType} copied`)
        } else {
          toast('Clip copied')
        }
      } else {
        toast.error(result.error as string)
      }
    }

    // Cut handler
    const handleCut = async () => {
      const command = new CutCommand(context)
      const result = await manager.execute(command)
      
      if (result.success) {
        toast('Clip cut')
      } else {
        toast.error(result.error as string)
      }
    }

    // Paste handler
    const handlePaste = async () => {
      const command = new PasteCommand(context)
      const result = await manager.execute(command)
      
      if (result.success) {
        if (result.data?.type === 'effect') {
          toast(`${result.data.effectType} pasted`)
        } else {
          toast('Clip pasted')
        }
      } else {
        toast.error(result.error as string)
      }
    }

    // Delete handler
    const handleDelete = async () => {
      // Check if an effect layer is selected (e.g., zoom block)
      if (store.selectedEffectLayer) {
        const { type, id } = store.selectedEffectLayer
        
        if (type === 'zoom' && id && store.selectedClips.length === 1) {
          // Delete the zoom block
          store.removeZoomBlock(store.selectedClips[0], id)
          store.clearEffectSelection()
          toast('Zoom block deleted')
          return
        }
        // Handle other effect types if needed in the future
      }

      // Default behavior: delete clips
      const selectedClips = store.selectedClips
      if (selectedClips.length === 0) return

      // Begin group for multiple deletions
      if (selectedClips.length > 1) {
        manager.beginGroup(`delete-${Date.now()}`)
      }

      for (const clipId of selectedClips) {
        const command = new RemoveClipCommand(context, clipId)
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
      const selectedClips = store.selectedClips
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to split')
        return
      }

      const command = new SplitClipCommand(
        context,
        selectedClips[0],
        store.currentTime
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
      const selectedClips = store.selectedClips
      if (selectedClips.length === 0) return

      // Begin group for multiple duplications
      if (selectedClips.length > 1) {
        manager.beginGroup(`duplicate-${Date.now()}`)
      }

      for (const clipId of selectedClips) {
        const command = new DuplicateClipCommand(context, clipId)
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
import { useRef, useEffect } from 'react'
import { CommandManager, DefaultCommandContext } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'

export function useCommandManager(): CommandManager | null {
  const commandManagerRef = useRef<CommandManager | null>(null)

  useEffect(() => {
    const store = useProjectStore.getState()
    const ctx = new DefaultCommandContext(store)
    
    if (!commandManagerRef.current) {
      commandManagerRef.current = CommandManager.getInstance(ctx)
    } else {
      // Update context if it changes
      commandManagerRef.current.setContext(ctx)
    }
  }, [])

  return commandManagerRef.current
} 
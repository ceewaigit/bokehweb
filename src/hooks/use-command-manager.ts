import { useEffect, useState } from 'react'
import { CommandManager, DefaultCommandContext } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'

export function useCommandManager(): CommandManager | null {
  const [manager, setManager] = useState<CommandManager | null>(null)

  useEffect(() => {
    const store = useProjectStore.getState()
    const ctx = new DefaultCommandContext(store)
    const instance = CommandManager.getInstance(ctx)
    instance.setContext(ctx)
    setManager(instance)
  }, [])

  return manager
} 
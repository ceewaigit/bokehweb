export interface UndoableAction {
  id: string
  timestamp: number
  description: string
  execute: () => void | Promise<void>
  undo: () => void | Promise<void>
  redo?: () => void | Promise<void>
  groupId?: string // For grouping related actions
}

export class UndoManager {
  private history: UndoableAction[] = []
  private currentIndex: number = -1
  private maxHistorySize: number = 100
  private isExecuting: boolean = false
  private groupingEnabled: boolean = false
  private currentGroupId: string | null = null

  constructor(maxSize: number = 100) {
    this.maxHistorySize = maxSize
  }

  public async execute(action: UndoableAction) {
    if (this.isExecuting) return

    try {
      this.isExecuting = true

      // Execute the action
      await action.execute()

      // If grouping is enabled, assign group ID
      if (this.groupingEnabled && this.currentGroupId) {
        action.groupId = this.currentGroupId
      }

      // Remove any actions after current index
      this.history = this.history.slice(0, this.currentIndex + 1)

      // Add new action
      this.history.push(action)

      // Limit history size
      if (this.history.length > this.maxHistorySize) {
        this.history.shift()
      } else {
        this.currentIndex++
      }
    } finally {
      this.isExecuting = false
    }
  }

  public async undo(): Promise<boolean> {
    if (this.isExecuting || !this.canUndo()) return false

    try {
      this.isExecuting = true
      const action = this.history[this.currentIndex]

      // If action is part of a group, undo all actions in group
      if (action.groupId) {
        const groupActions = this.getGroupActions(action.groupId)
        for (let i = groupActions.length - 1; i >= 0; i--) {
          await groupActions[i].undo()
          this.currentIndex--
        }
      } else {
        await action.undo()
        this.currentIndex--
      }

      return true
    } finally {
      this.isExecuting = false
    }
  }

  public async redo(): Promise<boolean> {
    if (this.isExecuting || !this.canRedo()) return false

    try {
      this.isExecuting = true
      this.currentIndex++
      const action = this.history[this.currentIndex]

      // If action is part of a group, redo all actions in group
      if (action.groupId) {
        const groupActions = this.getGroupActions(action.groupId)
        for (const groupAction of groupActions) {
          const redoFn = groupAction.redo || groupAction.execute
          await redoFn()
          if (groupAction !== action) {
            this.currentIndex++
          }
        }
      } else {
        const redoFn = action.redo || action.execute
        await redoFn()
      }

      return true
    } finally {
      this.isExecuting = false
    }
  }

  public canUndo(): boolean {
    return this.currentIndex >= 0
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  public getUndoDescription(): string | null {
    if (!this.canUndo()) return null
    const action = this.history[this.currentIndex]

    // If part of group, return group description
    if (action.groupId) {
      const groupActions = this.getGroupActions(action.groupId)
      return `${groupActions.length} actions`
    }

    return action.description
  }

  public getRedoDescription(): string | null {
    if (!this.canRedo()) return null
    const action = this.history[this.currentIndex + 1]

    // If part of group, return group description
    if (action.groupId) {
      const groupActions = this.getGroupActions(action.groupId)
      return `${groupActions.length} actions`
    }

    return action.description
  }

  public clear() {
    this.history = []
    this.currentIndex = -1
  }

  public beginGroup(groupId?: string) {
    this.groupingEnabled = true
    this.currentGroupId = groupId || `group-${Date.now()}`
  }

  public endGroup() {
    this.groupingEnabled = false
    this.currentGroupId = null
  }

  private getGroupActions(groupId: string): UndoableAction[] {
    const actions: UndoableAction[] = []
    let startIndex = -1

    // Find start of group
    for (let i = 0; i <= this.currentIndex; i++) {
      if (this.history[i].groupId === groupId) {
        if (startIndex === -1) startIndex = i
        actions.push(this.history[i])
      } else if (startIndex !== -1) {
        break
      }
    }

    return actions
  }

  public getHistory(): UndoableAction[] {
    return this.history.slice(0, this.currentIndex + 1)
  }

  public getHistorySize(): number {
    return this.currentIndex + 1
  }

  public getMaxHistorySize(): number {
    return this.maxHistorySize
  }

  public setMaxHistorySize(size: number) {
    this.maxHistorySize = size

    // Trim history if needed
    if (this.history.length > size) {
      const removeCount = this.history.length - size
      this.history = this.history.slice(removeCount)
      this.currentIndex = Math.max(-1, this.currentIndex - removeCount)
    }
  }
}

// Global instance
export const undoManager = new UndoManager()
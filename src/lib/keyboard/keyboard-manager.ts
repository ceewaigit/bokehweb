// Simple browser-compatible event emitter
class EventEmitter {
  private events: Map<string, Set<Function>> = new Map()

  on(event: string, handler: Function) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(handler)
  }

  off(event: string, handler: Function) {
    this.events.get(event)?.delete(handler)
  }

  emit(event: string, ...args: any[]) {
    this.events.get(event)?.forEach(handler => handler(...args))
  }

  removeAllListeners(event: string) {
    this.events.delete(event)
  }

  removeListener(event: string, handler: Function) {
    this.off(event, handler)
  }
}

export type KeyboardContext = 'timeline' | 'library' | 'export' | 'global'

export interface KeyboardShortcut {
  id: string
  key: string
  modifiers?: ('cmd' | 'ctrl' | 'alt' | 'shift')[]
  action: string
  description: string
  context: KeyboardContext[]
  handler?: () => void | Promise<void>
  preventDefault?: boolean
}

export interface KeyboardAction {
  id: string
  execute: () => void | Promise<void>
  undo?: () => void | Promise<void>
  description: string
}

class KeyboardManager extends EventEmitter {
  private shortcuts: Map<string, KeyboardShortcut> = new Map()
  private activeContext: KeyboardContext = 'timeline'
  private enabled: boolean = true
  private pressedKeys: Set<string> = new Set()
  private customShortcuts: Map<string, Partial<KeyboardShortcut>> = new Map()

  constructor() {
    super()
    this.registerDefaultShortcuts()
    this.initializeListeners()
  }

  private registerDefaultShortcuts() {
    // Playback Controls
    this.register({
      id: 'play-pause',
      key: ' ',
      action: 'playPause',
      description: 'Play/Pause',
      context: ['timeline', 'global'],
      preventDefault: true
    })

    this.register({
      id: 'shuttle-reverse',
      key: 'j',
      action: 'shuttleReverse',
      description: 'Play Reverse (press multiple times for speed)',
      context: ['timeline'],
    })

    this.register({
      id: 'shuttle-stop',
      key: 'k',
      action: 'shuttleStop',
      description: 'Stop',
      context: ['timeline'],
    })

    this.register({
      id: 'shuttle-forward',
      key: 'l',
      action: 'shuttleForward',
      description: 'Play Forward (press multiple times for speed)',
      context: ['timeline'],
    })

    // Frame Navigation
    this.register({
      id: 'frame-prev',
      key: 'ArrowLeft',
      action: 'framePrevious',
      description: 'Previous Frame',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'frame-next',
      key: 'ArrowRight',
      action: 'frameNext',
      description: 'Next Frame',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'frame-prev-10',
      key: 'ArrowLeft',
      modifiers: ['shift'],
      action: 'framePrevious10',
      description: 'Previous 10 Frames',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'frame-next-10',
      key: 'ArrowRight',
      modifiers: ['shift'],
      action: 'frameNext10',
      description: 'Next 10 Frames',
      context: ['timeline'],
      preventDefault: true
    })

    // Track Navigation
    this.register({
      id: 'track-up',
      key: 'ArrowUp',
      action: 'trackUp',
      description: 'Move to Track Above',
      context: ['timeline'],
    })

    this.register({
      id: 'track-down',
      key: 'ArrowDown',
      action: 'trackDown',
      description: 'Move to Track Below',
      context: ['timeline'],
    })

    // Timeline Navigation
    this.register({
      id: 'timeline-home',
      key: 'Home',
      action: 'timelineStart',
      description: 'Go to Start',
      context: ['timeline'],
    })

    this.register({
      id: 'timeline-end',
      key: 'End',
      action: 'timelineEnd',
      description: 'Go to End',
      context: ['timeline'],
    })

    this.register({
      id: 'clip-prev',
      key: 'PageUp',
      action: 'clipPrevious',
      description: 'Previous Clip',
      context: ['timeline'],
    })

    this.register({
      id: 'clip-next',
      key: 'PageDown',
      action: 'clipNext',
      description: 'Next Clip',
      context: ['timeline'],
    })

    // Editing
    this.register({
      id: 'undo',
      key: 'z',
      modifiers: ['cmd'],
      action: 'undo',
      description: 'Undo',
      context: ['timeline', 'global'],
      preventDefault: true
    })

    this.register({
      id: 'redo',
      key: 'z',
      modifiers: ['cmd', 'shift'],
      action: 'redo',
      description: 'Redo',
      context: ['timeline', 'global'],
      preventDefault: true
    })

    this.register({
      id: 'copy',
      key: 'c',
      modifiers: ['cmd'],
      action: 'copy',
      description: 'Copy',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'cut',
      key: 'x',
      modifiers: ['cmd'],
      action: 'cut',
      description: 'Cut',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'paste',
      key: 'v',
      modifiers: ['cmd'],
      action: 'paste',
      description: 'Paste',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'paste-in-place',
      key: 'v',
      modifiers: ['cmd', 'shift'],
      action: 'pasteInPlace',
      description: 'Paste in Place',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'duplicate',
      key: 'd',
      modifiers: ['cmd'],
      action: 'duplicate',
      description: 'Duplicate',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'select-all',
      key: 'a',
      modifiers: ['cmd'],
      action: 'selectAll',
      description: 'Select All',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'delete',
      key: 'Delete',
      action: 'delete',
      description: 'Delete Selected',
      context: ['timeline'],
    })

    this.register({
      id: 'delete-backspace',
      key: 'Backspace',
      action: 'delete',
      description: 'Delete Selected',
      context: ['timeline'],
    })

    // Splitting
    this.register({
      id: 'split',
      key: 's',
      action: 'split',
      description: 'Split at Playhead',
      context: ['timeline'],
    })

    this.register({
      id: 'split-cmd',
      key: 'k',
      modifiers: ['cmd'],
      action: 'split',
      description: 'Split at Playhead',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'blade',
      key: 'b',
      action: 'bladeTool',
      description: 'Blade Tool',
      context: ['timeline'],
    })

    // In/Out Points
    this.register({
      id: 'mark-in',
      key: 'i',
      action: 'markIn',
      description: 'Set In Point',
      context: ['timeline'],
    })

    this.register({
      id: 'mark-out',
      key: 'o',
      action: 'markOut',
      description: 'Set Out Point',
      context: ['timeline'],
    })

    this.register({
      id: 'clear-in-out',
      key: 'x',
      action: 'clearInOut',
      description: 'Clear In/Out Points',
      context: ['timeline'],
    })

    this.register({
      id: 'goto-in',
      key: 'i',
      modifiers: ['shift'],
      action: 'gotoIn',
      description: 'Go to In Point',
      context: ['timeline'],
    })

    this.register({
      id: 'goto-out',
      key: 'o',
      modifiers: ['shift'],
      action: 'gotoOut',
      description: 'Go to Out Point',
      context: ['timeline'],
    })

    // Markers
    this.register({
      id: 'add-marker',
      key: 'm',
      action: 'addMarker',
      description: 'Add Marker',
      context: ['timeline'],
    })

    this.register({
      id: 'next-marker',
      key: 'm',
      modifiers: ['shift'],
      action: 'nextMarker',
      description: 'Next Marker',
      context: ['timeline'],
    })

    // Tools
    this.register({
      id: 'select-tool',
      key: 'v',
      action: 'selectTool',
      description: 'Selection Tool',
      context: ['timeline'],
    })

    // Zoom
    this.register({
      id: 'zoom-in',
      key: '=',
      modifiers: ['cmd'],
      action: 'zoomIn',
      description: 'Zoom In Timeline',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'zoom-out',
      key: '-',
      modifiers: ['cmd'],
      action: 'zoomOut',
      description: 'Zoom Out Timeline',
      context: ['timeline'],
      preventDefault: true
    })

    this.register({
      id: 'zoom-fit',
      key: '\\',
      action: 'zoomFit',
      description: 'Zoom to Fit',
      context: ['timeline'],
    })

    // Snapping
    this.register({
      id: 'toggle-snap',
      key: 'n',
      action: 'toggleSnap',
      description: 'Toggle Snapping',
      context: ['timeline'],
    })

    // Project
    this.register({
      id: 'save',
      key: 's',
      modifiers: ['cmd'],
      action: 'save',
      description: 'Save Project',
      context: ['global'],
      preventDefault: true
    })

    this.register({
      id: 'new-project',
      key: 'n',
      modifiers: ['cmd', 'shift'],
      action: 'newProject',
      description: 'New Project',
      context: ['global'],
      preventDefault: true
    })

    this.register({
      id: 'open-project',
      key: 'o',
      modifiers: ['cmd'],
      action: 'openProject',
      description: 'Open Project',
      context: ['global'],
      preventDefault: true
    })

    this.register({
      id: 'export',
      key: 'e',
      modifiers: ['cmd', 'shift'],
      action: 'export',
      description: 'Export Video',
      context: ['timeline', 'global'],
      preventDefault: true
    })

    // Help
    this.register({
      id: 'show-help',
      key: '?',
      action: 'showHelp',
      description: 'Show Keyboard Shortcuts',
      context: ['global'],
    })

    this.register({
      id: 'show-help-alt',
      key: '/',
      modifiers: ['shift'],
      action: 'showHelp',
      description: 'Show Keyboard Shortcuts',
      context: ['global'],
    })

    // Escape
    this.register({
      id: 'escape',
      key: 'Escape',
      action: 'escape',
      description: 'Cancel/Deselect',
      context: ['timeline', 'global'],
    })
  }

  private initializeListeners() {
    if (typeof window === 'undefined') return

    window.addEventListener('keydown', this.handleKeyDown.bind(this))
    window.addEventListener('keyup', this.handleKeyUp.bind(this))
    window.addEventListener('blur', this.handleBlur.bind(this))
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.enabled) return

    // Skip if typing in input field
    const target = event.target as HTMLElement
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return
    }

    this.pressedKeys.add(event.key.toLowerCase())

    const shortcut = this.findMatchingShortcut(event)
    if (shortcut) {
      if (shortcut.preventDefault) {
        event.preventDefault()
      }

      this.emit('shortcut', {
        shortcut,
        event
      })

      this.emit(shortcut.action, {
        shortcut,
        event
      })
    }
  }

  private handleKeyUp(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase())
  }

  private handleBlur() {
    this.pressedKeys.clear()
  }

  private findMatchingShortcut(event: KeyboardEvent): KeyboardShortcut | null {
    const key = event.key
    const modifiers: ('cmd' | 'ctrl' | 'alt' | 'shift')[] = []

    if (event.metaKey || event.ctrlKey) modifiers.push('cmd')
    if (event.altKey) modifiers.push('alt')
    if (event.shiftKey) modifiers.push('shift')

    // Use Array.from to convert iterator to array
    const shortcuts = Array.from(this.shortcuts.values())

    for (const shortcut of shortcuts) {
      if (!shortcut.context.includes(this.activeContext) && !shortcut.context.includes('global')) {
        continue
      }

      const shortcutMods = shortcut.modifiers || []
      const modsMatch = shortcutMods.length === modifiers.length &&
        shortcutMods.every(mod => modifiers.includes(mod))

      if (shortcut.key === key && modsMatch) {
        return shortcut
      }
    }

    return null
  }

  public register(shortcut: KeyboardShortcut) {
    const id = shortcut.id

    // Check for custom override
    const custom = this.customShortcuts.get(id)
    if (custom) {
      shortcut = { ...shortcut, ...custom }
    }

    this.shortcuts.set(id, shortcut)
  }

  public unregister(id: string) {
    this.shortcuts.delete(id)
  }

  public setContext(context: KeyboardContext) {
    this.activeContext = context
    this.emit('contextChange', context)
  }

  public getContext(): KeyboardContext {
    return this.activeContext
  }

  public enable() {
    this.enabled = true
  }

  public disable() {
    this.enabled = false
  }

  public getShortcuts(context?: KeyboardContext): KeyboardShortcut[] {
    const shortcuts = Array.from(this.shortcuts.values())

    if (context) {
      return shortcuts.filter(s =>
        s.context.includes(context) || s.context.includes('global')
      )
    }

    return shortcuts
  }

  public getShortcutDescription(id: string): string {
    const shortcut = this.shortcuts.get(id)
    if (!shortcut) return ''

    const keys: string[] = []

    if (shortcut.modifiers?.includes('cmd')) keys.push('⌘')
    if (shortcut.modifiers?.includes('ctrl')) keys.push('⌃')
    if (shortcut.modifiers?.includes('alt')) keys.push('⌥')
    if (shortcut.modifiers?.includes('shift')) keys.push('⇧')

    const keyLabel = this.getKeyLabel(shortcut.key)
    keys.push(keyLabel)

    return keys.join('')
  }

  private getKeyLabel(key: string): string {
    const labels: Record<string, string> = {
      ' ': 'Space',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'Delete': '⌫',
      'Backspace': '⌫',
      'Enter': '⏎',
      'Escape': '⎋',
      'Tab': '⇥',
      'PageUp': '⇞',
      'PageDown': '⇟',
      'Home': '↖',
      'End': '↘',
    }

    return labels[key] || key.toUpperCase()
  }

  public customizeShortcut(id: string, customization: Partial<KeyboardShortcut>) {
    this.customShortcuts.set(id, customization)

    // Re-register if it exists
    const existing = this.shortcuts.get(id)
    if (existing) {
      this.register({ ...existing, ...customization })
    }
  }

  public resetShortcuts() {
    this.customShortcuts.clear()
    this.shortcuts.clear()
    this.registerDefaultShortcuts()
  }

  public isPressed(key: string): boolean {
    return this.pressedKeys.has(key.toLowerCase())
  }
}

// Singleton instance
export const keyboardManager = new KeyboardManager()
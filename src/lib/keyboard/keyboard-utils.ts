import type { KeyboardEvent } from '@/types/project'

function hasShift(modifiers: string[] = []): boolean {
  return modifiers.some(m => m.toLowerCase() === 'shift')
}

/**
 * Convert a raw key string (e.g. "KeyA", "Digit1") into a printable character
 * into a printable character for typing overlays and WPM calculation.
 * Returns null for non-printable/control keys.
 */
export function getPrintableCharFromKey(key: string, modifiers: string[] = []): string | null {
  if (!key) return null

  // Direct space / special aliases
  if (key === 'Space' || key === ' ') return ' '

  // uiohook-style key names
  if (key.startsWith('Key') && key.length === 4) {
    const ch = key.charAt(3)
    return hasShift(modifiers) ? ch.toUpperCase() : ch.toLowerCase()
  }
  if (key.startsWith('Digit') && key.length === 6) {
    return key.charAt(5)
  }
  if (key.startsWith('Numpad')) {
    const numpadKey = key.slice(6)
    if (numpadKey.length === 1) return numpadKey
  }

  // Already printable
  if (key.length === 1) return key

  return null
}

export function isStandaloneModifierKey(key: string): boolean {
  const modifierKeys = ['CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'Command', 'Option', 'Fn']
  return modifierKeys.includes(key)
}

export function isShortcutModifier(modifiers: string[] = []): boolean {
  return modifiers.some(m => {
    const lower = m.toLowerCase()
    return lower === 'cmd' || lower === 'meta' || lower === 'command' ||
      lower === 'ctrl' || lower === 'control' ||
      lower === 'alt' || lower === 'option'
  })
}

export function countPrintableCharacters(events: KeyboardEvent[]): number {
  return events.reduce((count, e) => {
    const printable = getPrintableCharFromKey(e.key, e.modifiers)
    return count + (printable ? 1 : 0)
  }, 0)
}

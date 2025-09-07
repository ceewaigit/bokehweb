import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import { initializeCursorDetector } from '../utils/cursor-detector'

// Initialize cursor detector for caret tracking
const cursorDetector = initializeCursorDetector('caret tracking')

// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}

// Caret tracking state
let caretEventSender: WebContents | null = null
let isCaretTracking = false

// Timers for post-keystroke caret sampling
let caretSampleTimerShort: NodeJS.Timeout | null = null
let caretSampleTimerLong: NodeJS.Timeout | null = null
// Polling loop while typing to capture exact caret movement during layout
let caretPollInterval: NodeJS.Timeout | null = null
let caretPollUntil = 0

// Track last known native caret position
let lastCaretAt = 0
let lastCaretPos: { x: number; y: number; width: number; height: number; scale: number } | null = null

// Try to get the ACTUAL insertion point (blinking caret) via macOS Accessibility
function getNativeCaretPosition(): { x: number; y: number; width: number; height: number; scale: number } | null {
  try {
    if (!cursorDetector || typeof cursorDetector.getInsertionPointScreenRect !== 'function') {
      console.log('[CARET] No cursor detector or getInsertionPointScreenRect function')
      return null
    }
    const rect = cursorDetector.getInsertionPointScreenRect()
    if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number') {
      console.log('[CARET] Invalid rect from getInsertionPointScreenRect:', rect)
      return null
    }
    // Log the raw rect from native to debug position updates
    console.log('[CARET-RAW] Native rect:', rect)
    const disp = screen.getDisplayNearestPoint({ x: Math.round(rect.x), y: Math.round(rect.y) })
    const scale = (rect.scale || disp?.scaleFactor || 1)
    // Convert to physical pixels based on backing scale
    return {
      x: (rect.x || 0) * scale,
      y: (rect.y || 0) * scale,
      width: Math.max(1, (rect.width || 1) * scale),
      height: Math.max(1, (rect.height || 12) * scale),
      scale
    }
  } catch (e) {
    logger.debug('getNativeCaretPosition failed', e)
    return null
  }
}

// Emit a caret event if native caret is available; returns true if emitted
export function emitNativeCaretIfAvailable(reason: string): boolean {
  try {
    const now = Date.now()
    const nativeCaret = getNativeCaretPosition()
    if (caretEventSender && nativeCaret) {
      // Already in physical pixels; just use them
      const pxX = Math.round(nativeCaret.x)
      const pxY = Math.round(nativeCaret.y)
      const pxW = Math.max(1, Math.round(nativeCaret.width))
      const pxH = Math.max(1, Math.round(nativeCaret.height))

      lastCaretAt = now
      lastCaretPos = { x: pxX, y: pxY, width: pxW, height: pxH, scale: nativeCaret.scale }
      const eventData = {
        timestamp: now,
        x: pxX,
        y: pxY,
        bounds: { x: pxX, y: pxY, width: pxW, height: pxH }
      }
      caretEventSender.send('caret-event', eventData)
      console.log(`[CaretEmit] source=native:${reason}`, {
        x: pxX,
        y: pxY,
        width: pxW,
        height: pxH,
        scale: nativeCaret.scale,
        timestamp: now - (global as any).recordingStartTime || 0
      })
      return true
    }
  } catch { }
  return false
}

export function ensureCaretPolling(durationMs: number): void {
  const now = Date.now()
  caretPollUntil = Math.max(caretPollUntil, now + durationMs)
  if (caretPollInterval) return
  caretPollInterval = setInterval(() => {
    const t = Date.now()
    if (t > caretPollUntil) {
      if (caretPollInterval) {
        clearInterval(caretPollInterval)
        caretPollInterval = null
      }
      return
    }
    emitNativeCaretIfAvailable('poll')
  }, 16)
}

// Handle keyboard-triggered caret updates
export function handleKeyboardCaretUpdate(type: 'keydown' | 'keyup'): void {
  if (!isCaretTracking) return

  if (type === 'keydown') {
    // Emit caret event immediately and start short polling to capture exact movement while layout updates
    console.log('[CARET] Keydown detected, attempting to emit caret')
    try {
      const emitted = emitNativeCaretIfAvailable('immediate-keydown')
      console.log('[CARET] Immediate keydown emit result:', emitted)
    } catch (e) {
      console.log('[CARET] Error emitting caret on keydown:', e)
    }

    if (caretSampleTimerShort) clearTimeout(caretSampleTimerShort)
    if (caretSampleTimerLong) clearTimeout(caretSampleTimerLong)
    caretSampleTimerShort = setTimeout(() => {
      emitNativeCaretIfAvailable('delayed-20ms')
    }, 20)
    caretSampleTimerLong = setTimeout(() => {
      emitNativeCaretIfAvailable('delayed-80ms')
    }, 80)

    ensureCaretPolling(120)
  } else if (type === 'keyup') {
    // Final caret sample after keyup to catch any deferred layout
    if (caretSampleTimerShort) clearTimeout(caretSampleTimerShort)
    caretSampleTimerShort = setTimeout(() => {
      emitNativeCaretIfAvailable('keyup-20ms')
    }, 20)

    ensureCaretPolling(80)
  }
}

export function registerCaretTrackingHandlers(): void {
  ipcMain.handle('start-caret-tracking', async (event: IpcMainInvokeEvent) => {
    try {
      // Store recording start time for timestamp calculation
      (global as any).recordingStartTime = Date.now()

      // Check accessibility permissions when starting caret tracking
      if (cursorDetector && !cursorDetector.hasAccessibilityPermissions()) {
        logger.warn('⚠️ No accessibility permissions for caret detection')
        // Request permissions
        const { dialog, shell, BrowserWindow } = require('electron')
        const win = BrowserWindow.getFocusedWindow()
        dialog.showMessageBox(win || null, {
          type: 'info',
          title: 'Accessibility Permissions Required',
          message: 'Grant accessibility permissions for accurate caret detection',
          detail: 'This allows FlowCapture to detect the text cursor position in your applications',
          buttons: ['Open System Settings', 'Not Now']
        }).then((result: any) => {
          if (result.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
          }
        })
      }

      caretEventSender = event.sender
      isCaretTracking = true

      logger.info('Caret tracking started successfully')

      return {
        success: true,
        nativeTracking: true
      }
    } catch (error: any) {
      logger.error('Error starting caret tracking:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('stop-caret-tracking', async () => {
    try {
      isCaretTracking = false
      caretEventSender = null

      // Clear any pending caret sampling timers
      if (caretSampleTimerShort) {
        clearTimeout(caretSampleTimerShort)
        caretSampleTimerShort = null
      }
      if (caretSampleTimerLong) {
        clearTimeout(caretSampleTimerLong)
        caretSampleTimerLong = null
      }
      if (caretPollInterval) {
        clearInterval(caretPollInterval)
        caretPollInterval = null
        caretPollUntil = 0
      }

      // Reset state
      lastCaretAt = 0
      lastCaretPos = null

      logger.info('Caret tracking stopped successfully')

      return { success: true }
    } catch (error: any) {
      logger.error('Error stopping caret tracking:', error)
      return { success: false, error: error.message }
    }
  })
}

export function cleanupCaretTracking(): void {
  isCaretTracking = false
  caretEventSender = null

  // Clear any pending timers
  if (caretSampleTimerShort) {
    clearTimeout(caretSampleTimerShort)
    caretSampleTimerShort = null
  }
  if (caretSampleTimerLong) {
    clearTimeout(caretSampleTimerLong)
    caretSampleTimerLong = null
  }
  if (caretPollInterval) {
    clearInterval(caretPollInterval)
    caretPollInterval = null
    caretPollUntil = 0
  }
}
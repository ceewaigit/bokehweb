import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import * as path from 'path'
import { desktopCapturer } from 'electron'

// Lazy load uiohook-napi to handle initialization errors
let uIOhook: any = null

try {
  const uiohookModule = require('uiohook-napi')
  uIOhook = uiohookModule.uIOhook
  console.log('uiohook-napi loaded successfully')
} catch (error) {
  console.error('Failed to load uiohook-napi:', error)
}

// Native cursor detector module (macOS only)
let cursorDetector: any = null
if (process.platform === 'darwin') {
  console.log('Platform is macOS, attempting to load cursor detector...')

  try {
    // Webpack's node-loader will handle this static require and package the addon correctly
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cursorDetector = require('../../../build/Release/cursor_detector.node')
    console.log('✅ Native cursor detector loaded successfully')

    // Check if we have permissions on load
    if (cursorDetector && cursorDetector.hasAccessibilityPermissions) {
      const hasPermissions = cursorDetector.hasAccessibilityPermissions()
      console.log(`Accessibility permissions: ${hasPermissions ? '✅ Granted' : '❌ Not granted'}`)
    }
  } catch (error) {
    console.error('Failed to load cursor detector:', error)
  }
}

// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}

let mouseTrackingInterval: NodeJS.Timeout | null = null
let mouseEventSender: WebContents | null = null
let isMouseTracking = false
let clickDetectionActive = false
let mouseHistory: Array<{ x: number; y: number; time: number }> = []
let uiohookStarted = false
let isMouseDown = false
let lastClickPosition = { x: 0, y: 0 }
let isKeyboardTracking = false
let keyboardEventSender: WebContents | null = null

// Timers for post-keystroke caret sampling
let caretSampleTimerShort: NodeJS.Timeout | null = null
let caretSampleTimerLong: NodeJS.Timeout | null = null
// Polling loop while typing to capture exact caret movement during layout
let caretPollInterval: NodeJS.Timeout | null = null
let caretPollUntil = 0

// Track last known native caret position
let lastCaretAt = 0
let lastCaretPos: { x: number; y: number; width: number; height: number; scale: number } | null = null
// Bounds of recorded area in PHYSICAL pixels for caret filtering
let recordedCaretBoundsPhysical: { x: number; y: number; width: number; height: number } | null = null

// Try to get the ACTUAL insertion point (blinking caret) via macOS Accessibility
function getNativeCaretPosition(): { x: number; y: number; width: number; height: number; scale: number } | null {
  try {
    if (!cursorDetector || typeof cursorDetector.getInsertionPointScreenRect !== 'function') return null
    const rect = cursorDetector.getInsertionPointScreenRect()
    if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number') return null
    const disp = screen.getDisplayNearestPoint({ x: Math.round(rect.x), y: Math.round(rect.y) })
    const scale = (rect.scale || disp?.scaleFactor || 1)
    // Convert to physical pixels based on backing scale
    return { x: (rect.x || 0) * scale, y: (rect.y || 0) * scale, width: Math.max(1, (rect.width || 1) * scale), height: Math.max(1, (rect.height || 12) * scale), scale }
  } catch (e) {
    logger.debug('getNativeCaretPosition failed', e)
    return null
  }
}

// Emit a caret event if native caret is available; returns true if emitted
function emitNativeCaretIfAvailable(reason: string): boolean {
  try {
    const now = Date.now()
    const nativeCaret = getNativeCaretPosition()
    const sender: WebContents | null = mouseEventSender || keyboardEventSender
    if (sender && nativeCaret) {
      // Already in physical pixels; just use them
      const pxX = Math.round(nativeCaret.x)
      const pxY = Math.round(nativeCaret.y)
      const pxW = Math.max(1, Math.round(nativeCaret.width))
      const pxH = Math.max(1, Math.round(nativeCaret.height))



      lastCaretAt = now
      lastCaretPos = { x: pxX, y: pxY, width: pxW, height: pxH, scale: nativeCaret.scale }
      sender!.send('caret-event', {
        timestamp: now,
        x: pxX,
        y: pxY,
        bounds: { x: pxX, y: pxY, width: pxW, height: pxH }
      })
      logger.debug(`[CaretEmit] source=native:${reason}`, { x: pxX, y: pxY, width: pxW, height: pxH, scale: nativeCaret.scale })
      return true
    }
  } catch {}
  return false
}

function ensureCaretPolling(durationMs: number): void {
  const now = Date.now()
  caretPollUntil = Math.max(caretPollUntil, now + durationMs)
  if (caretPollInterval) return
  caretPollInterval = setInterval(() => {
    const t = Date.now()
    if (t > caretPollUntil) {
      if (caretPollInterval) { clearInterval(caretPollInterval); caretPollInterval = null }
      return
    }
    emitNativeCaretIfAvailable('poll')
  }, 16)
}

interface MouseTrackingOptions {
  intervalMs?: number
  sourceType?: 'screen' | 'window'
  sourceId?: string
}

interface MousePosition {
  x: number
  y: number
  timestamp: number
  velocity?: { x: number; y: number }
  acceleration?: { x: number; y: number }
  displayBounds?: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
  cursorType?: string
  sourceType?: 'screen' | 'window' | 'area'
  sourceId?: string
}

export function registerMouseTrackingHandlers(): void {
  ipcMain.handle('start-mouse-tracking', async (event: IpcMainInvokeEvent, options: MouseTrackingOptions = {}) => {
    
    try {
      // Check accessibility permissions when starting mouse tracking
      if (cursorDetector && !cursorDetector.hasAccessibilityPermissions()) {
        console.log('⚠️ No accessibility permissions for cursor detection')
        // Request permissions
        const { dialog, shell, BrowserWindow } = require('electron')
        const win = BrowserWindow.getFocusedWindow()
        dialog.showMessageBox(win || null, {
          type: 'info',
          title: 'Accessibility Permissions Required',
          message: 'Grant accessibility permissions for accurate cursor detection',
          detail: 'This allows FlowCapture to detect when your cursor changes to text selection, pointer, and other states',
          buttons: ['Open System Settings', 'Not Now']
        }).then((result: any) => {
          if (result.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
          }
        })
      }

      const intervalMs = Math.max(8, Math.min(1000, parseInt(String(options.intervalMs)) || 8))
      const sourceType = options.sourceType || 'screen'
      const sourceId = options.sourceId

      mouseEventSender = event.sender
      isMouseTracking = true

      // Compute recorded area bounds in PHYSICAL pixels for caret filtering
      recordedCaretBoundsPhysical = null
      try {
        if (sourceType === 'screen' && typeof sourceId === 'string') {
          const m = sourceId.match(/screen:(\d+):/)
          if (m) {
            const displayId = parseInt(m[1])
            const disp = screen.getAllDisplays().find(d => d.id === displayId)
            if (disp) {
              const s = disp.scaleFactor || 1
              recordedCaretBoundsPhysical = {
                x: Math.round(disp.bounds.x * s),
                y: Math.round(disp.bounds.y * s),
                width: Math.round(disp.bounds.width * s),
                height: Math.round(disp.bounds.height * s)
              }
            }
          }
        } else if (sourceType === 'window' && typeof sourceId === 'string') {
          try {
            const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1, height: 1 } })
            const src = sources.find(s => s.id === sourceId)
            if (src) {
              const { getWindowBoundsForSource } = await import('../native/window-bounds')
              const b = await getWindowBoundsForSource(src.name)
              if (b) {
                // window-bounds returns logical coordinates; convert to PHYSICAL using containing display scale
                const containing = screen.getDisplayNearestPoint({ x: b.x, y: b.y })
                const s = containing?.scaleFactor || 1
                recordedCaretBoundsPhysical = {
                  x: Math.round(b.x * s),
                  y: Math.round(b.y * s),
                  width: Math.round(b.width * s),
                  height: Math.round(b.height * s)
                }
              }
            }
          } catch {}
        }
      } catch {}

      // Start click detection using global mouse hooks with source info
      startClickDetection(sourceType, sourceId)
      
      // Also start keyboard tracking
      startKeyboardTracking(event.sender)

      // Also start scroll detection
      startScrollDetection(event.sender)

      // Remove periodic caret polling; caret is emitted on keydown only

      // Attach stop hook into stop-mouse-tracking cleanup path below

      let lastPosition: Electron.Point | null = null
      let lastVelocity = { x: 0, y: 0 }
      let lastTime = Date.now()
      // Stabilize cursor transitions to avoid rapid pointer/text flips
      let stableCursorType = 'default'
      let candidateCursorType: string | null = null
      let candidateSince = 0
      const cursorStabilizeMs = 30

      mouseTrackingInterval = setInterval(() => {
        if (!isMouseTracking || !mouseEventSender) return

        try {
          const currentPosition = screen.getCursorScreenPoint()
          const now = Date.now()
          const disp = screen.getDisplayNearestPoint(currentPosition)
          const scale = disp.scaleFactor || 1
          lastPosition = currentPosition

          // Compute velocity
          if (lastPosition) {
            const dt = Math.max(1, now - lastTime)
            const vx = (currentPosition.x - lastPosition.x) / dt
            const vy = (currentPosition.y - lastPosition.y) / dt
            const smoothing = 0.2
            lastVelocity = {
              x: lastVelocity.x + (vx - lastVelocity.x) * smoothing,
              y: lastVelocity.y + (vy - lastVelocity.y) * smoothing
            }
          }

          lastTime = now

          // Determine display and scale factor
          const display = screen.getDisplayNearestPoint(currentPosition)
          const scaleFactor = display.scaleFactor || 1

          // Convert to physical pixels for consistency
          const positionData = {
            x: currentPosition.x * scaleFactor,
            y: currentPosition.y * scaleFactor,
            displayBounds: display.bounds,
            scaleFactor
          }

          // Store history for smoothing and acceleration calculation
          mouseHistory.push({ x: positionData.x, y: positionData.y, time: now })
          if (mouseHistory.length > 5) mouseHistory.shift()

          // Calculate acceleration (simple diff of velocities)
          let acceleration = { x: 0, y: 0 }
          if (mouseHistory.length >= 3) {
            const v1x = (mouseHistory[2].x - mouseHistory[1].x) / (mouseHistory[2].time - mouseHistory[1].time)
            const v1y = (mouseHistory[2].y - mouseHistory[1].y) / (mouseHistory[2].time - mouseHistory[1].time)
            const v0x = (mouseHistory[1].x - mouseHistory[0].x) / (mouseHistory[1].time - mouseHistory[0].time)
            const v0y = (mouseHistory[1].y - mouseHistory[0].y) / (mouseHistory[1].time - mouseHistory[0].time)
            acceleration = { x: v1x - v0x, y: v1y - v0y }
          }

          // Detect cursor type using native module when available
          let usedCursorType = 'default'
          if (cursorDetector) {
            try {
              usedCursorType = cursorDetector.getCurrentCursorType()
            } catch (err) {
              // ignore
            }
          }

          // Stabilize cursor transitions (debounce)
          if (usedCursorType === stableCursorType) {
            candidateCursorType = null
          } else {
            if (candidateCursorType !== usedCursorType) {
              candidateCursorType = usedCursorType
              candidateSince = now
            } else if (now - candidateSince >= cursorStabilizeMs) {
              stableCursorType = usedCursorType
              candidateCursorType = null
            }
          }

          const finalCursorType = stableCursorType

          // Only log on stable changes
          if ((global as any).lastLoggedCursor !== finalCursorType) {
            console.log(`[CURSOR] Type changed: ${(global as any).lastLoggedCursor || 'none'} -> ${finalCursorType}`)
            ; (global as any).lastLoggedCursor = finalCursorType
          }

          // Only log in development mode
          if (process.env.NODE_ENV === 'development' && mouseHistory.length % 500 === 0) {
            console.log('Mouse tracking active')
          }

          // Send enhanced mouse data with velocity for smooth interpolation
          mouseEventSender.send('mouse-move', {
            x: positionData.x,
            y: positionData.y,
            timestamp: now,
            velocity: lastVelocity,
            acceleration,
            displayBounds: positionData.displayBounds,
            scaleFactor: positionData.scaleFactor,
            cursorType: finalCursorType,
            sourceType: sourceType,
            sourceId: sourceId
          } as MousePosition)

        } catch (error) {
          logger.error('Error tracking mouse:', error)
        }
      }, intervalMs)


      return {
        success: true,
        nativeTracking: true,
        fps: Math.round(1000 / intervalMs)
      }
    } catch (error: any) {
      logger.error('Error starting mouse tracking:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('stop-mouse-tracking', async () => {
    try {
      if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval)
        mouseTrackingInterval = null
      }

      isMouseTracking = false
      recordedCaretBoundsPhysical = null

      // Stop click detection
      stopClickDetection()

      // Stop scroll detection
      stopScrollDetection()

      // Reset mouse history and state
      mouseHistory = []
      isMouseDown = false
      lastClickPosition = { x: 0, y: 0 }

      mouseEventSender = null

      return { success: true }
    } catch (error: any) {
      logger.error('Error stopping mouse tracking:', error)
      return { success: false, error: error.message }
    }
  })
  
  ipcMain.handle('start-keyboard-tracking', async (event: IpcMainInvokeEvent) => {
    try {
      startKeyboardTracking(event.sender)
      return { success: true }
    } catch (error: any) {
      logger.error('Error starting keyboard tracking:', error)
      return { success: false, error: error.message }
    }
  })
  
  ipcMain.handle('stop-keyboard-tracking', async () => {
    try {
      stopKeyboardTracking()
      return { success: true }
    } catch (error: any) {
      logger.error('Error stopping keyboard tracking:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-mouse-position', async () => {
    try {
      const position = screen.getCursorScreenPoint()
      return {
        success: true,
        position: {
          x: position.x,
          y: position.y
        }
      }
    } catch (error: any) {
      logger.error('Error getting mouse position:', error)
      return { success: false, error: error.message }
    }
  })

}

function startClickDetection(sourceType?: 'screen' | 'window', sourceId?: string): void {
  if (clickDetectionActive) return

  // Check if uiohook is available
  if (!uIOhook) {
    logger.warn('uiohook-napi not available, click detection disabled')
    return
  }

  clickDetectionActive = true

  try {
    // Start uiohook if not already started
    if (!uiohookStarted) {
      logger.info('Starting uiohook-napi...')
      uIOhook.start()
      uiohookStarted = true
      logger.info('uiohook-napi started successfully')
    }

    // Register global mouse event handlers
    const handleMouseDown = (event: any) => {
      if (!isMouseTracking || !mouseEventSender) return

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

      // Send click event with coordinates in physical pixels to match capture dimensions
      const physicalClickX = event.x * scaleFactor
      const physicalClickY = event.y * scaleFactor

      // Track mouse down state for cursor detection
      isMouseDown = true
      lastClickPosition = { x: physicalClickX, y: physicalClickY }

      // Get cursor type at click position
      let clickCursorType = 'pointer' // Default for clicks
      if (cursorDetector) {
        try {
          clickCursorType = cursorDetector.getCurrentCursorType()
        } catch (err) {
          // Keep pointer as default
        }
      }
      
      mouseEventSender.send('mouse-click', {
        x: physicalClickX,
        y: physicalClickY,
        timestamp: Date.now(),
        button: event.button === 1 ? 'left' : event.button === 2 ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: clickCursorType,  // Use detected cursor type
        sourceType: sourceType || 'screen',
        sourceId: sourceId,
        // Store logical coordinates for debugging
        logicalX: event.x,
        logicalY: event.y
      })


      logger.debug(`Mouse down at (${event.x}, ${event.y})`)
    }

    const handleMouseUp = (event: any) => {
      if (!isMouseTracking) return

      // Track mouse up state for cursor detection
      isMouseDown = false

      logger.debug(`Mouse up at (${event.x}, ${event.y})`)
    }

    // Register the mouse event listeners
    uIOhook.on('mousedown', handleMouseDown)
    uIOhook.on('mouseup', handleMouseUp)

      // Store the handlers for cleanup
      ; (global as any).uiohookMouseDownHandler = handleMouseDown
      ; (global as any).uiohookMouseUpHandler = handleMouseUp

    logger.info('Mouse event handlers registered successfully')

  } catch (error) {
    logger.error('Failed to start global click detection:', error)
    clickDetectionActive = false
  }
}

function stopClickDetection(): void {
  clickDetectionActive = false
  try {
    if (uIOhook) {
      if ((global as any).uiohookMouseDownHandler) {
        uIOhook.off('mousedown', (global as any).uiohookMouseDownHandler)
        ; (global as any).uiohookMouseDownHandler = null
      }
      if ((global as any).uiohookMouseUpHandler) {
        uIOhook.off('mouseup', (global as any).uiohookMouseUpHandler)
        ; (global as any).uiohookMouseUpHandler = null
      }
    }
  } catch (error) {
    logger.error('Error stopping click detection:', error)
  }
}

// Scroll detection using uiohook 'wheel' event
function startScrollDetection(sender: WebContents): void {
  if (!uIOhook) {
    logger.warn('uiohook-napi not available, scroll detection disabled')
    return
  }

  try {
    if (!uiohookStarted) {
      logger.info('Starting uiohook-napi for scroll tracking...')
      uIOhook.start()
      uiohookStarted = true
    }

    const handleWheel = (event: any) => {
      if (!isMouseTracking || !sender) return
      // event.rotation, event.amount, event.direction may vary by platform; normalize to deltaX/deltaY
      const deltaX = event.rotation ? (event.rotationX || 0) : (event.deltaX || 0)
      const deltaY = event.rotation ? (event.rotationY || 0) : (event.deltaY || (event.amount || 0) * (event.direction === 3 ? -1 : 1))

      sender.send('scroll-event', {
        timestamp: Date.now(),
        deltaX: Number(deltaX) || 0,
        deltaY: Number(deltaY) || 0
      })
    }

    uIOhook.on('wheel', handleWheel)
    ;(global as any).uiohookWheelHandler = handleWheel

    logger.info('Scroll detection started')
  } catch (error) {
    logger.error('Failed to start scroll detection:', error)
  }
}

function stopScrollDetection(): void {
  try {
    if (uIOhook && (global as any).uiohookWheelHandler) {
      uIOhook.off('wheel', (global as any).uiohookWheelHandler)
      ;(global as any).uiohookWheelHandler = null
      logger.info('Scroll detection stopped')
    }
  } catch (error) {
    logger.error('Failed to stop scroll detection:', error)
  }
}

// Keyboard tracking functions
function startKeyboardTracking(sender: WebContents): void {
  if (isKeyboardTracking) return
  
  // Check if uiohook is available
  if (!uIOhook) {
    logger.warn('uiohook-napi not available, keyboard tracking disabled')
    return
  }
  
  isKeyboardTracking = true
  keyboardEventSender = sender
  
  try {
    // Start uiohook if not already started
    if (!uiohookStarted) {
      logger.info('Starting uiohook-napi for keyboard tracking...')
      uIOhook.start()
      uiohookStarted = true
      logger.info('uiohook-napi started successfully')
    }
    
    // Register keyboard event handlers
    const handleKeyDown = (event: any) => {
      if (!isKeyboardTracking || !keyboardEventSender) return
      
      // Extract modifiers
      const modifiers: string[] = []
      if (event.metaKey || event.ctrlKey) modifiers.push('cmd')
      if (event.altKey) modifiers.push('alt')
      if (event.shiftKey) modifiers.push('shift')
      
      // Convert keycode to readable key
      const key = getKeyFromCode(event.keycode)
      
      // Send keyboard event
      keyboardEventSender.send('keyboard-event', {
        type: 'keydown',
        key,
        modifiers,
        timestamp: Date.now(),
        rawKeycode: event.keycode
      })

      // Emit caret event immediately and start short polling to capture exact movement while layout updates
      try {
        emitNativeCaretIfAvailable('immediate-keydown')
      } catch {}

      if (caretSampleTimerShort) clearTimeout(caretSampleTimerShort)
      if (caretSampleTimerLong) clearTimeout(caretSampleTimerLong)
      caretSampleTimerShort = setTimeout(() => {
        emitNativeCaretIfAvailable('delayed-20ms')
      }, 20)
      caretSampleTimerLong = setTimeout(() => {
        emitNativeCaretIfAvailable('delayed-80ms')
      }, 80)

      ensureCaretPolling(120)
    }
    
    const handleKeyUp = (event: any) => {
      if (!isKeyboardTracking || !keyboardEventSender) return
      
      const key = getKeyFromCode(event.keycode)
      
      keyboardEventSender.send('keyboard-event', {
        type: 'keyup',
        key,
        timestamp: Date.now(),
        rawKeycode: event.keycode
      })

      // Final caret sample after keyup to catch any deferred layout
      if (caretSampleTimerShort) clearTimeout(caretSampleTimerShort)
      caretSampleTimerShort = setTimeout(() => {
        emitNativeCaretIfAvailable('keyup-20ms')
      }, 20)

      ensureCaretPolling(80)
    }
    
    // Register the handlers
    uIOhook.on('keydown', handleKeyDown)
    uIOhook.on('keyup', handleKeyUp)
    
    // Store handlers for cleanup
    ;(global as any).uiohookKeyDownHandler = handleKeyDown
    ;(global as any).uiohookKeyUpHandler = handleKeyUp
    
    logger.info('Keyboard tracking started successfully')
    
  } catch (error) {
    logger.error('Failed to start keyboard tracking:', error)
  }
}

function stopKeyboardTracking(): void {
  isKeyboardTracking = false
  try {
    if (uIOhook) {
      if ((global as any).uiohookKeyDownHandler) {
        uIOhook.off('keydown', (global as any).uiohookKeyDownHandler)
        ;(global as any).uiohookKeyDownHandler = null
      }
      if ((global as any).uiohookKeyUpHandler) {
        uIOhook.off('keyup', (global as any).uiohookKeyUpHandler)
        ;(global as any).uiohookKeyUpHandler = null
      }
    }
  } catch (error) {
    logger.error('Error stopping keyboard tracking:', error)
  }

  // Clear any pending caret sampling timers
  if (caretSampleTimerShort) { clearTimeout(caretSampleTimerShort); caretSampleTimerShort = null }
  if (caretSampleTimerLong) { clearTimeout(caretSampleTimerLong); caretSampleTimerLong = null }
  if (caretPollInterval) { clearInterval(caretPollInterval); caretPollInterval = null; caretPollUntil = 0 }
}

function getKeyFromCode(code: number): string {
  // Simplified mapping; can be extended
  const map: Record<number, string> = {
    36: 'Return',
    49: 'Space',
    51: 'Backspace',
    53: 'Escape'
  }
  return map[code] || String(code)
}

export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
  stopClickDetection()
  stopKeyboardTracking()
  stopScrollDetection()

  // Ensure uiohook is fully cleaned up
  if (uiohookStarted) {
    try {
      uIOhook.stop()
      uiohookStarted = false
    } catch (error) {
      logger.error('Error in cleanup:', error)
    }
  }
}
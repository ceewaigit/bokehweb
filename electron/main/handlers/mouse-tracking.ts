import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import * as path from 'path'

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

interface MouseTrackingOptions {
  intervalMs?: number
  sourceId?: string
  sourceType?: 'screen' | 'window'
}

interface MousePosition {
  x: number
  y: number
  timestamp?: number
  velocity?: { x: number; y: number }
  acceleration?: { x: number; y: number }
}


export function registerMouseTrackingHandlers(): void {
  ipcMain.handle('start-mouse-tracking', async (event: IpcMainInvokeEvent, options: MouseTrackingOptions = {}) => {
    try {
      // Check accessibility permissions when starting mouse tracking
      if (cursorDetector && !cursorDetector.hasAccessibilityPermissions()) {
        console.log('⚠️ No accessibility permissions for cursor detection')

        // Request permissions
        const granted = cursorDetector.requestAccessibilityPermissions()

        if (!granted) {
          // Show user-friendly dialog
          const { dialog, shell, BrowserWindow } = require('electron')
          const mainWindow = BrowserWindow.getFocusedWindow()

          if (mainWindow) {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Enable Cursor Detection',
              message: 'Grant accessibility permissions for accurate cursor detection',
              detail: 'This allows FlowCapture to detect when your cursor changes to text selection, pointer, and other states during recording.\n\nYou\'ll need to:\n1. Click "Open Settings"\n2. Find FlowCapture or Electron in the list\n3. Toggle it ON\n4. Restart recording',
              buttons: ['Open Settings', 'Continue Without'],
              defaultId: 0,
              cancelId: 1,
              noLink: true
            })

            if (result.response === 0) {
              shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
            }
          }
        }
      }

      if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval)
      }

      if (typeof options !== 'object' || options === null) {
        options = {}
      }

      // Use 8ms interval for 125Hz tracking (Screen Studio quality)
      const intervalMs = Math.max(8, Math.min(1000, parseInt(String(options.intervalMs)) || 8))
      const sourceType = options.sourceType || 'screen'
      const sourceId = options.sourceId

      mouseEventSender = event.sender
      isMouseTracking = true


      // Start click detection using global mouse hooks with source info
      startClickDetection(sourceType, sourceId)
      
      // Also start keyboard tracking
      startKeyboardTracking(event.sender)

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
          const deltaTime = (now - lastTime) / 1000 // Convert to seconds

          if (!lastPosition ||
            lastPosition.x !== currentPosition.x ||
            lastPosition.y !== currentPosition.y) {

            // Get the display to find out the screen bounds
            const currentDisplay = screen.getDisplayNearestPoint(currentPosition)
            const scaleFactor = currentDisplay.scaleFactor || 1

            // Calculate velocity and acceleration for smooth interpolation
            let velocity = { x: 0, y: 0 }
            let acceleration = { x: 0, y: 0 }

            if (lastPosition && deltaTime > 0) {
              // Calculate velocity (pixels per second)
              velocity = {
                x: (currentPosition.x - lastPosition.x) / deltaTime,
                y: (currentPosition.y - lastPosition.y) / deltaTime
              }

              // Calculate acceleration for motion blur
              acceleration = {
                x: (velocity.x - lastVelocity.x) / deltaTime,
                y: (velocity.y - lastVelocity.y) / deltaTime
              }

              // Smooth velocity with exponential moving average
              velocity.x = lastVelocity.x * 0.3 + velocity.x * 0.7
              velocity.y = lastVelocity.y * 0.3 + velocity.y * 0.7
            }

            // Send position in LOGICAL pixels with scale factor
            // The recording side will decide how to transform based on video resolution
            const positionData = {
              x: Math.round(currentPosition.x * 100) / 100, // Sub-pixel precision
              y: Math.round(currentPosition.y * 100) / 100,
              time: now,
              // Include display info for proper coordinate transformation
              displayBounds: currentDisplay.bounds,
              scaleFactor: scaleFactor
            }

            // Update mouse history for velocity analysis
            mouseHistory.push(positionData)
            if (mouseHistory.length > 20) { // Keep more history for better analysis
              mouseHistory.shift()
            }


            // Store last position for next frame
            lastVelocity = velocity
            lastTime = now

            // Get cursor type from native detector
            let cursorType = 'default'

            if (cursorDetector) {
              try {
                cursorType = cursorDetector.getCurrentCursorType()
              } catch (err) {
                console.error('[CURSOR] Detection error:', err)
              }
            }

            // Override with grabbing when dragging
            let usedCursorType = cursorType
            if (isMouseDown) {
              const dragDistance = Math.sqrt(
                Math.pow(currentPosition.x - lastClickPosition.x, 2) +
                Math.pow(currentPosition.y - lastClickPosition.y, 2)
              )

              if (dragDistance > 5) {
                usedCursorType = 'grabbing'
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
              velocity,
              acceleration,
              displayBounds: positionData.displayBounds,
              scaleFactor: positionData.scaleFactor,
              cursorType: finalCursorType,  // Use stabilized cursor type
              sourceType: sourceType,  // Include source type for proper coordinate mapping
              sourceId: sourceId
            } as MousePosition)

            lastPosition = currentPosition
          }
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

      // Stop click detection
      stopClickDetection()

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

  ipcMain.handle('is-native-mouse-tracking-available', async () => {
    return {
      available: true,
      tracker: true
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

      // Track mouse down state for cursor detection
      isMouseDown = true
      lastClickPosition = { x: event.x, y: event.y }

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

      // Get cursor type at click position
      let clickCursorType = 'pointer' // Default for clicks
      if (cursorDetector) {
        try {
          clickCursorType = cursorDetector.getCurrentCursorType()
        } catch (err) {
          // Keep pointer as default
        }
      }

      // Send click event with proper coordinates
      mouseEventSender.send('mouse-click', {
        x: event.x,
        y: event.y,
        timestamp: Date.now(),
        button: event.button === 1 ? 'left' : event.button === 2 ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: clickCursorType,  // Use detected cursor type
        sourceType: sourceType || 'screen',
        sourceId: sourceId
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

  // Reset mouse state
  isMouseDown = false

  if (!uIOhook) return

  try {
    // Remove all mouse handlers
    if ((global as any).uiohookMouseDownHandler) {
      uIOhook.off('mousedown', (global as any).uiohookMouseDownHandler)
      delete (global as any).uiohookMouseDownHandler
    }

    if ((global as any).uiohookMouseUpHandler) {
      uIOhook.off('mouseup', (global as any).uiohookMouseUpHandler)
      delete (global as any).uiohookMouseUpHandler
    }

    // Stop uiohook if no longer needed
    if (uiohookStarted) {
      uIOhook.stop()
      uiohookStarted = false
      logger.info('uiohook-napi stopped')
    }
  } catch (error) {
    logger.error('Error stopping click detection:', error)
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
    isKeyboardTracking = false
  }
}

function stopKeyboardTracking(): void {
  isKeyboardTracking = false
  keyboardEventSender = null
  
  if (!uIOhook) return
  
  try {
    // Remove keyboard handlers
    if ((global as any).uiohookKeyDownHandler) {
      uIOhook.off('keydown', (global as any).uiohookKeyDownHandler)
      delete (global as any).uiohookKeyDownHandler
    }
    
    if ((global as any).uiohookKeyUpHandler) {
      uIOhook.off('keyup', (global as any).uiohookKeyUpHandler)
      delete (global as any).uiohookKeyUpHandler
    }
    
    logger.info('Keyboard tracking stopped')
  } catch (error) {
    logger.error('Error stopping keyboard tracking:', error)
  }
}

// Helper function to convert keycodes to readable keys
function getKeyFromCode(keycode: number): string {
  // uiohook-napi keycodes - cross-platform standard
  const keyMap: Record<number, string> = {
    // Letters
    30: 'a', 48: 'b', 46: 'c', 32: 'd', 18: 'e', 33: 'f', 34: 'g', 35: 'h',
    23: 'i', 36: 'j', 37: 'k', 38: 'l', 50: 'm', 49: 'n', 24: 'o', 25: 'p',
    16: 'q', 19: 'r', 31: 's', 20: 't', 22: 'u', 47: 'v', 17: 'w', 45: 'x',
    21: 'y', 44: 'z',
    
    // Numbers
    2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
    
    // Special characters
    12: '-', 13: '=', 26: '[', 27: ']', 43: '\\', 39: ';', 40: "'",
    41: '`', 51: ',', 52: '.', 53: '/',
    
    // Special keys
    28: 'Enter', 1: 'Escape', 14: 'Backspace', 15: 'Tab', 57: ' ', 58: 'CapsLock',
    
    // Function keys
    59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
    65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
    
    // Arrow keys
    57419: 'ArrowLeft', 57421: 'ArrowRight', 57416: 'ArrowUp', 57424: 'ArrowDown',
    
    // Modifiers (left and right variants)
    29: 'Control', 42: 'Shift', 54: 'Shift', 56: 'Alt', 
    3675: 'Meta', 3676: 'Meta',
    
    // Numpad
    82: '0', 79: '1', 80: '2', 81: '3', 75: '4', 76: '5',
    77: '6', 71: '7', 72: '8', 73: '9',
    
    // Navigation
    57415: 'Home', 57423: 'End', 57417: 'PageUp', 57425: 'PageDown',
    57427: 'Delete', 57426: 'Insert',
  }
  
  return keyMap[keycode] || `Unknown_${keycode}`
}

export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
  stopClickDetection()
  stopKeyboardTracking()

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
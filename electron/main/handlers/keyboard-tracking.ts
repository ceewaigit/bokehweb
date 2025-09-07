import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron'
// Simple logger for production
const logger = {
  debug: (msg: string, ...args: any[]) => process.env.NODE_ENV === 'development' && console.log(msg, ...args),
  info: (msg: string, ...args: any[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(msg, ...args)
}

// Lazy load uiohook-napi to handle initialization errors
let uIOhook: any = null

try {
  const uiohookModule = require('uiohook-napi')
  uIOhook = uiohookModule.uIOhook
  logger.info('uiohook-napi loaded successfully for keyboard tracking')
} catch (error) {
  logger.error('Failed to load uiohook-napi for keyboard tracking:', error)
}


// Keyboard tracking state
let isKeyboardTracking = false
let keyboardEventSender: WebContents | null = null
let uiohookStarted = false

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

export function startKeyboardTracking(sender: WebContents): void {
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

export function stopKeyboardTracking(): void {
  isKeyboardTracking = false
  keyboardEventSender = null
  
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
}

export function registerKeyboardTrackingHandlers(): void {
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
}

export function cleanupKeyboardTracking(): void {
  stopKeyboardTracking()
  
  // Stop uiohook if it was started for keyboard only
  if (uiohookStarted && uIOhook) {
    try {
      // Check if other handlers are still using uiohook
      const hasOtherHandlers = !!(
        (global as any).uiohookMouseDownHandler ||
        (global as any).uiohookMouseUpHandler ||
        (global as any).uiohookWheelHandler
      )
      
      if (!hasOtherHandlers) {
        uIOhook.stop()
        uiohookStarted = false
        logger.info('uiohook stopped as no other handlers are using it')
      }
    } catch (error) {
      logger.error('Error stopping uiohook in cleanup:', error)
    }
  }
}
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

/**
 * Comprehensive uiohook-napi keycode → Web KeyboardEvent.code mapping
 * Based on libuiohook virtual key codes (VC_*) from uiohook.h
 * Maps to standard Web KeyboardEvent.code values for consistency
 */
const UIOHOOK_KEYCODE_MAP: Record<number, string> = {
  // Special keys
  1: 'Escape',           // VC_ESCAPE
  14: 'Backspace',       // VC_BACKSPACE
  15: 'Tab',             // VC_TAB
  28: 'Enter',           // VC_ENTER
  57: 'Space',           // VC_SPACE

  // Function keys (F1-F12)
  59: 'F1',              // VC_F1
  60: 'F2',              // VC_F2
  61: 'F3',              // VC_F3
  62: 'F4',              // VC_F4
  63: 'F5',              // VC_F5
  64: 'F6',              // VC_F6
  65: 'F7',              // VC_F7
  66: 'F8',              // VC_F8
  67: 'F9',              // VC_F9
  68: 'F10',             // VC_F10
  87: 'F11',             // VC_F11
  88: 'F12',             // VC_F12

  // Number row (digits)
  11: 'Digit0',          // VC_0
  2: 'Digit1',           // VC_1
  3: 'Digit2',           // VC_2
  4: 'Digit3',           // VC_3
  5: 'Digit4',           // VC_4
  6: 'Digit5',           // VC_5
  7: 'Digit6',           // VC_6
  8: 'Digit7',           // VC_7
  9: 'Digit8',           // VC_8
  10: 'Digit9',          // VC_9

  // Letters (QWERTY layout)
  30: 'KeyA',            // VC_A
  48: 'KeyB',            // VC_B
  46: 'KeyC',            // VC_C
  32: 'KeyD',            // VC_D
  18: 'KeyE',            // VC_E
  33: 'KeyF',            // VC_F
  34: 'KeyG',            // VC_G
  35: 'KeyH',            // VC_H
  23: 'KeyI',            // VC_I
  36: 'KeyJ',            // VC_J
  37: 'KeyK',            // VC_K
  38: 'KeyL',            // VC_L
  50: 'KeyM',            // VC_M
  49: 'KeyN',            // VC_N
  24: 'KeyO',            // VC_O
  25: 'KeyP',            // VC_P
  16: 'KeyQ',            // VC_Q
  19: 'KeyR',            // VC_R
  31: 'KeyS',            // VC_S
  20: 'KeyT',            // VC_T
  22: 'KeyU',            // VC_U
  47: 'KeyV',            // VC_V
  17: 'KeyW',            // VC_W
  45: 'KeyX',            // VC_X
  21: 'KeyY',            // VC_Y
  44: 'KeyZ',            // VC_Z

  // Symbol/punctuation keys
  12: 'Minus',           // VC_MINUS
  13: 'Equal',           // VC_EQUALS
  26: 'BracketLeft',     // VC_OPEN_BRACKET
  27: 'BracketRight',    // VC_CLOSE_BRACKET
  43: 'Backslash',       // VC_BACK_SLASH
  39: 'Semicolon',       // VC_SEMICOLON
  40: 'Quote',           // VC_QUOTE
  41: 'Backquote',       // VC_BACKQUOTE
  51: 'Comma',           // VC_COMMA
  52: 'Period',          // VC_PERIOD
  53: 'Slash',           // VC_SLASH

  // Modifier keys
  42: 'ShiftLeft',       // VC_SHIFT_L
  54: 'ShiftRight',      // VC_SHIFT_R
  29: 'ControlLeft',     // VC_CONTROL_L
  3613: 'ControlRight',  // VC_CONTROL_R
  56: 'AltLeft',         // VC_ALT_L
  3640: 'AltRight',      // VC_ALT_R
  3675: 'MetaLeft',      // VC_META_L (Cmd on Mac)
  3676: 'MetaRight',     // VC_META_R (Cmd on Mac)
  58: 'CapsLock',        // VC_CAPS_LOCK

  // Navigation keys
  57419: 'ArrowLeft',    // VC_LEFT
  57416: 'ArrowUp',      // VC_UP
  57421: 'ArrowRight',   // VC_RIGHT
  57424: 'ArrowDown',    // VC_DOWN
  57415: 'Home',         // VC_HOME
  57423: 'End',          // VC_END
  57417: 'PageUp',       // VC_PAGE_UP
  57425: 'PageDown',     // VC_PAGE_DOWN
  57426: 'Insert',       // VC_INSERT
  57427: 'Delete',       // VC_DELETE

  // Numpad keys
  82: 'Numpad0',         // VC_KP_0
  79: 'Numpad1',         // VC_KP_1
  80: 'Numpad2',         // VC_KP_2
  81: 'Numpad3',         // VC_KP_3
  75: 'Numpad4',         // VC_KP_4
  76: 'Numpad5',         // VC_KP_5
  77: 'Numpad6',         // VC_KP_6
  71: 'Numpad7',         // VC_KP_7
  72: 'Numpad8',         // VC_KP_8
  73: 'Numpad9',         // VC_KP_9
  55: 'NumpadMultiply',  // VC_KP_MULTIPLY
  78: 'NumpadAdd',       // VC_KP_ADD
  74: 'NumpadSubtract',  // VC_KP_SUBTRACT
  83: 'NumpadDecimal',   // VC_KP_SEPARATOR
  3637: 'NumpadDivide',  // VC_KP_DIVIDE
  3612: 'NumpadEnter',   // VC_KP_ENTER
  69: 'NumLock',         // VC_NUM_LOCK

  // Other keys
  3639: 'PrintScreen',   // VC_PRINTSCREEN
  70: 'ScrollLock',      // VC_SCROLL_LOCK
  3653: 'Pause',         // VC_PAUSE
}

function getKeyFromCode(code: number): string {
  return UIOHOOK_KEYCODE_MAP[code] || `Unknown(${code})`
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
      ; (global as any).uiohookKeyDownHandler = handleKeyDown
      ; (global as any).uiohookKeyUpHandler = handleKeyUp

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
          ; (global as any).uiohookKeyDownHandler = null
      }
      if ((global as any).uiohookKeyUpHandler) {
        uIOhook.off('keyup', (global as any).uiohookKeyUpHandler)
          ; (global as any).uiohookKeyUpHandler = null
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
import { ipcMain, screen, IpcMainInvokeEvent, WebContents, BrowserWindow } from 'electron'
import { uIOhook, UiohookKey, UiohookMouseEvent } from 'uiohook-napi'

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
let lastMousePosition: { x: number; y: number; time: number } | null = null
let mouseHistory: Array<{ x: number; y: number; time: number }> = []
let uiohookStarted = false
let currentCursorType = 'default'  // Track current cursor type
let targetWindow: BrowserWindow | null = null  // Track the window for cursor-changed events

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

      // Get the BrowserWindow from the sender
      targetWindow = BrowserWindow.fromWebContents(event.sender)

      // Set up cursor-changed event listener for cursor type detection
      // Note: This only works when cursor is over the app window
      // We'll also track all cursor types for better debugging
      if (targetWindow) {
        // Reset to default when window loses focus
        const handleBlur = () => {
          currentCursorType = 'default'
          logger.debug('Window blurred, resetting cursor to default')
        }
        
        const handleCursorChange = (_event: any, type: string) => {
          // Only update cursor type if window is focused
          // This prevents stale cursor types when recording other windows
          if (targetWindow && targetWindow.isFocused()) {
            const previousType = currentCursorType
            currentCursorType = type
            
            // Map Electron cursor types to more descriptive names for logging
            const cursorTypeMap: Record<string, string> = {
            'default': 'arrow',
            'pointer': 'hand',
            'text': 'iBeam',
            'ns-resize': 'resizeUpDown',
            'ew-resize': 'resizeLeftRight',
            'nesw-resize': 'resizeDiagonal',
            'nwse-resize': 'resizeDiagonal',
            'n-resize': 'resizeUp',
            's-resize': 'resizeDown',
            'e-resize': 'resizeRight',
            'w-resize': 'resizeLeft',
            'ne-resize': 'resizeUpRight',
            'nw-resize': 'resizeUpLeft',
            'se-resize': 'resizeDownRight',
            'sw-resize': 'resizeDownLeft',
            'move': 'openHand',
            'grabbing': 'closedHand',
            'grab': 'openHand',
            'crosshair': 'crosshair',
            'not-allowed': 'notAllowed',
            'context-menu': 'contextMenu',
            'copy': 'dragCopy',
            'alias': 'dragLink',
            'col-resize': 'resizeColumn',
            'row-resize': 'resizeRow',
            'all-scroll': 'move',
            'zoom-in': 'zoomIn',
            'zoom-out': 'zoomOut'
          }
          
            const mappedType = cursorTypeMap[type] || type
            const previousMapped = cursorTypeMap[previousType] || previousType
            
            // Always log cursor changes to debug the issue
            console.log(`Cursor: ${previousMapped} → ${mappedType} (raw: ${previousType} → ${type})`)
          }
        }

        // Remove any existing listeners first
        targetWindow.webContents.removeListener('cursor-changed', handleCursorChange)
        targetWindow.removeListener('blur', handleBlur)
        
        // Add the new listeners
        targetWindow.webContents.on('cursor-changed', handleCursorChange)
        targetWindow.on('blur', handleBlur)
      }

      // Start click detection using global mouse hooks with source info
      startClickDetection(sourceType, sourceId)

      let lastPosition: Electron.Point | null = null
      let lastVelocity = { x: 0, y: 0 }
      let lastTime = Date.now()

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


            lastMousePosition = positionData
            lastVelocity = velocity
            lastTime = now

            // Use the detected cursor type when available
            // This won't be perfect for screen recording but it's better than nothing
            let effectiveCursorType = currentCursorType || 'default'
            
            // Debug log every 50th event to see what cursor type we're sending
            if (mouseHistory.length % 50 === 0) {
              logger.debug(`Sending cursor type: ${effectiveCursorType}`)
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
              cursorType: effectiveCursorType,  // Use detected cursor type
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

      // Remove cursor-changed and blur listeners
      if (targetWindow) {
        targetWindow.webContents.removeAllListeners('cursor-changed')
        targetWindow.removeAllListeners('blur')
        targetWindow = null
      }

      // Stop click detection
      stopClickDetection()

      // Reset mouse history
      mouseHistory = []
      lastMousePosition = null
      currentCursorType = 'default'

      mouseEventSender = null

      return { success: true }
    } catch (error: any) {
      logger.error('Error stopping mouse tracking:', error)
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

  clickDetectionActive = true

  try {
    // Start uiohook if not already started
    if (!uiohookStarted) {
      uIOhook.start()
      uiohookStarted = true
    }

    // Register global mouse click handler
    const handleMouseDown = (event: UiohookMouseEvent) => {
      if (!isMouseTracking || !mouseEventSender) return

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

      // Use the detected cursor type
      const effectiveCursorType = currentCursorType || 'default'

      // Send click event with proper coordinates
      mouseEventSender.send('mouse-click', {
        x: event.x,
        y: event.y,
        timestamp: Date.now(),
        button: event.button === 1 ? 'left' : event.button === 2 ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: effectiveCursorType,  // Use detected cursor type
        sourceType: sourceType || 'screen',
        sourceId: sourceId
      })
    }

    // Register the mouse down event listener
    // @ts-ignore - uiohook-napi type definitions may be incomplete
    uIOhook.on('mousedown', handleMouseDown)

      // Store the handler for cleanup
      (global as any).uiohookMouseHandler = handleMouseDown

  } catch (error) {
    logger.error('Failed to start global click detection:', error)
    clickDetectionActive = false
  }
}

function stopClickDetection(): void {
  clickDetectionActive = false

  try {
    // Remove the mouse handler if it exists
    if ((global as any).uiohookMouseHandler) {
      // @ts-ignore - uiohook-napi type definitions may be incomplete
      uIOhook.off('mousedown', (global as any).uiohookMouseHandler)
      delete (global as any).uiohookMouseHandler
    }

    // Stop uiohook if no longer needed
    if (uiohookStarted) {
      uIOhook.stop()
      uiohookStarted = false
    }
  } catch (error) {
    logger.error('Error stopping click detection:', error)
  }
}

export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
  stopClickDetection()

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
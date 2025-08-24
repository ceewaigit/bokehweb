import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'

// Lazy load uiohook-napi to handle initialization errors
let uIOhook: any = null
let UiohookMouseEvent: any = null

try {
  const uiohookModule = require('uiohook-napi')
  uIOhook = uiohookModule.uIOhook
  UiohookMouseEvent = uiohookModule.UiohookMouseEvent
  console.log('uiohook-napi loaded successfully')
} catch (error) {
  console.error('Failed to load uiohook-napi:', error)
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
let lastMousePosition: { x: number; y: number; time: number } | null = null
let mouseHistory: Array<{ x: number; y: number; time: number }> = []
let uiohookStarted = false
let isMouseDown = false  // Track mouse button state for cursor detection
let mouseDownTime = 0  // Track when mouse was pressed
let lastClickPosition = { x: 0, y: 0 }  // Track last click position

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

            // Determine cursor type based on mouse state
            let effectiveCursorType = 'default'
            
            if (isMouseDown) {
              // Mouse is being held down
              const timeSinceMouseDown = now - mouseDownTime
              const distanceFromClick = Math.sqrt(
                Math.pow(currentPosition.x - lastClickPosition.x, 2) +
                Math.pow(currentPosition.y - lastClickPosition.y, 2)
              )
              
              // If mouse moved significantly while held down, it's a drag operation
              if (distanceFromClick > 5 || timeSinceMouseDown > 200) {
                effectiveCursorType = 'grabbing'  // Dragging state
              } else {
                effectiveCursorType = 'grab'  // About to drag
              }
            }

            // Debug log every 50th event to see what cursor type we're sending
            if (mouseHistory.length % 50 === 0) {
              logger.debug(`Cursor state: ${effectiveCursorType} (mouseDown: ${isMouseDown})`)
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

      // Stop click detection
      stopClickDetection()

      // Reset mouse history and state
      mouseHistory = []
      lastMousePosition = null
      isMouseDown = false
      mouseDownTime = 0
      lastClickPosition = { x: 0, y: 0 }

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
      mouseDownTime = Date.now()
      lastClickPosition = { x: event.x, y: event.y }

      // Get current display info for coordinate transformation
      const currentDisplay = screen.getDisplayNearestPoint({ x: event.x, y: event.y })
      const scaleFactor = currentDisplay.scaleFactor || 1

      // Send click event with proper coordinates
      mouseEventSender.send('mouse-click', {
        x: event.x,
        y: event.y,
        timestamp: Date.now(),
        button: event.button === 1 ? 'left' : event.button === 2 ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: 'grab',  // Click starts with grab cursor
        sourceType: sourceType || 'screen',
        sourceId: sourceId
      })

      logger.debug(`Mouse down at (${event.x}, ${event.y})`)
    }

    const handleMouseUp = (event: any) => {
      if (!isMouseTracking) return

      // Track mouse up state for cursor detection
      isMouseDown = false
      mouseDownTime = 0

      logger.debug(`Mouse up at (${event.x}, ${event.y})`)
    }

    // Register the mouse event listeners
    uIOhook.on('mousedown', handleMouseDown)
    uIOhook.on('mouseup', handleMouseUp)
    
    // Store the handlers for cleanup
    ;(global as any).uiohookMouseDownHandler = handleMouseDown
    ;(global as any).uiohookMouseUpHandler = handleMouseUp
    
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
  mouseDownTime = 0

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
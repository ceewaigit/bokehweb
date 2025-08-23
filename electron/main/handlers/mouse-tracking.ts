import { ipcMain, screen, IpcMainInvokeEvent, WebContents, BrowserWindow } from 'electron'
import { uIOhook, UiohookKey, UiohookMouseEvent } from 'uiohook-napi'

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

// Store window bounds for cursor type detection
let windowBounds: { x: number; y: number; width: number; height: number } | null = null

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

      // Get window bounds if this is a window recording
      windowBounds = null
      if (sourceType === 'window' && sourceId && !sourceId.startsWith('screen:')) {
        try {
          const { desktopCapturer } = await import('electron')
          const sources = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 1, height: 1 },
            fetchWindowIcons: false
          })
          
          const source = sources.find(s => s.id === sourceId)
          if (source) {
            const { getWindowBoundsForSource } = await import('../native/window-bounds')
            windowBounds = await getWindowBoundsForSource(source.name)
            console.log('🪟 Window bounds for cursor detection:', windowBounds)
          }
        } catch (error) {
          console.warn('Failed to get window bounds for cursor detection:', error)
        }
      }

      // Set up cursor-changed event listener for cursor type detection
      // Note: This only works when cursor is over the app window
      // For partial screen recordings, we'll default to arrow cursor
      if (targetWindow) {
        const handleCursorChange = (_event: any, type: string) => {
          console.log('🔄 Cursor changed to:', type)
          currentCursorType = type
        }

        // Remove any existing listener first
        targetWindow.webContents.removeListener('cursor-changed', handleCursorChange)
        // Add the new listener
        targetWindow.webContents.on('cursor-changed', handleCursorChange)
        console.log('👁️ Cursor change listener attached to window')
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

            // NOTE: Removed velocity-based click detection as it causes false positives
            // Real click events should come from actual mouse button events
            // This is a limitation of Electron's API - proper click detection requires
            // native modules or system-level hooks

            lastMousePosition = positionData
            lastVelocity = velocity
            lastTime = now

            // Determine cursor type based on window bounds if available
            let effectiveCursorType = currentCursorType;
            
            // For window recording, detect if cursor is inside/outside window
            if (sourceType === 'window' && windowBounds) {
              const isInsideWindow = 
                currentPosition.x >= windowBounds.x &&
                currentPosition.x <= windowBounds.x + windowBounds.width &&
                currentPosition.y >= windowBounds.y &&
                currentPosition.y <= windowBounds.y + windowBounds.height;
              
              // When cursor is outside the window, it's typically an arrow
              // When inside, we don't know the exact type, so use 'default' which maps to arrow
              // This is a limitation without deeper OS integration
              effectiveCursorType = isInsideWindow ? 'default' : 'arrow';
              
              // If we have cursor-changed events and cursor is over our app, use that
              if (isInsideWindow && currentCursorType !== 'default') {
                effectiveCursorType = currentCursorType;
              }
            }
            
            // Debug logging - log every 50th event
            if (mouseHistory.length % 50 === 0) {
              console.log('🖱️ Mouse tracking state:', {
                sourceId,
                sourceType,
                currentCursorType,
                effectiveCursorType,
                windowBounds: windowBounds ? { x: windowBounds.x, y: windowBounds.y, w: windowBounds.width, h: windowBounds.height } : null,
                mousePos: { x: currentPosition.x, y: currentPosition.y }
              });
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
              cursorType: effectiveCursorType,  // Use effective cursor type
              sourceType: sourceType,  // Include source type for proper coordinate mapping
              sourceId: sourceId
            } as MousePosition)

            lastPosition = currentPosition
          }
        } catch (error) {
          console.error('❌ Error tracking mouse:', error)
        }
      }, intervalMs)


      return {
        success: true,
        nativeTracking: true,
        fps: Math.round(1000 / intervalMs)
      }
    } catch (error: any) {
      console.error('Error starting mouse tracking:', error)
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

      // Remove cursor-changed listener
      if (targetWindow) {
        targetWindow.webContents.removeAllListeners('cursor-changed')
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
      console.error('Error stopping mouse tracking:', error)
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
      console.error('Error getting mouse position:', error)
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

      // Use the current cursor type as detected
      const effectiveCursorType = currentCursorType;

      // Send click event with proper coordinates
      mouseEventSender.send('mouse-click', {
        x: event.x,
        y: event.y,
        timestamp: Date.now(),
        button: event.button === 1 ? 'left' : event.button === 2 ? 'right' : 'middle',
        displayBounds: currentDisplay.bounds,
        scaleFactor: scaleFactor,
        cursorType: effectiveCursorType,  // Use effective cursor type
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
    console.error('❌ Failed to start global click detection:', error)
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
    console.error('❌ Error stopping click detection:', error)
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
      console.error('Error in cleanup:', error)
    }
  }
}
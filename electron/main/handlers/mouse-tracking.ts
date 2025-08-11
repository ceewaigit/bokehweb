import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'
import { uIOhook } from 'uiohook-napi'

let mouseTrackingInterval: NodeJS.Timeout | null = null
let mouseEventSender: WebContents | null = null
let isMouseTracking = false
let clickDetectionActive = false
let clickDetectionInterval: NodeJS.Timeout | null = null
let lastMousePosition: { x: number; y: number; time: number } | null = null
let mouseHistory: Array<{ x: number; y: number; time: number }> = []
let uiohookStarted = false

interface MouseTrackingOptions {
  intervalMs?: number
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

      mouseEventSender = event.sender
      isMouseTracking = true

      // Start click detection using global mouse hooks
      startClickDetection()

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

            // Track mouse position for click detection
            const positionData = {
              x: Math.round(currentPosition.x * 100) / 100, // Sub-pixel precision
              y: Math.round(currentPosition.y * 100) / 100,
              time: now
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

            // Send enhanced mouse data with velocity for smooth interpolation
            mouseEventSender.send('mouse-move', {
              x: positionData.x,
              y: positionData.y,
              timestamp: now,
              velocity,
              acceleration
            } as MousePosition)

            lastPosition = currentPosition
          }
        } catch (error) {
          console.error('❌ Error tracking mouse:', error)
        }
      }, intervalMs)

      console.log(`🖱️ Mouse tracking started (interval: ${intervalMs}ms)`)

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

      // Stop click detection
      stopClickDetection()

      // Reset mouse history
      mouseHistory = []
      lastMousePosition = null

      mouseEventSender = null

      console.log('🖱️ Mouse tracking stopped')
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

function startClickDetection(): void {
  if (clickDetectionActive) return

  clickDetectionActive = true

  // Start uIOhook if not already started
  if (!uiohookStarted) {
    uIOhook.start()
    uiohookStarted = true
    console.log('🖱️ uIOhook started for native click detection')
  }

  // Register mouse click event handler
  const handleMouseClick = (e: any) => {
    if (!isMouseTracking || !mouseEventSender) return

    // Mouse button codes: 1 = left, 2 = right, 3 = middle
    if (e.button === 1 || e.button === 2 || e.button === 3) {
      const position = screen.getCursorScreenPoint()
      mouseEventSender.send('mouse-click', {
        x: Math.round(position.x),
        y: Math.round(position.y),
        timestamp: Date.now(),
        button: e.button === 1 ? 'left' : e.button === 2 ? 'right' : 'middle'
      })
      console.log(`🖱️ Click detected: button=${e.button} at (${position.x}, ${position.y})`)
    }
  }

  // Listen for mouse down events (click)
  uIOhook.on('mousedown', handleMouseClick);

  // Also detect mouse up for complete click tracking
  uIOhook.on('mouseup', (e: any) => {
    // Can be used for click duration tracking if needed
  });

  // Store the handler for cleanup
  (global as any).mouseClickHandler = handleMouseClick

  console.log('🖱️ Click detection started')
}

function stopClickDetection(): void {
  clickDetectionActive = false

  // Stop uIOhook and remove listeners
  if (uiohookStarted) {
    // Remove event listeners
    if ((global as any).mouseClickHandler) {
      uIOhook.off('mousedown', (global as any).mouseClickHandler)
      delete (global as any).mouseClickHandler
    }
    uIOhook.removeAllListeners('mouseup')

    // Stop uIOhook
    uIOhook.stop()
    uiohookStarted = false
    console.log('🖱️ uIOhook stopped')
  }

  console.log('🖱️ Click detection stopped')
}

export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
  stopClickDetection()
}
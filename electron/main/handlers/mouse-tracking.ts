import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'

let mouseTrackingInterval: NodeJS.Timeout | null = null
let mouseEventSender: WebContents | null = null
let isMouseTracking = false
let clickDetectionActive = false
let clickDetectionInterval: NodeJS.Timeout | null = null
let lastMousePosition: { x: number; y: number; time: number } | null = null
let mouseHistory: Array<{ x: number; y: number; time: number }> = []

interface MouseTrackingOptions {
  intervalMs?: number
}

interface MousePosition {
  x: number
  y: number
  timestamp?: number
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

      const intervalMs = Math.max(8, Math.min(1000, parseInt(String(options.intervalMs)) || 16))

      mouseEventSender = event.sender
      isMouseTracking = true

      // Start click detection using global mouse hooks
      startClickDetection()

      let lastPosition: Electron.Point | null = null
      mouseTrackingInterval = setInterval(() => {
        if (!isMouseTracking || !mouseEventSender) return

        try {
          const currentPosition = screen.getCursorScreenPoint()
          const now = Date.now()

          if (!lastPosition ||
            lastPosition.x !== currentPosition.x ||
            lastPosition.y !== currentPosition.y) {

            // Track mouse position for click detection
            const positionData = {
              x: Math.round(currentPosition.x),
              y: Math.round(currentPosition.y),
              time: now
            }
            
            // Update mouse history for velocity analysis
            mouseHistory.push(positionData)
            if (mouseHistory.length > 10) {
              mouseHistory.shift()
            }
            
            // Detect potential clicks based on mouse stopping after movement
            if (lastMousePosition && mouseHistory.length >= 3) {
              const recentPositions = mouseHistory.slice(-3)
              const wasMoving = Math.abs(recentPositions[0].x - recentPositions[1].x) > 2 ||
                               Math.abs(recentPositions[0].y - recentPositions[1].y) > 2
              const hasStopped = Math.abs(recentPositions[1].x - recentPositions[2].x) <= 1 &&
                                Math.abs(recentPositions[1].y - recentPositions[2].y) <= 1
              
              if (wasMoving && hasStopped) {
                // Likely a click occurred - emit click event
                mouseEventSender.send('mouse-click', {
                  x: positionData.x,
                  y: positionData.y,
                  timestamp: now
                })
                console.log('🖱️ Click detected at', positionData.x, positionData.y)
              }
            }
            
            lastMousePosition = positionData

            mouseEventSender.send('mouse-move', {
              x: positionData.x,
              y: positionData.y,
              timestamp: now
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
  
  // Use a polling approach to detect mouse button state changes
  // This is a workaround since Electron doesn't have native click detection
  let lastButtonState = false
  const clickCheckInterval = setInterval(() => {
    if (!isMouseTracking || !mouseEventSender) {
      clearInterval(clickCheckInterval)
      return
    }
    
    try {
      // Check if we can detect button state (this is limited in Electron)
      // For now, we'll emit synthetic click events based on user interaction
      // This will be improved with native module in future
    } catch (error) {
      console.error('Error in click detection:', error)
    }
  }, 50)
  
  // Register global shortcut for mouse clicks (workaround)
  // Note: This is limited and won't capture all clicks
  try {
    // Emit click events when certain conditions are met
    // This is a placeholder for proper click detection
    process.on('message', (msg: any) => {
      if (msg.type === 'click' && mouseEventSender) {
        const position = screen.getCursorScreenPoint()
        mouseEventSender.send('mouse-click', {
          x: Math.round(position.x),
          y: Math.round(position.y),
          timestamp: Date.now()
        })
      }
    })
  } catch (error) {
    console.error('Error setting up click detection:', error)
  }
  
  console.log('🖱️ Click detection started')
}

function stopClickDetection(): void {
  clickDetectionActive = false
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
import { ipcMain, screen, IpcMainInvokeEvent, WebContents } from 'electron'

let mouseTrackingInterval: NodeJS.Timeout | null = null
let mouseEventSender: WebContents | null = null
let isMouseTracking = false

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

      let lastPosition: Electron.Point | null = null
      mouseTrackingInterval = setInterval(() => {
        if (!isMouseTracking || !mouseEventSender) return

        try {
          const currentPosition = screen.getCursorScreenPoint()

          if (!lastPosition ||
            lastPosition.x !== currentPosition.x ||
            lastPosition.y !== currentPosition.y) {

            mouseEventSender.send('mouse-move', {
              x: Math.round(currentPosition.x),
              y: Math.round(currentPosition.y),
              timestamp: Date.now()
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

export function cleanupMouseTracking(): void {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
  }
}
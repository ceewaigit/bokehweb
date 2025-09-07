import { ipcMain, BrowserWindow, IpcMainInvokeEvent, IpcMainEvent, app } from 'electron'
import { createMainWindow } from '../windows/main-window'
import { getAppURL } from '../config'
import { createCountdownWindow, showCountdown } from '../windows/countdown-window'
import { showMonitorOverlay, hideMonitorOverlay } from '../windows/monitor-overlay'

let countdownWindow: BrowserWindow | null = null

export function registerWindowControlHandlers(): void {
  // Handle opening workspace - using ipcMain.on for send/receive pattern
  ipcMain.on('open-workspace', () => {
    try {
      console.log('[WindowControls] Opening workspace...')
      
      if (!global.mainWindow) {
        console.log('[WindowControls] Creating new main window')
        global.mainWindow = createMainWindow()
        
        const url = getAppURL()
        console.log('[WindowControls] Loading URL:', url)
        global.mainWindow.loadURL(url)
        
        global.mainWindow.once('ready-to-show', () => {
          console.log('[WindowControls] Main window ready to show')
          if (global.mainWindow) {
            global.mainWindow.show()
            global.mainWindow.focus()
            // Hide record button when main window is shown
            if (global.recordButton) {
              global.recordButton.hide()
            }
          }
        })
        
        global.mainWindow.on('closed', () => {
          console.log('[WindowControls] Main window closed')
          global.mainWindow = null
          // Show record button when main window is closed
          if (global.recordButton && !global.recordButton.isDestroyed()) {
            global.recordButton.show()
          }
        })
      } else {
        console.log('[WindowControls] Showing existing main window')
        global.mainWindow.show()
        global.mainWindow.focus()
        // Hide record button when main window is shown
        if (global.recordButton) {
          global.recordButton.hide()
        }
      }
    } catch (error) {
      console.error('[WindowControls] Failed to open workspace:', error)
    }
  })

  ipcMain.handle('minimize-record-button', () => {
    // Hide record button and show main window
    if (global.recordButton) {
      global.recordButton.hide()
    }
    if (global.mainWindow) {
      global.mainWindow.show()
      global.mainWindow.focus()
    }
  })

  ipcMain.handle('show-record-button', () => {
    // Show record button and hide main window
    if (global.recordButton) {
      global.recordButton.show()
    }
    if (global.mainWindow) {
      global.mainWindow.hide()
    }
  })

  // Dynamic content-based sizing
  ipcMain.handle('set-window-content-size', (event: IpcMainInvokeEvent, dimensions: { width: number; height: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && dimensions.width > 0 && dimensions.height > 0) {
      const { screen } = require('electron')
      const display = screen.getPrimaryDisplay()
      
      // Set size constraints
      window.setMinimumSize(dimensions.width, dimensions.height)
      window.setMaximumSize(dimensions.width, dimensions.height)
      
      // Set bounds with centered X position
      const newX = Math.floor(display.workAreaSize.width / 2 - dimensions.width / 2)
      const currentY = window.getPosition()[1]
      
      window.setBounds({
        x: newX,
        y: currentY,
        width: Math.round(dimensions.width),
        height: Math.round(dimensions.height)
      }, true)
      
      window.setResizable(false)
      return { success: true }
    }
    return { success: false }
  })

  ipcMain.handle('show-countdown', async (event: IpcMainInvokeEvent, number: number, displayId?: number) => {
    // Hide any overlay when countdown starts
    hideMonitorOverlay()
    
    if (countdownWindow) {
      countdownWindow.close()
      countdownWindow = null
    }
    countdownWindow = createCountdownWindow(displayId)
    showCountdown(countdownWindow, number)
    return { success: true }
  })

  ipcMain.handle('hide-countdown', async () => {
    if (countdownWindow) {
      countdownWindow.hide()
      countdownWindow.close()
      countdownWindow = null
    }
    return { success: true }
  })

  // Monitor overlay handlers
  ipcMain.handle('show-monitor-overlay', async (event: IpcMainInvokeEvent, displayId?: number) => {
    try {
      showMonitorOverlay(displayId)
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to show monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('hide-monitor-overlay', async () => {
    try {
      hideMonitorOverlay()
      return { success: true }
    } catch (error) {
      console.error('[WindowControls] Failed to hide monitor overlay:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
import { ipcMain, BrowserWindow, IpcMainInvokeEvent, IpcMainEvent, app } from 'electron'
import { createMainWindow } from '../windows/main-window'
import { getAppURL } from '../config'
import { createCountdownWindow, showCountdown } from '../windows/countdown-window'

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
          }
        })
        
        global.mainWindow.on('closed', () => {
          console.log('[WindowControls] Main window closed')
          global.mainWindow = null
        })
      } else {
        console.log('[WindowControls] Showing existing main window')
        global.mainWindow.show()
        global.mainWindow.focus()
      }
    } catch (error) {
      console.error('[WindowControls] Failed to open workspace:', error)
    }
  })

  ipcMain.handle('minimize-record-button', () => {
    if (global.recordButton) {
      global.recordButton.hide()
    }
  })

  ipcMain.handle('show-record-button', () => {
    if (global.recordButton) {
      global.recordButton.show()
    }
  })

  // Dynamic content-based sizing
  ipcMain.handle('set-window-content-size', (event: IpcMainInvokeEvent, dimensions: { width: number; height: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && dimensions.width > 0 && dimensions.height > 0) {
      const { screen } = require('electron')
      const display = screen.getPrimaryDisplay()
      
      window.setContentSize(Math.round(dimensions.width), Math.round(dimensions.height))
      
      // Center the window horizontally after resizing
      const newX = Math.floor(display.workAreaSize.width / 2 - dimensions.width / 2)
      const currentY = window.getPosition()[1]
      window.setPosition(newX, currentY)
      
      return { success: true }
    }
    return { success: false }
  })

  ipcMain.handle('show-countdown', async (event: IpcMainInvokeEvent, number: number) => {
    if (countdownWindow) {
      countdownWindow.close()
      countdownWindow = null
    }
    countdownWindow = createCountdownWindow()
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

  ipcMain.on('app-quit', () => {
    app.quit()
  })

  ipcMain.on('app-minimize', (event: IpcMainEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.minimize()
    }
  })

  ipcMain.on('app-maximize', (event: IpcMainEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })
}
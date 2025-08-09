import { ipcMain, BrowserWindow, IpcMainInvokeEvent, IpcMainEvent, app } from 'electron'
import { createMainWindow } from '../windows/main-window'
import { getAppURL } from '../config'
import { createCountdownWindow, showCountdown } from '../windows/countdown-window'

let countdownWindow: BrowserWindow | null = null

export function registerWindowControlHandlers(): void {
  ipcMain.handle('open-workspace', () => {
    if (!global.mainWindow) {
      global.mainWindow = createMainWindow()
      global.mainWindow.loadURL(getAppURL())
      global.mainWindow.once('ready-to-show', () => {
        global.mainWindow!.show()
        global.mainWindow!.focus()
      })
    } else {
      global.mainWindow.show()
      global.mainWindow.focus()
    }
  })

  ipcMain.on('open-workspace', () => {
    if (!global.mainWindow) {
      global.mainWindow = createMainWindow()
      global.mainWindow.loadURL(getAppURL())
      global.mainWindow.once('ready-to-show', () => {
        global.mainWindow!.show()
        global.mainWindow!.focus()
      })
    } else {
      global.mainWindow.show()
      global.mainWindow.focus()
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

  ipcMain.handle('resize-record-button', (_event: IpcMainInvokeEvent, dimensions: { width?: number; height?: number } | number) => {
    if (global.recordButton) {
      const [currentWidth, currentHeight] = global.recordButton.getSize()
      
      // Support both old API (just height) and new API (width & height)
      if (typeof dimensions === 'number') {
        // Legacy: just height
        if (dimensions > 0) {
          global.recordButton.setSize(currentWidth, Math.round(dimensions))
          return { success: true }
        }
      } else if (dimensions && typeof dimensions === 'object') {
        // New: width and/or height
        const newWidth = dimensions.width || currentWidth
        const newHeight = dimensions.height || currentHeight
        
        if (newWidth > 0 && newHeight > 0) {
          global.recordButton.setSize(Math.round(newWidth), Math.round(newHeight))
          return { success: true }
        }
      }
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
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
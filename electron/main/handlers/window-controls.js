const { ipcMain, BrowserWindow } = require('electron')
const { createMainWindow } = require('../windows/main-window')
const { getAppURL } = require('../config')
const { createCountdownWindow, showCountdown } = require('../windows/countdown-window')

let countdownWindow = null

function registerWindowControlHandlers() {
  ipcMain.handle('open-workspace', () => {
    if (!global.mainWindow) {
      global.mainWindow = createMainWindow()
      global.mainWindow.loadURL(getAppURL())
      global.mainWindow.once('ready-to-show', () => {
        global.mainWindow.show()
        global.mainWindow.focus()
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

  ipcMain.handle('show-countdown', async (event, number) => {
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
    require('electron').app.quit()
  })

  ipcMain.on('app-minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window.minimize()
  })

  ipcMain.on('app-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
}

module.exports = { registerWindowControlHandlers }
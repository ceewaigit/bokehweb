const { ipcMain, dialog, BrowserWindow } = require('electron')

function registerDialogHandlers() {
  ipcMain.handle('show-message-box', async (event, options) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showMessageBox(window, options)
      return result
    } catch (error) {
      console.error('Error showing message box:', error)
      return { response: 0, checkboxChecked: false }
    }
  })

  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      const result = await dialog.showSaveDialog(options)
      return result
    } catch (error) {
      console.error('Error showing save dialog:', error)
      return { canceled: true }
    }
  })

  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(options)
      return result
    } catch (error) {
      console.error('Error showing open dialog:', error)
      return { canceled: true }
    }
  })
}

module.exports = { registerDialogHandlers }
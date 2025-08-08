const { ipcMain, app } = require('electron')
const path = require('path')
const fs = require('fs').promises

function registerFileOperationHandlers() {
  ipcMain.handle('save-file', async (event, data, filepath) => {
    try {
      const finalPath = filepath || path.join(app.getPath('downloads'), 'recording.webm')

      let buffer
      if (Buffer.isBuffer(data)) {
        buffer = data
      } else if (Array.isArray(data)) {
        buffer = Buffer.from(data)
      } else if (typeof data === 'string') {
        buffer = Buffer.from(data)
      } else {
        buffer = Buffer.from(JSON.stringify(data))
      }

      await fs.writeFile(finalPath, buffer)
      console.log(`✅ File saved: ${finalPath} (${buffer.length} bytes)`)
      return { success: true, path: finalPath }
    } catch (error) {
      console.error('Error saving file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('open-file', async (event, filename) => {
    try {
      const filePath = path.join(app.getPath('downloads'), filename)
      const data = await fs.readFile(filePath)
      return { success: true, data }
    } catch (error) {
      console.error('Error opening file:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerFileOperationHandlers }
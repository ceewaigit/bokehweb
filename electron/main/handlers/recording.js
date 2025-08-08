const { ipcMain } = require('electron')
const { getRecordingsDirectory } = require('../config')
const path = require('path')
const fs = require('fs').promises

function registerRecordingHandlers() {
  ipcMain.handle('start-recording', async () => {
    return { success: true, recordingsDir: getRecordingsDirectory() }
  })

  ipcMain.handle('stop-recording', async () => {
    return { success: true }
  })

  ipcMain.handle('get-recordings-directory', () => {
    return getRecordingsDirectory()
  })

  ipcMain.handle('save-recording', async (event, filePath, buffer) => {
    try {
      await fs.writeFile(filePath, Buffer.from(buffer))
      return { success: true, filePath }
    } catch (error) {
      console.error('Failed to save recording:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-recordings', async () => {
    try {
      const recordingsDir = getRecordingsDirectory()
      const files = await fs.readdir(recordingsDir)
      const recordings = files
        .filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
        .map(f => ({
          name: f,
          path: path.join(recordingsDir, f),
          timestamp: require('fs').statSync(path.join(recordingsDir, f)).mtime
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
      return recordings
    } catch (error) {
      console.error('Failed to load recordings:', error)
      return []
    }
  })
}

module.exports = { registerRecordingHandlers }
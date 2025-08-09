import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getRecordingsDirectory } from '../config'
import * as path from 'path'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'

export function registerRecordingHandlers(): void {
  ipcMain.handle('start-recording', async () => {
    return { success: true, recordingsDir: getRecordingsDirectory() }
  })

  ipcMain.handle('stop-recording', async () => {
    return { success: true }
  })

  ipcMain.handle('get-recordings-directory', () => {
    return getRecordingsDirectory()
  })

  ipcMain.handle('save-recording', async (event: IpcMainInvokeEvent, filePath: string, buffer: Buffer) => {
    try {
      await fs.writeFile(filePath, Buffer.from(buffer))
      return { success: true, filePath }
    } catch (error: any) {
      console.error('Failed to save recording:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-recordings', async () => {
    try {
      const recordingsDir = getRecordingsDirectory()
      const files = await fs.readdir(recordingsDir)
      const recordings = files
        .filter(f => f.endsWith('.webm') || f.endsWith('.mp4') || f.endsWith('.ssproj'))
        .map(f => ({
          name: f,
          path: path.join(recordingsDir, f),
          timestamp: fsSync.statSync(path.join(recordingsDir, f)).mtime
        }))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      return recordings
    } catch (error) {
      console.error('Failed to load recordings:', error)
      return []
    }
  })
}
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
      console.log(`[Library] Scanning recordings dir: ${recordingsDir}`)
      const files = await fs.readdir(recordingsDir)
      console.log(`[Library] Found files:`, files)
      const recordings = files
        .filter(f => f.endsWith('.ssproj'))
        .map(f => {
          const filePath = path.join(recordingsDir, f)
          const stats = fsSync.statSync(filePath)
          
          // Try to find associated video file
          let videoSize = 0
          const baseName = f.replace('.ssproj', '')
          const possibleVideoFiles = [
            `${baseName}.webm`,
            `${baseName}.mp4`
          ]
          
          for (const videoFile of possibleVideoFiles) {
            const videoPath = path.join(recordingsDir, videoFile)
            if (fsSync.existsSync(videoPath)) {
              const videoStats = fsSync.statSync(videoPath)
              videoSize = videoStats.size
              break
            }
          }
          
          return {
            name: f,
            path: filePath,
            timestamp: stats.mtime,
            size: stats.size,
            videoSize: videoSize
          }
        })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      console.log(`[Library] Returning ${recordings.length} project(s)`)
      return recordings
    } catch (error) {
      console.error('Failed to load recordings:', error)
      return []
    }
  })
  
  ipcMain.handle('get-file-size', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      const stats = await fs.stat(filePath)
      return { success: true, size: stats.size }
    } catch (error: any) {
      console.error('Failed to get file size:', error)
      return { success: false, error: error.message }
    }
  })
}
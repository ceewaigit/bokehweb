import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import { getRecordingsDirectory } from '../config'

export function registerRecordingHandlers(): void {
  ipcMain.handle('start-recording', async () => {
    return { success: true, recordingsDir: getRecordingsDirectory() }
  })

  ipcMain.handle('stop-recording', async () => {
    return { success: true }
  })

  ipcMain.handle('get-recordings-directory', (): string => {
    return getRecordingsDirectory()
  })

  ipcMain.handle('save-recording', async (event: IpcMainInvokeEvent, filePath: string, buffer: Buffer) => {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, Buffer.from(buffer))
      return { success: true, data: { filePath } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to save:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('load-recordings', async () => {
    try {
      const recordingsDir = getRecordingsDirectory()

      const results: Array<{ name: string; path: string; timestamp: Date; size: number }> = []

      async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(fullPath)
          } else if (entry.isFile() && entry.name.endsWith('.ssproj')) {
            const stats = fsSync.statSync(fullPath)
            results.push({ name: entry.name, path: fullPath, timestamp: stats.mtime, size: stats.size })
          }
        }
      }

      await walk(recordingsDir)

      const recordings = results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      return recordings
    } catch (error) {
      console.error('[Recording] Failed to load recordings:', error)
      return []
    }
  })

  ipcMain.handle('get-file-size', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      const stats = await fs.stat(filePath)
      return { success: true, data: { size: stats.size } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recording] Failed to get file size:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })
}
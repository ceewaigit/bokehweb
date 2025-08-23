import { ipcMain, app, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'

export function registerFileOperationHandlers(): void {
  ipcMain.handle('save-file', async (event: IpcMainInvokeEvent, data: Buffer | ArrayBuffer | string | object, filepath?: string) => {
    try {
      // Determine final save path. If a path is provided but has no extension, default to mp4.
      let finalPath = filepath
      if (!finalPath) {
        finalPath = path.join(app.getPath('downloads'), 'recording.mp4')
      } else {
        const ext = path.extname(finalPath)
        if (!ext) {
          finalPath = `${finalPath}.mp4`
        }
      }

      let buffer: Buffer
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
      console.log(`[FileOps] ✅ File saved: ${finalPath} (${buffer.length} bytes)`)
      return { success: true, path: finalPath }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error saving file:', error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('open-file', async (event: IpcMainInvokeEvent, filename: string) => {
    try {
      const filePath = path.join(app.getPath('downloads'), filename)
      const data = await fs.readFile(filePath)
      return { success: true, data: { data } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error opening file:', error)
      return { success: false, error: errorMessage }
    }
  })

  // Read an arbitrary local file by absolute path and return its ArrayBuffer
  ipcMain.handle('read-local-file', async (_event: IpcMainInvokeEvent, absolutePath: string) => {
    try {
      const data = await fs.readFile(absolutePath)
      // Return a proper ArrayBuffer slice
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      return { success: true, data: arrayBuffer }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[FileOps] Error reading local file:', error)
      return { success: false, error: errorMessage }
    }
  })
}
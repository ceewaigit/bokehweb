import { ipcMain, app, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'

export function registerFileOperationHandlers(): void {
  ipcMain.handle('save-file', async (event: IpcMainInvokeEvent, data: any, filepath?: string) => {
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
      console.log(`✅ File saved: ${finalPath} (${buffer.length} bytes)`)
      return { success: true, path: finalPath }
    } catch (error: any) {
      console.error('Error saving file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('open-file', async (event: IpcMainInvokeEvent, filename: string) => {
    try {
      const filePath = path.join(app.getPath('downloads'), filename)
      const data = await fs.readFile(filePath)
      return { success: true, data }
    } catch (error: any) {
      console.error('Error opening file:', error)
      return { success: false, error: error.message }
    }
  })

  // Read an arbitrary local file by absolute path and return its ArrayBuffer
  ipcMain.handle('read-local-file', async (_event: IpcMainInvokeEvent, absolutePath: string) => {
    try {
      const data = await fs.readFile(absolutePath)
      // Return a proper ArrayBuffer slice
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      return { success: true, data: arrayBuffer }
    } catch (error: any) {
      console.error('Error reading local file:', error)
      return { success: false, error: error.message }
    }
  })
}
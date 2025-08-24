import { ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { app } from 'electron'

let nativeRecorder: any = null

// Try to load the native module
try {
  // Check if we're on macOS 13+
  const os = require('os')
  const platform = os.platform()
  const release = os.release()
  const majorVersion = parseInt(release.split('.')[0])
  
  if (platform === 'darwin' && majorVersion >= 22) { // macOS 13 is Darwin 22
    try {
      // Try to load the compiled native module
      const modulePath = path.join(__dirname, '../../../../build/Release/screen_recorder.node')
      const nativeModule = require(modulePath)
      nativeRecorder = new nativeModule.NativeScreenRecorder()
      console.log('✅ Native ScreenCaptureKit recorder loaded successfully')
    } catch (err) {
      console.warn('⚠️ Native screen recorder not available:', err)
      console.log('Run "npm run rebuild" to compile native modules')
    }
  } else {
    console.log('ℹ️ Native recorder requires macOS 13.0 or later')
  }
} catch (err) {
  console.warn('Failed to check native recorder availability:', err)
}

export function setupNativeRecorder() {
  // Check if native recorder is available
  ipcMain.handle('native-recorder:available', async () => {
    return nativeRecorder !== null
  })

  // Start recording a display
  ipcMain.handle('native-recorder:start-display', async (event, displayId: number) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    // Create temp file path
    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `screenstudio-${timestamp}.mp4`)

    return new Promise((resolve, reject) => {
      nativeRecorder.startDisplayRecording(displayId, outputPath, (err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve({ outputPath })
        }
      })
    })
  })

  // Start recording a window
  ipcMain.handle('native-recorder:start-window', async (event, windowId: number) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    // Create temp file path
    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `screenstudio-${timestamp}.mp4`)

    return new Promise((resolve, reject) => {
      nativeRecorder.startWindowRecording(windowId, outputPath, (err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve({ outputPath })
        }
      })
    })
  })

  // Stop recording
  ipcMain.handle('native-recorder:stop', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    return new Promise((resolve, reject) => {
      nativeRecorder.stopRecording((err: Error | null, outputPath: string | null) => {
        if (err) {
          reject(err)
        } else {
          resolve({ outputPath })
        }
      })
    })
  })

  // Check if recording
  ipcMain.handle('native-recorder:is-recording', async () => {
    if (!nativeRecorder) {
      return false
    }
    return nativeRecorder.isRecording()
  })

  // Read video file as blob
  ipcMain.handle('native-recorder:read-video', async (event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath)
      // Clean up temp file after reading
      await fs.unlink(filePath).catch(() => {})
      return buffer
    } catch (err) {
      console.error('Failed to read video file:', err)
      throw err
    }
  })
}

// Helper to get display/window IDs from desktopCapturer source IDs
export function parseSourceId(sourceId: string): { type: 'screen' | 'window', id: number } | null {
  // Source IDs are in format "screen:0:0" or "window:1234:0"
  const parts = sourceId.split(':')
  if (parts.length < 2) return null

  const type = parts[0] as 'screen' | 'window'
  const id = parseInt(parts[1])

  if (isNaN(id)) return null

  return { type, id }
}
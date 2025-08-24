import { ipcMain, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

let nativeRecorder: any = null

// Try to load the native ScreenCaptureKit module
console.log('🔍 Attempting to load native ScreenCaptureKit module...')
try {
  const os = require('os')
  const platform = os.platform()
  
  console.log(`Platform: ${platform}, Darwin version: ${os.release()}`)
  
  if (platform === 'darwin') {
    try {
      // Load the compiled ScreenCaptureKit native module
      const modulePath = path.join(__dirname, '../../../../build/Release/screencapture_kit.node')
      console.log(`Looking for native module at: ${modulePath}`)
      
      const nativeModule = require(modulePath)
      console.log('Native module loaded successfully')
      
      nativeRecorder = new nativeModule.NativeScreenRecorder()
      
      // Check if ScreenCaptureKit is available (macOS 12.3+)
      if (nativeRecorder.isAvailable()) {
        console.log('✅ Native ScreenCaptureKit recorder loaded - cursor will be hidden!')
      } else {
        console.log('⚠️ ScreenCaptureKit requires macOS 12.3 or later')
        nativeRecorder = null
      }
    } catch (err) {
      console.error('⚠️ Native screen recorder module not found:', err)
      console.log('Module path tried:', path.join(__dirname, '../../../../build/Release/screencapture_kit.node'))
      console.log('Run "npm run rebuild" to compile native modules')
    }
  } else {
    console.log('Not on macOS, skipping native recorder')
  }
} catch (err) {
  console.error('Failed to check native recorder:', err)
}

export function setupNativeRecorder() {
  console.log('Setting up native recorder handlers, nativeRecorder:', nativeRecorder ? 'loaded' : 'null')
  
  // Check if native recorder is available
  ipcMain.handle('native-recorder:available', async () => {
    console.log('Checking native recorder availability:', nativeRecorder !== null)
    return nativeRecorder !== null
  })

  // Start recording
  ipcMain.handle('native-recorder:start-display', async (event, displayId: number) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `screenstudio-native-${timestamp}.mov`)

    return new Promise((resolve, reject) => {
      nativeRecorder.startRecording(displayId, outputPath, (err: Error | null) => {
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

  // Read video file as buffer
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
import { ipcMain, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

let nativeRecorder: any = null

// Declare shim for webpack's non-webpack require if present
declare const __non_webpack_require__: NodeJS.Require | undefined

// Function to load the native recorder module
function loadNativeRecorder() {
  console.log('🔍 Attempting to load native ScreenCaptureKit module...')
  try {
    const os = require('os')
    const platform = os.platform()

    console.log(`Platform: ${platform}, Darwin version: ${os.release()}`)

    if (platform === 'darwin') {
      let moduleLoaded = false

      // Try multiple possible paths for the native module
      const envPath = process.env.SCREENCAPTURE_KIT_PATH
      if (envPath) {
        console.log(`SCREENCAPTURE_KIT_PATH override is set: ${envPath}`)
      }
      const possiblePaths = [
        ...(envPath ? [envPath] : []),
        // In development, the module is relative to the src directory
        path.join(app.getAppPath(), 'build', 'Release', 'screencapture_kit.node'),
        // Try two levels up (useful when app.getAppPath() is .webpack/main)
        path.join(app.getAppPath(), '..', '..', 'build', 'Release', 'screencapture_kit.node'),
        // In production, it might be in the resources directory
        path.join(process.resourcesPath || '', 'build', 'Release', 'screencapture_kit.node'),
        // Fallback to old path resolution
        path.join(__dirname, '../../../../build/Release/screencapture_kit.node'),
        // Another possible location in packaged app
        path.join(app.getAppPath(), '..', 'build', 'Release', 'screencapture_kit.node'),
        // Try absolute path as last resort
        path.join(process.cwd(), 'build', 'Release', 'screencapture_kit.node')
      ]

      console.log('App path:', app.getAppPath())
      console.log('Process CWD:', process.cwd())
      console.log('__dirname:', __dirname)
      if (process.resourcesPath) {
        console.log('Resources path:', process.resourcesPath)
      }
      console.log('Electron ABI:', process.versions.modules, 'arch:', process.arch)

      // Use Node's real require to bypass webpack bundling for native modules
      const nodeRequire: NodeJS.Require = (typeof __non_webpack_require__ !== 'undefined'
        ? __non_webpack_require__ as NodeJS.Require
        : (eval('require')))

      for (const modulePath of possiblePaths) {
        try {
          console.log(`Trying module path: ${modulePath}`)

          // Check if file exists before trying to require it
          if (require('fs').existsSync(modulePath)) {
            console.log(`✓ File exists at: ${modulePath}`)

            const nativeModule = nodeRequire(modulePath)
            console.log('✓ Native module loaded successfully')

            nativeRecorder = new nativeModule.NativeScreenRecorder()
            console.log('✅ Native ScreenCaptureKit recorder loaded - cursor will be hidden!')
            moduleLoaded = true
            break
          } else {
            console.log(`✗ File not found at: ${modulePath}`)
          }
        } catch (err: any) {
          console.error(`✗ Failed to load from ${modulePath}:`, err && err.message ? err.message : err)
          if (err && err.stack) {
            console.error('Load stack:', err.stack)
          }
        }
      }

      if (!moduleLoaded) {
        console.error('⚠️ Native screen recorder module not found in any expected location')
        console.log('Please ensure the native module is built by running: npm run rebuild')
        console.log('The app will fall back to MediaRecorder (cursor will be visible)')
      }
    } else {
      console.log('Not on macOS, skipping native recorder')
    }
  } catch (err) {
    console.error('Failed to check native recorder:', err)
  }
}

export function setupNativeRecorder() {
  // Load the native recorder module first
  loadNativeRecorder()

  console.log('Setting up native recorder handlers, nativeRecorder:', nativeRecorder ? 'loaded' : 'null')

  // Check if native recorder is available
  ipcMain.handle('native-recorder:available', async () => {
    console.log('Checking native recorder availability:', nativeRecorder !== null)
    return nativeRecorder !== null
  })

  // Start recording
  ipcMain.handle('native-recorder:start-display', async (event, displayId: number, bounds?: { x: number; y: number; width: number; height: number }) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `screenstudio-native-${timestamp}.mov`)

    return new Promise((resolve, reject) => {
      // If bounds provided, pass to native recorder (for region capture)
      if (bounds) {
        nativeRecorder.startRecordingWithRect(displayId, outputPath, bounds.x, bounds.y, bounds.width, bounds.height, (err: Error | null) => {
          if (err) {
            reject(err)
          } else {
            resolve({ outputPath })
          }
        })
      } else {
        nativeRecorder.startRecording(displayId, outputPath, (err: Error | null) => {
          if (err) {
            reject(err)
          } else {
            resolve({ outputPath })
          }
        })
      }
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

  // Pause recording
  ipcMain.handle('native-recorder:pause', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }
    nativeRecorder.pauseRecording()
    console.log('Native recording paused')
    return { success: true }
  })

  // Resume recording
  ipcMain.handle('native-recorder:resume', async () => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }
    nativeRecorder.resumeRecording()
    console.log('Native recording resumed')
    return { success: true }
  })

  // Read video file as buffer
  ipcMain.handle('native-recorder:read-video', async (event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath)
      // Clean up temp file after reading
      await fs.unlink(filePath).catch(() => { })
      return buffer
    } catch (err) {
      console.error('Failed to read video file:', err)
      throw err
    }
  })

  // Start recording a specific window
  ipcMain.handle('native-recorder:start-window', async (event, windowId: number) => {
    if (!nativeRecorder) {
      throw new Error('Native recorder not available')
    }

    const tempDir = app.getPath('temp')
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `screenstudio-native-window-${timestamp}.mov`)

    console.log(`Starting window recording for window ID: ${windowId}`)

    return new Promise((resolve, reject) => {
      nativeRecorder.startRecordingWindow(windowId, outputPath, (err: Error | null) => {
        if (err) {
          console.error('Failed to start window recording:', err)
          reject(err)
        } else {
          console.log('Window recording started:', outputPath)
          resolve({ outputPath })
        }
      })
    })
  })
}
import { app, BrowserWindow, protocol } from 'electron'
import * as path from 'path'
import { isDev, getRecordingsDirectory } from './config'
import { createRecordButton, setupRecordButton } from './windows/record-button'
import { checkMediaPermissions } from './services/permissions'
import { registerRecordingHandlers } from './handlers/recording'
import { registerSourceHandlers } from './handlers/sources'
import { registerPermissionHandlers } from './handlers/permissions'
import { registerMouseTrackingHandlers, cleanupMouseTracking } from './handlers/mouse-tracking'
import { registerFileOperationHandlers } from './handlers/file-operations'
import { registerDialogHandlers } from './handlers/dialogs'
import { registerWindowControlHandlers } from './handlers/window-controls'
import { setupNativeRecorder } from './handlers/native-recorder'

function registerProtocol(): void {
  // Register app protocol for packaged app
  if (!isDev && app.isPackaged) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.replace('app://', '')
      const decodedUrl = decodeURIComponent(url)
      try {
        const filePath = path.join(app.getAppPath(), 'out', decodedUrl)
        callback(filePath)
      } catch (error) {
        console.error('[Protocol] Error loading file:', error)
      }
    })
  }

  // Register video-stream protocol for local video files
  // This works in both dev and production
  protocol.registerFileProtocol('video-stream', (request, callback) => {
    const url = request.url.replace('video-stream://', '')
    const decodedUrl = decodeURIComponent(url)
    try {
      // The URL should be the absolute file path
      callback(decodedUrl)
    } catch (error) {
      console.error('[Protocol] Error streaming video file:', error)
    }
  })
}

function registerAllHandlers(): void {
  registerRecordingHandlers()
  registerSourceHandlers()
  registerPermissionHandlers()
  registerMouseTrackingHandlers()
  registerFileOperationHandlers()
  registerDialogHandlers()
  registerWindowControlHandlers()
  setupNativeRecorder()
}

// Define global variables with proper types
declare global {
  var recordingsDirectory: string
  var mainWindow: BrowserWindow | null
  var recordButton: BrowserWindow | null
}

global.recordingsDirectory = getRecordingsDirectory()

async function initializeApp(): Promise<void> {
  console.log(`🚀 App ready - Electron version: ${process.versions.electron}`)
  console.log(`🌐 Chrome version: ${process.versions.chrome}`)
  
  registerProtocol()
  await checkMediaPermissions()
  registerAllHandlers()

  global.mainWindow = null

  const recordButton = createRecordButton()
  global.recordButton = recordButton
  setupRecordButton(recordButton)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newRecordButton = createRecordButton()
      global.recordButton = newRecordButton
      setupRecordButton(newRecordButton)
    }
  })
}

app.whenReady().then(initializeApp)

if (isDev) {
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
}

app.on('window-all-closed', () => {
  cleanupMouseTracking()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (error: Error) => {
  console.error('[Process] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[Process] Unhandled Rejection:', { promise, reason })
})
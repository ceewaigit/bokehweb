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

// Define global variables with proper types
declare global {
  var recordingsDirectory: string
  var mainWindow: BrowserWindow | null
  var recordButton: BrowserWindow | null
}

global.recordingsDirectory = getRecordingsDirectory()

function registerProtocol(): void {
  if (!isDev && app.isPackaged) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.replace('app://', '')
      const decodedUrl = decodeURIComponent(url)
      try {
        const filePath = path.join(app.getAppPath(), 'out', decodedUrl)
        callback(filePath)
      } catch (error) {
        console.error('Error loading file:', error)
      }
    })
  }
}

function registerAllHandlers(): void {
  registerRecordingHandlers()
  registerSourceHandlers()
  registerPermissionHandlers()
  registerMouseTrackingHandlers()
  registerFileOperationHandlers()
  registerDialogHandlers()
  registerWindowControlHandlers()
}

async function initializeApp(): Promise<void> {
  console.log('🚀 App ready - Electron version:', process.versions.electron)
  console.log('🌐 Chrome version:', process.versions.chrome)
  
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
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
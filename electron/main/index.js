const { app, BrowserWindow, protocol } = require('electron')
const path = require('path')
const { isDev, getRecordingsDirectory } = require('./config')
const { createRecordButton, setupRecordButton } = require('./windows/record-button')
const { checkMediaPermissions } = require('./services/permissions')
const { registerRecordingHandlers } = require('./handlers/recording')
const { registerSourceHandlers } = require('./handlers/sources')
const { registerPermissionHandlers } = require('./handlers/permissions')
const { registerMouseTrackingHandlers, cleanupMouseTracking } = require('./handlers/mouse-tracking')
const { registerFileOperationHandlers } = require('./handlers/file-operations')
const { registerDialogHandlers } = require('./handlers/dialogs')
const { registerWindowControlHandlers } = require('./handlers/window-controls')

global.recordingsDirectory = getRecordingsDirectory()

function registerProtocol() {
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

function registerAllHandlers() {
  registerRecordingHandlers()
  registerSourceHandlers()
  registerPermissionHandlers()
  registerMouseTrackingHandlers()
  registerFileOperationHandlers()
  registerDialogHandlers()
  registerWindowControlHandlers()
}

async function initializeApp() {
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

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
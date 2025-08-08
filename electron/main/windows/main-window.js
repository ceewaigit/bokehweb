const { BrowserWindow } = require('electron')
const path = require('path')
const { getAppURL, isDev } = require('../config')

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableWebSQL: false,
      spellcheck: false,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#000000',
      height: 40
    },
    frame: true,
    trafficLightPosition: { x: 20, y: 20 }
  })

  setupPermissions(mainWindow)
  setupSecurityPolicy(mainWindow)

  mainWindow.loadURL(getAppURL())

  if (isDev) {
    mainWindow.webContents.openDevTools()
    mainWindow.once('ready-to-show', () => {
      mainWindow.show()
    })
  }

  return mainWindow
}

function setupPermissions(window) {
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission requested:', permission)
    if (permission === 'media' || permission === 'display-capture' || permission === 'screen') {
      console.log('✅ Granting permission for:', permission)
      callback(true)
    } else {
      console.log('❌ Denying permission for:', permission)
      callback(false)
    }
  })

  window.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    console.log('🔍 Permission check:', permission)
    return permission === 'media' || permission === 'display-capture' || permission === 'screen'
  })
}

function setupSecurityPolicy(window) {
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: https://unpkg.com; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com blob:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: file:; " +
          "media-src 'self' data: blob: file:; " +
          "connect-src 'self' file: data: blob: https://unpkg.com; " +
          "worker-src 'self' blob:; " +
          "frame-src 'none';"
        ]
      }
    })
  })
}

module.exports = { createMainWindow }
import { BrowserWindow, WebContents } from 'electron'
import * as path from 'path'
import { getAppURL, isDev } from '../config'

// Webpack entry points are set as environment variables by electron-forge

export function createMainWindow(): BrowserWindow {
  console.log('[MainWindow] Creating main window...')
  
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    vibrancy: 'under-window', // macOS vibrancy for true glassmorphism
    backgroundMaterial: 'acrylic', // Windows 11 acrylic effect
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableWebSQL: false,
      spellcheck: false,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      color: '#ffffff', // Solid white title bar
      symbolColor: '#000000',
      height: 40
    },
    frame: true,
    trafficLightPosition: { x: 20, y: 16 }
  })

  setupPermissions(mainWindow)
  setupSecurityPolicy(mainWindow)

  // Don't load URL here - let the caller handle it
  // This prevents double loading
  
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    console.log('[MainWindow] Window closed')
  })

  return mainWindow
}

function setupPermissions(window: BrowserWindow): void {
  const permissionHandler = (webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
    console.log('🔐 Permission requested:', permission)
    if (permission === 'media' || permission === 'display-capture' || permission === 'screen') {
      console.log('✅ Granting permission for:', permission)
      callback(true)
    } else {
      console.log('❌ Denying permission for:', permission)
      callback(false)
    }
  }
  window.webContents.session.setPermissionRequestHandler(permissionHandler)

  const permissionCheckHandler = (webContents: WebContents | null, permission: string) => {
    console.log('🔍 Permission check:', permission)
    return permission === 'media' || permission === 'display-capture' || permission === 'screen'
  }
  window.webContents.session.setPermissionCheckHandler(permissionCheckHandler)
}

function setupSecurityPolicy(window: BrowserWindow): void {
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: video-stream: https://unpkg.com; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com blob:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: file: video-stream:; " +
          "media-src 'self' data: blob: file: video-stream:; " +
          "connect-src 'self' file: data: blob: https://unpkg.com; " +
          "worker-src 'self' blob:; " +
          "frame-src 'none';"
      }
    })
  })
}
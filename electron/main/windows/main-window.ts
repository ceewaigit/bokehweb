import { BrowserWindow, WebContents } from 'electron'
import * as path from 'path'
import { getAppURL, isDev } from '../config'

// Webpack entry points are set as environment variables by electron-forge

export function createMainWindow(): BrowserWindow {
  console.log('[MainWindow] Creating main window...')

  const isMac = process.platform === 'darwin'

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: '#00000000',
    ...(isMac
      ? {
          transparent: true,
          vibrancy: 'under-window',
          visualEffectState: 'active',
        }
      : {
          transparent: true,
        }),
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
    titleBarStyle: isMac ? 'hidden' : 'hiddenInset',
    ...(isMac
      ? {
          // Frameless is required for full-window vibrancy on recent macOS/Electron.
          frame: false,
          trafficLightPosition: { x: 20, y: 16 },
        }
      : {
          frame: true,
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#ffffff',
            height: 40,
          },
          trafficLightPosition: { x: 20, y: 16 },
        })
  })

  setupPermissions(mainWindow)
  setupSecurityPolicy(mainWindow)

  // Don't load URL here - let the caller handle it
  // This prevents double loading

  if (isMac) {
    try {
      // Re-apply vibrancy after creation; some macOS/Electron combos ignore ctor value.
      mainWindow.setVibrancy?.('under-window')
      mainWindow.setBackgroundColor('#00000000')
      ;(mainWindow as any).setVisualEffectState?.('active')
    } catch (e) {
      console.warn('[MainWindow] Failed to apply vibrancy on macOS:', e)
    }
  }

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
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: video-stream: http://127.0.0.1:* http://localhost:* https://unpkg.com; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com blob:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: file: video-stream: http://127.0.0.1:* http://localhost:*; " +
          "media-src 'self' data: blob: file: video-stream: http://127.0.0.1:* http://localhost:*; " +
          "connect-src 'self' file: data: blob: video-stream: http://127.0.0.1:* http://localhost:* ws://localhost:* https://unpkg.com; " +
          "worker-src 'self' blob:; " +
          "frame-src 'none';"
      }
    })
  })
}

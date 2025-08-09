import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getAppURL } from '../config'

// Webpack entry points are set as environment variables by electron-forge

function setupSecurityPolicy(window: BrowserWindow): void {
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: https://unpkg.com; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com blob:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: file:; " +
          "media-src 'self' data: blob: file:; " +
          "connect-src 'self' file: data: blob: ws://localhost:3001 http://localhost:3001 https://unpkg.com; " +
          "worker-src 'self' blob:; " +
          "frame-src 'none';"
      }
    })
  })
}

export function createRecordButton(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  console.log('🖥️ Creating record button for display:', display.bounds)

  const isDev = process.env.NODE_ENV === 'development'

  const recordButton = new BrowserWindow({
    width: 700,
    height: 100,
    x: Math.floor(display.workAreaSize.width / 2 - 300),
    y: 20,
    frame: false,
    transparent: !isDev,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: !isDev,
    hasShadow: false,
    roundedCorners: true,
    show: false,
    webPreferences: {
      nodeIntegration: isDev,
      contextIsolation: !isDev,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
      webSecurity: false,
      devTools: true,
      backgroundThrottling: false
    }
  })

  recordButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  recordButton.setAlwaysOnTop(true, 'screen-saver', 1)
  recordButton.setIgnoreMouseEvents(false)

  // Apply CSP so blob: media URLs are allowed
  setupSecurityPolicy(recordButton)

  if (isDev) {
    recordButton.webContents.openDevTools({ mode: 'detach' })
  }

  recordButton.on('unresponsive', () => {
    console.error('❌ Record button window became unresponsive')
  })

  recordButton.on('closed', () => {
    console.log('🔒 Record button window closed')
  })

  return recordButton
}

export function setupRecordButton(recordButton: BrowserWindow): void {
  const url = getAppURL('/record-button')
  console.log('🔗 Loading record button from:', url)

  recordButton.loadURL(url)

  recordButton.once('ready-to-show', () => {
    console.log('✅ Record button ready to show')
    recordButton.show()
    recordButton.focus()

    if (process.env.TEST_AUTO_RECORD === 'true') {
      setTimeout(() => {
        console.log('[TEST] Auto-clicking record button...')
        recordButton.webContents.executeJavaScript(`
          const button = document.querySelector('button');
          if (button && button.textContent.includes('Start Recording')) {
            button.click();
            console.log('[TEST] Clicked Start Recording button');
          }
        `)
      }, 3000)
    }
  })

  setTimeout(() => {
    if (!recordButton.isVisible()) {
      console.log('⚠️ Force showing record button')
      recordButton.show()
      recordButton.focus()
    }
  }, 2000)

  recordButton.webContents.on('did-finish-load', () => {
    console.log('📄 Record button content loaded')
  })

  recordButton.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Failed to load record button:', errorCode, errorDescription)
  })

  recordButton.webContents.on('render-process-gone', (event, details) => {
    console.error('💥 Renderer process crashed:', details)
    setTimeout(() => {
      console.log('🔄 Attempting to reload record button...')
      recordButton.reload()
    }, 1000)
  })

  recordButton.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('app://') && !url.startsWith('data:')) {
      console.log('🚫 Preventing navigation to:', url)
      event.preventDefault()
    }
  })
}
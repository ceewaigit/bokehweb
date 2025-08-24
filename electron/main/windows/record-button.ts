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
  console.log('🖥️ Creating record button overlay for display:', display.bounds)

  const isDev = process.env.NODE_ENV === 'development'

  const recordButton = new BrowserWindow({
    width: 200,
    height: 50,
    minWidth: 180,
    minHeight: 40,
    x: Math.floor(display.workAreaSize.width / 2 - 100),
    y: 20,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
      backgroundThrottling: false
    }
  })

  // Set window title to empty string to avoid any OS chrome showing it
  recordButton.setTitle('')
  
  // Configure as a true overlay window
  recordButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  
  // Simple window level setup - let's get it working first
  recordButton.setAlwaysOnTop(true, 'floating', 1)
  
  // Don't ignore mouse events - we need interaction
  recordButton.setIgnoreMouseEvents(false)
  
  // Auto-resize window based on actual content size
  recordButton.webContents.on('did-finish-load', () => {
    console.log('🔄 Setting up content-based auto-resize')
    
    recordButton.webContents.executeJavaScript(`
      // Get the actual size of the content
      const measureContent = () => {
        const content = document.querySelector('body > div');
        if (!content) return null;
        
        // Force layout recalculation
        content.style.display = 'none';
        content.offsetHeight; // Trigger reflow
        content.style.display = '';
        
        const rect = content.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(content);
        const width = Math.ceil(rect.width);
        const height = Math.ceil(rect.height);
        
        console.log('📏 Measured content:', width, 'x', height);
        
        return {
          width: Math.max(180, width),
          height: Math.max(40, height)
        };
      };
      
      // Resize the window to fit content
      const resizeToContent = () => {
        const size = measureContent();
        if (size && size.width > 0 && size.height > 0) {
          console.log('📐 Resizing window to:', size);
          window.electronAPI?.setWindowContentSize(size);
        }
      };
      
      // Use ResizeObserver for efficient monitoring
      const content = document.querySelector('body > div');
      if (content) {
        const observer = new ResizeObserver(() => {
          requestAnimationFrame(resizeToContent);
        });
        observer.observe(content);
        
        // Aggressive initial resize attempts
        resizeToContent(); // Immediate
        setTimeout(resizeToContent, 0);
        setTimeout(resizeToContent, 50);
        setTimeout(resizeToContent, 100);
        setTimeout(resizeToContent, 200);
      }
    `);
  })

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
  })

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
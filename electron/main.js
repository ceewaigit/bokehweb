const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, protocol, screen, systemPreferences } = require('electron')
const path = require('path')
const { URL } = require('url')
const NativeMouseTracker = require('./native-mouse-tracker')
const isDev = process.env.NODE_ENV === 'development'

// Global mouse tracker instance
let mouseTracker = null

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
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
    show: false,
    trafficLightPosition: { x: 20, y: 20 }
  })

  // Enable media access
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission requested:', permission)
    // Grant all media permissions
    if (permission === 'media' || permission === 'display-capture' || permission === 'screen') {
      console.log('✅ Granting permission for:', permission)
      callback(true)
    } else {
      console.log('❌ Denying permission for:', permission)
      callback(false)
    }
  })
  
  // Also set permission check handler
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log('🔍 Permission check:', permission, 'from:', requestingOrigin)
    return permission === 'media' || permission === 'display-capture' || permission === 'screen'
  })

  // Set Content Security Policy for security - allow FFmpeg and blob URLs
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  return mainWindow
}

app.whenReady().then(async () => {
  console.log('🚀 App ready - Electron version:', process.versions.electron)
  console.log('🌐 Chrome version:', process.versions.chrome)
  
  // Request media permissions on macOS
  if (process.platform === 'darwin') {
    try {
      console.log('🔐 Checking macOS media permissions...')
      
      // Check screen recording permission first (most important)
      const screenStatus = systemPreferences.getMediaAccessStatus('screen')
      console.log('🖥️ Screen recording permission:', screenStatus)
      
      if (screenStatus !== 'granted') {
        console.log('⚠️ Screen recording permission not granted')
        
        // Store permission status globally for renderer to check
        global.screenRecordingPermission = screenStatus
        
        // We'll show a dialog in the renderer to guide the user
        console.log('📝 Will show permission guide to user after window loads')
      } else {
        global.screenRecordingPermission = 'granted'
      }
      
      // Request microphone access (optional for screen recording)
      try {
        const microphoneStatus = await systemPreferences.askForMediaAccess('microphone')
        console.log('🎤 Microphone permission:', microphoneStatus ? 'granted' : 'denied')
      } catch (e) {
        console.log('🎤 Microphone permission check skipped:', e.message)
      }
      
    } catch (error) {
      console.error('❌ Error checking media permissions:', error)
      global.screenRecordingPermission = 'unknown'
    }
  } else {
    // Non-macOS platforms don't need special permissions
    global.screenRecordingPermission = 'granted'
  }
  
  // Initialize native mouse tracker
  mouseTracker = new NativeMouseTracker()
  
  const mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Enable Chrome logging for debugging
if (process.env.NODE_ENV === 'development') {
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
}

app.on('window-all-closed', () => {
  // Clean up mouse tracker
  if (mouseTracker) {
    mouseTracker.stop()
    mouseTracker = null
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers for screen recording
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 }
    })
    return sources
  } catch (error) {
    console.error('Error getting sources:', error)
    return []
  }
})

// Check screen recording permission
ipcMain.handle('check-screen-recording-permission', async () => {
  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('screen')
      console.log('🔍 Screen recording permission status:', status)
      return { status, granted: status === 'granted' }
    } catch (error) {
      console.error('❌ Error checking screen recording permission:', error)
      return { status: 'unknown', granted: false }
    }
  }
  return { status: 'not-applicable', granted: true }
})

// Request screen recording permission
ipcMain.handle('request-screen-recording-permission', async () => {
  if (process.platform === 'darwin') {
    try {
      const canPrompt = await systemPreferences.askForMediaAccess('screen')
      console.log('🔐 Screen recording permission prompt result:', canPrompt)
      return canPrompt
    } catch (error) {
      console.error('❌ Error requesting screen recording permission:', error)
      return false
    }
  }
  return true
})

// Enhanced desktop sources handler for the new ElectronRecorder
ipcMain.handle('get-desktop-sources', async (event, options = {}) => {
  try {
    // Check permissions first on macOS
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      console.log('🔍 Screen recording permission check:', status)
      
      if (status !== 'granted') {
        // Show helpful dialog
        const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
          type: 'warning',
          title: 'Screen Recording Permission Required',
          message: 'Screen Studio needs permission to record your screen.',
          detail: 'To enable screen recording:\n\n1. Open System Preferences\n2. Go to Security & Privacy > Privacy\n3. Select Screen Recording\n4. Check the box next to Screen Studio\n5. Restart Screen Studio\n\nClick "Open System Preferences" to go there now.',
          buttons: ['Open System Preferences', 'Cancel'],
          defaultId: 0,
          cancelId: 1
        })
        
        if (response === 0) {
          // Open System Preferences to the right pane
          require('child_process').exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
        }
        
        const permissionError = new Error('Screen recording permission denied')
        permissionError.code = 'PERMISSION_DENIED'
        throw permissionError
      }
    }
    
    // Validate and sanitize options
    if (typeof options !== 'object' || options === null) {
      options = {}
    }
    
    const defaultOptions = {
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
      fetchWindowIcons: true
    }
    
    // Sanitize options to prevent malicious input
    const sanitizedOptions = {
      types: Array.isArray(options.types) ? options.types.filter(t => ['screen', 'window'].includes(t)) : defaultOptions.types,
      thumbnailSize: (options.thumbnailSize && typeof options.thumbnailSize === 'object') ? {
        width: Math.max(50, Math.min(300, parseInt(options.thumbnailSize.width) || 150)),
        height: Math.max(50, Math.min(300, parseInt(options.thumbnailSize.height) || 150))
      } : defaultOptions.thumbnailSize,
      fetchWindowIcons: typeof options.fetchWindowIcons === 'boolean' ? options.fetchWindowIcons : defaultOptions.fetchWindowIcons
    }
    
    console.log('🎥 Requesting desktop sources with sanitized options:', sanitizedOptions)
    
    const sources = await desktopCapturer.getSources(sanitizedOptions)
    
    console.log(`📺 Found ${sources.length} desktop sources`)
    
    const mappedSources = sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      display_id: source.display_id,
      appIcon: source.appIcon?.toDataURL()
    }))
    
    console.log('📺 Mapped sources:', mappedSources.map(s => ({ id: s.id, name: s.name })))
    
    return mappedSources
  } catch (error) {
    console.error('❌ Error getting desktop sources:', error)
    console.error('❌ Error details:', error?.message, error?.stack)
    
    // Check if it's a permissions issue
    if (error?.message?.includes('Failed to get sources') || !error?.message) {
      const permissionError = new Error(
        'Screen recording permission required. Please go to System Preferences > Security & Privacy > Privacy > Screen Recording and enable access for this app.'
      )
      permissionError.code = 'PERMISSION_DENIED'
      throw permissionError
    }
    
    throw error
  }
})

// System information handlers
ipcMain.handle('get-platform', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.getSystemVersion?.() || 'unknown'
  }
})

ipcMain.handle('get-screens', async () => {
  return screen.getAllDisplays().map(display => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    internal: display.internal
  }))
})

// File operations
ipcMain.handle('save-file', async (event, data, filepath) => {
  try {
    const fs = require('fs').promises
    
    // If filepath is provided (from save dialog), use it directly
    // Otherwise use downloads folder
    const finalPath = filepath || path.join(app.getPath('downloads'), 'recording.webm')
    
    // Handle different data types
    let buffer
    if (Buffer.isBuffer(data)) {
      buffer = data
    } else if (Array.isArray(data)) {
      // Handle Uint8Array sent as array from renderer
      buffer = Buffer.from(data)
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data)
    } else {
      buffer = Buffer.from(JSON.stringify(data))
    }
    
    await fs.writeFile(finalPath, buffer)
    console.log(`✅ File saved: ${finalPath} (${buffer.length} bytes)`)
    return { success: true, path: finalPath }
  } catch (error) {
    console.error('Error saving file:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-file', async (event, filename) => {
  try {
    const fs = require('fs').promises
    const filePath = path.join(app.getPath('downloads'), filename)
    const data = await fs.readFile(filePath)
    return { success: true, data }
  } catch (error) {
    console.error('Error opening file:', error)
    return { success: false, error: error.message }
  }
})

// Message box handler
ipcMain.handle('show-message-box', async (event, options) => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showMessageBox(window, options)
    return result
  } catch (error) {
    console.error('Error showing message box:', error)
    return { response: 0, checkboxChecked: false }
  }
})

// Native mouse tracking handlers
ipcMain.handle('start-mouse-tracking', async (event, options = {}) => {
  if (!mouseTracker) {
    return { success: false, error: 'Mouse tracker not initialized' }
  }

  try {
    // Validate and sanitize options
    if (typeof options !== 'object' || options === null) {
      options = {}
    }
    
    const intervalMs = Math.max(8, Math.min(1000, parseInt(options.intervalMs) || 16)) // 8ms to 1000ms range
    
    // Set up event forwarding to renderer with validation
    mouseTracker.onMouseMove((data) => {
      // Validate data before sending to prevent bad IPC messages
      if (data && typeof data === 'object' && 
          typeof data.x === 'number' && typeof data.y === 'number' &&
          isFinite(data.x) && isFinite(data.y)) {
        try {
          event.sender.send('mouse-move', {
            x: Math.round(data.x),
            y: Math.round(data.y),
            timestamp: Date.now()
          })
        } catch (ipcError) {
          console.error('❌ IPC error sending mouse-move:', ipcError)
        }
      }
    })
    
    mouseTracker.onMouseClick((data) => {
      // Validate data before sending to prevent bad IPC messages
      if (data && typeof data === 'object' && 
          typeof data.x === 'number' && typeof data.y === 'number' &&
          isFinite(data.x) && isFinite(data.y)) {
        try {
          event.sender.send('mouse-click', {
            x: Math.round(data.x),
            y: Math.round(data.y),
            timestamp: Date.now()
          })
        } catch (ipcError) {
          console.error('❌ IPC error sending mouse-click:', ipcError)
        }
      }
    })
    
    mouseTracker.start(intervalMs)
    
    console.log(`🖱️ Native mouse tracking started (Electron-native)`)
    
    return { 
      success: true, 
      nativeTracking: mouseTracker.isNativeTrackingAvailable(),
      fps: Math.round(1000 / intervalMs)
    }
  } catch (error) {
    console.error('Error starting mouse tracking:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stop-mouse-tracking', async (event) => {
  if (!mouseTracker) {
    return { success: false, error: 'Mouse tracker not initialized' }
  }

  try {
    mouseTracker.stop()
    mouseTracker.removeAllCallbacks()
    console.log('🖱️ Native mouse tracking stopped')
    return { success: true }
  } catch (error) {
    console.error('Error stopping mouse tracking:', error)
    return { success: false, error: error.message }
  }
})

// Get current mouse position
ipcMain.handle('get-mouse-position', async () => {
  if (!mouseTracker) {
    return { success: false, error: 'Mouse tracker not initialized' }
  }

  try {
    const position = mouseTracker.getCurrentPosition()
    return { success: true, position }
  } catch (error) {
    console.error('Error getting mouse position:', error)
    return { success: false, error: error.message }
  }
})

// Check if native tracking is available
ipcMain.handle('is-native-mouse-tracking-available', async () => {
  return {
    available: mouseTracker ? mouseTracker.isNativeTrackingAvailable() : false,
    tracker: !!mouseTracker
  }
})

ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(options)
    return result
  } catch (error) {
    console.error('Error showing save dialog:', error)
    return { canceled: true }
  }
})

ipcMain.handle('show-open-dialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(options)
    return result
  } catch (error) {
    console.error('Error showing open dialog:', error)
    return { canceled: true }
  }
})

// Handle app updates and other main process events
ipcMain.on('app-quit', () => {
  app.quit()
})

ipcMain.on('app-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  window.minimize()
})

ipcMain.on('app-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
})
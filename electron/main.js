const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, protocol, screen, systemPreferences } = require('electron')
const path = require('path')
const { URL } = require('url')
const isDev = process.env.NODE_ENV === 'development'

// URL configuration for development vs production
const getAppURL = (route = '') => {
  if (isDev) {
    return `http://localhost:3000${route}`
  } else {
    // In production, we'll use file:// protocol with a custom scheme
    return `file://${path.join(__dirname, '../out', route ? route + '.html' : 'index.html')}`
  }
}

// Mouse tracking state
let mouseTrackingInterval = null
let mouseEventSender = null
let isMouseTracking = false

// Countdown window reference
let countdownWindow = null

// Create fullscreen countdown window
function createCountdownWindow() {
  const display = screen.getPrimaryDisplay()
  countdownWindow = new BrowserWindow({
    width: display.bounds.width,
    height: display.bounds.height,
    x: display.bounds.x,
    y: display.bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  
  countdownWindow.setIgnoreMouseEvents(true)
  countdownWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  countdownWindow.setAlwaysOnTop(true, 'screen-saver', 1000)
  
  return countdownWindow
}

// Create a floating record button overlay window (like Screen Studio)
function createRecordButton() {
  const display = screen.getPrimaryDisplay()
  const recordButton = new BrowserWindow({
    width: 700,  // Wider to fit all controls
    height: 100,  // Taller for better visibility
    x: Math.floor(display.workAreaSize.width / 2 - 300),  // Center horizontally
    y: 20,  // Position from top with some padding
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,  // We'll add our own shadow
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false  // Allow loading local files
    }
  })

  recordButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  recordButton.setAlwaysOnTop(true, 'screen-saver', 1)  // Higher level
  recordButton.setIgnoreMouseEvents(false)
  
  return recordButton
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false, // Start hidden, show when recording stops
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

  mainWindow.loadURL(getAppURL())
  
  if (isDev) {
    mainWindow.webContents.openDevTools()
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
  
  // Mouse tracker will be initialized on demand when needed
  
  // DON'T create main window on startup - only floating button
  // Main window is created only when user wants to edit
  global.mainWindow = null
  
  // Create the floating record button (this is all that shows)
  const recordButton = createRecordButton()
  global.recordButton = recordButton
  
  // Load the record button UI
  recordButton.loadURL(getAppURL('/record-button'))
  
  // Show the record button immediately
  recordButton.once('ready-to-show', () => {
    recordButton.show()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      createRecordButton()
    }
  })
})

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(app.getPath('documents'), 'ScreenStudio Recordings')
const fs = require('fs')
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true })
}
global.recordingsDirectory = recordingsDir

// IPC handler to open workspace for editing
ipcMain.handle('open-workspace', () => {
  // Create main window if it doesn't exist
  if (!global.mainWindow) {
    global.mainWindow = createWindow()
    
    // Load the workspace
    global.mainWindow.loadURL(getAppURL())
    
    global.mainWindow.once('ready-to-show', () => {
      global.mainWindow.show()
      global.mainWindow.focus()
    })
  } else {
    // Just show existing window
    global.mainWindow.show()
    global.mainWindow.focus()
  }
})

// IPC handler to start recording
ipcMain.handle('start-recording', async () => {
  // Just return success - recording happens in renderer
  return { success: true, recordingsDir }
})

// IPC handler to stop recording and save
ipcMain.handle('stop-recording', async () => {
  // Recording is handled in renderer, we just manage the window
  return { success: true }
})

// IPC to get recordings directory
ipcMain.handle('get-recordings-directory', () => {
  return recordingsDir
})

// IPC to save recording to disk
ipcMain.handle('save-recording', async (event, filePath, buffer) => {
  try {
    const fs = require('fs').promises
    await fs.writeFile(filePath, Buffer.from(buffer))
    return { success: true, filePath }
  } catch (error) {
    console.error('Failed to save recording:', error)
    return { success: false, error: error.message }
  }
})

// IPC to minimize record button window
ipcMain.handle('minimize-record-button', () => {
  if (global.recordButton) {
    global.recordButton.hide()
  }
})

// IPC to show record button window
ipcMain.handle('show-record-button', () => {
  if (global.recordButton) {
    global.recordButton.show()
  }
})

// IPC handlers for countdown window
ipcMain.handle('show-countdown', async (event, number) => {
  // Always recreate window to ensure transparency
  if (countdownWindow) {
    countdownWindow.close()
    countdownWindow = null
  }
  countdownWindow = createCountdownWindow()
  
  // Send countdown number to the window
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box;
        }
        html, body {
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
        }
        .countdown {
          font-size: 400px;
          font-weight: 700;
          color: white;
          text-shadow: 
            0 0 80px rgba(0, 0, 0, 0.9),
            0 0 120px rgba(0, 0, 0, 0.7),
            0 10px 40px rgba(0, 0, 0, 0.8);
          animation: smoothPulse 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, opacity;
          transform-origin: center;
        }
        @keyframes smoothPulse {
          0% { 
            transform: scale(0.3); 
            opacity: 0;
          }
          50% { 
            transform: scale(1.05);
            opacity: 0.9;
          }
          100% { 
            transform: scale(1); 
            opacity: 1;
          }
        }
      </style>
    </head>
    <body>
      <div class="countdown">${number || ''}</div>
    </body>
    </html>
  `
  
  countdownWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  countdownWindow.show()
  
  return { success: true }
})

ipcMain.handle('hide-countdown', async () => {
  if (countdownWindow) {
    countdownWindow.hide()
    countdownWindow.close()
    countdownWindow = null
  }
  return { success: true }
})

// IPC to load all recordings
ipcMain.handle('load-recordings', async () => {
  try {
    const fs = require('fs').promises
    const files = await fs.readdir(recordingsDir)
    const recordings = files
      .filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
      .map(f => ({
        name: f,
        path: path.join(recordingsDir, f),
        timestamp: fs.statSync(path.join(recordingsDir, f)).mtime
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
    return recordings
  } catch (error) {
    console.error('Failed to load recordings:', error)
    return []
  }
})

// Enable Chrome logging for debugging
if (process.env.NODE_ENV === 'development') {
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
}

app.on('window-all-closed', () => {
  // Clean up mouse tracking
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval)
    mouseTrackingInterval = null
    isMouseTracking = false
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

// Monitor permission changes (for macOS)
let permissionCheckInterval = null
ipcMain.handle('start-permission-monitoring', async (event) => {
  if (process.platform !== 'darwin') return
  
  // Clear any existing interval
  if (permissionCheckInterval) {
    clearInterval(permissionCheckInterval)
  }
  
  // Check every 2 seconds for permission changes
  permissionCheckInterval = setInterval(() => {
    try {
      const status = systemPreferences.getMediaAccessStatus('screen')
      event.sender.send('permission-status-changed', { status, granted: status === 'granted' })
    } catch (error) {
      console.error('Error checking permission status:', error)
    }
  }, 2000)
  
  console.log('📊 Started monitoring screen recording permission')
})

ipcMain.handle('stop-permission-monitoring', async () => {
  if (permissionCheckInterval) {
    clearInterval(permissionCheckInterval)
    permissionCheckInterval = null
    console.log('🛑 Stopped monitoring screen recording permission')
  }
})

// Request screen recording permission - opens System Preferences directly
ipcMain.handle('request-screen-recording-permission', async () => {
  if (process.platform === 'darwin') {
    try {
      // Open System Preferences directly to Screen Recording section
      console.log('🔐 Opening System Preferences for screen recording permission')
      require('child_process').exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      
      // Return current status after opening preferences
      const status = systemPreferences.getMediaAccessStatus('screen')
      return { opened: true, status, granted: status === 'granted' }
    } catch (error) {
      console.error('❌ Error opening System Preferences:', error)
      return { opened: false, status: 'unknown', granted: false }
    }
  }
  return { opened: false, status: 'not-applicable', granted: true }
})

// Get user media stream for desktop capture
ipcMain.handle('get-desktop-stream', async (event, sourceId) => {
  try {
    console.log('🎥 Creating desktop stream for source:', sourceId)
    
    // Return the constraints that should be used with getUserMedia
    // The renderer will use these to create the stream
    return {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to create stream constraints:', error)
    throw error
  }
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

// Mouse tracking handlers using Electron's screen API
ipcMain.handle('start-mouse-tracking', async (event, options = {}) => {
  try {
    // Stop any existing tracking
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval)
    }

    // Validate and sanitize options
    if (typeof options !== 'object' || options === null) {
      options = {}
    }
    
    const intervalMs = Math.max(8, Math.min(1000, parseInt(options.intervalMs) || 16)) // 8ms to 1000ms range
    
    mouseEventSender = event.sender
    isMouseTracking = true
    
    // Track mouse position using Electron's screen API
    let lastPosition = null
    mouseTrackingInterval = setInterval(() => {
      if (!isMouseTracking || !mouseEventSender) return
      
      try {
        const currentPosition = screen.getCursorScreenPoint()
        
        // Send mouse move events
        if (!lastPosition || 
            lastPosition.x !== currentPosition.x || 
            lastPosition.y !== currentPosition.y) {
          
          mouseEventSender.send('mouse-move', {
            x: Math.round(currentPosition.x),
            y: Math.round(currentPosition.y),
            timestamp: Date.now()
          })
          
          lastPosition = currentPosition
        }
      } catch (error) {
        console.error('❌ Error tracking mouse:', error)
      }
    }, intervalMs)
    
    console.log(`🖱️ Mouse tracking started (interval: ${intervalMs}ms)`)
    
    return { 
      success: true, 
      nativeTracking: true,
      fps: Math.round(1000 / intervalMs)
    }
  } catch (error) {
    console.error('Error starting mouse tracking:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stop-mouse-tracking', async (event) => {
  try {
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval)
      mouseTrackingInterval = null
    }
    
    isMouseTracking = false
    mouseEventSender = null
    
    console.log('🖱️ Mouse tracking stopped')
    return { success: true }
  } catch (error) {
    console.error('Error stopping mouse tracking:', error)
    return { success: false, error: error.message }
  }
})

// Get current mouse position
ipcMain.handle('get-mouse-position', async () => {
  try {
    const position = screen.getCursorScreenPoint()
    return { 
      success: true, 
      position: {
        x: position.x,
        y: position.y
      }
    }
  } catch (error) {
    console.error('Error getting mouse position:', error)
    return { success: false, error: error.message }
  }
})

// Check if native tracking is available
ipcMain.handle('is-native-mouse-tracking-available', async () => {
  return {
    available: true, // Electron's screen API is always available
    tracker: true
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
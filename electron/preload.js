const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
console.log('🔧 Initializing Electron preload script...')

// Define the API object
const electronAPI = {
    // Desktop capture methods (for screen recording)
    getDesktopSources: (options) => {
      // Validate options structure
      if (!options || typeof options !== 'object') {
        return Promise.reject(new Error('Invalid options provided to getDesktopSources'))
      }
      return ipcRenderer.invoke('get-desktop-sources', options)
    },
    getSources: () => ipcRenderer.invoke('get-sources'), // Keep backward compatibility

    // Permission checking methods
    checkScreenRecordingPermission: () => ipcRenderer.invoke('check-screen-recording-permission'),
    requestScreenRecordingPermission: () => ipcRenderer.invoke('request-screen-recording-permission'),

    // Mouse tracking methods (for Screen Studio effects)
    startMouseTracking: (options) => {
      // Validate options if provided
      if (options && typeof options !== 'object') {
        return Promise.reject(new Error('Invalid options provided to startMouseTracking'))
      }
      return ipcRenderer.invoke('start-mouse-tracking', options)
    },
    stopMouseTracking: () => ipcRenderer.invoke('stop-mouse-tracking'),
    getMousePosition: () => ipcRenderer.invoke('get-mouse-position'),
    isNativeMouseTrackingAvailable: () => ipcRenderer.invoke('is-native-mouse-tracking-available'),
    onMouseMove: (callback) => {
      const wrappedCallback = (event, data) => {
        // Validate data structure and sanitize
        if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
          callback(event, data)
        }
      }
      ipcRenderer.on('mouse-move', wrappedCallback)
      return wrappedCallback
    },
    onMouseClick: (callback) => {
      const wrappedCallback = (event, data) => {
        // Validate data structure and sanitize
        if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
          callback(event, data)
        }
      }
      ipcRenderer.on('mouse-click', wrappedCallback)
      return wrappedCallback
    },
    removeMouseListener: (event, callback) => ipcRenderer.removeListener(event, callback),
    removeAllMouseListeners: () => {
      ipcRenderer.removeAllListeners('mouse-move')
      ipcRenderer.removeAllListeners('mouse-click')
    },

    // System information
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getScreens: () => ipcRenderer.invoke('get-screens'),

    // File dialogs
    showSaveDialog: (options) => {
      if (options && typeof options !== 'object') {
        return Promise.reject(new Error('Invalid options provided to showSaveDialog'))
      }
      return ipcRenderer.invoke('show-save-dialog', options)
    },
    showOpenDialog: (options) => {
      if (options && typeof options !== 'object') {
        return Promise.reject(new Error('Invalid options provided to showOpenDialog'))
      }
      return ipcRenderer.invoke('show-open-dialog', options)
    },

    // File operations
    saveFile: (data, filepath) => {
      if (!data) {
        return Promise.reject(new Error('Invalid data provided to saveFile'))
      }
      // filepath is optional - if not provided, will save to downloads folder
      return ipcRenderer.invoke('save-file', data, filepath)
    },
    openFile: (filename) => {
      if (typeof filename !== 'string' || filename.length === 0) {
        return Promise.reject(new Error('Invalid filename provided to openFile'))
      }
      return ipcRenderer.invoke('open-file', filename)
    },

    // App controls
    minimize: () => ipcRenderer.send('app-minimize'),
    maximize: () => ipcRenderer.send('app-maximize'),
    quit: () => ipcRenderer.send('app-quit'),

    // Screen recording events
    onRecordingStarted: (callback) => {
      const wrappedCallback = (event, data) => {
        // Validate recording event data
        if (data && typeof data === 'object') {
          callback(event, data)
        }
      }
      ipcRenderer.on('recording-started', wrappedCallback)
      return wrappedCallback
    },
    onRecordingStopped: (callback) => {
      const wrappedCallback = (event, data) => {
        // Validate recording event data
        if (data && typeof data === 'object') {
          callback(event, data)
        }
      }
      ipcRenderer.on('recording-stopped', wrappedCallback)
      return wrappedCallback
    },
    onRecordingError: (callback) => {
      const wrappedCallback = (event, error) => {
        // Validate error data
        if (error && (typeof error === 'string' || (typeof error === 'object' && error.message))) {
          callback(event, error)
        }
      }
      ipcRenderer.on('recording-error', wrappedCallback)
      return wrappedCallback
    },

    // Utility methods
    showMessageBox: (options) => {
      if (!options || typeof options !== 'object') {
        return Promise.reject(new Error('Invalid options provided to showMessageBox'))
      }
      return ipcRenderer.invoke('show-message-box', options)
    },

    // Remove listeners (with validation)
    removeAllListeners: (channel) => {
      // Validate channel name to prevent abuse
      const allowedChannels = [
        'mouse-move', 'mouse-click', 'recording-started',
        'recording-stopped', 'recording-error'
      ]
      if (typeof channel === 'string' && allowedChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  }
}

// Expose the API using contextBridge for security
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  console.log('✅ Electron API exposed successfully via contextBridge')
  console.log('🔧 Available methods:', Object.keys(electronAPI))
} catch (error) {
  console.error('❌ Failed to expose Electron API:', error)
  // Do not use fallback - maintain security
  throw new Error('Failed to initialize Electron API bridge')
}
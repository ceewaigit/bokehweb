import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

interface DesktopSource {
  id: string
  name: string
  display_id?: number
  thumbnail?: string
}

interface MousePosition {
  x: number
  y: number
  timestamp?: number
}

interface MouseTrackingOptions {
  intervalMs?: number
}

interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  buttons?: string[]
  defaultId?: number
  title?: string
  message: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  cancelId?: number
}

interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  message?: string
  nameFieldLabel?: string
  showsTagField?: boolean
}

interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory'>
  message?: string
}

const electronAPI = {
  // Desktop capture - properly use IPC with error handling
  getDesktopSources: async (options?: DesktopSourceOptions): Promise<DesktopSource[]> => {
    console.log('🎥 Preload: Requesting desktop sources via IPC')
    const sources = await ipcRenderer.invoke('get-desktop-sources', options)

    if (!sources || sources.length === 0) {
      throw new Error('No desktop sources available. Please check screen recording permissions.')
    }

    return sources
  },

  getDesktopStream: (sourceId: string, hasAudio: boolean) => {
    // Simple pass-through - let main process handle it
    return ipcRenderer.invoke('get-desktop-stream', sourceId, hasAudio)
  },

  getScreens: () => {
    return ipcRenderer.invoke('get-screens')
  },

  getSourceBounds: (sourceId: string) => {
    return ipcRenderer.invoke('get-source-bounds', sourceId)
  },

  // Permission checking
  checkScreenRecordingPermission: () =>
    ipcRenderer.invoke('check-screen-recording-permission'),

  requestScreenRecordingPermission: () =>
    ipcRenderer.invoke('request-screen-recording-permission'),

  startPermissionMonitoring: () =>
    ipcRenderer.invoke('start-permission-monitoring'),

  stopPermissionMonitoring: () =>
    ipcRenderer.invoke('stop-permission-monitoring'),

  onPermissionStatusChanged: (callback: (event: IpcRendererEvent, data: any) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      if (data && typeof data === 'object') {
        callback(event, data)
      }
    }
    ipcRenderer.on('permission-status-changed', wrappedCallback)
    return () => ipcRenderer.removeListener('permission-status-changed', wrappedCallback)
  },

  // Mouse tracking with type safety
  startMouseTracking: async (options?: MouseTrackingOptions) => {
    // Validate options
    if (options && typeof options !== 'object') {
      return Promise.reject(new Error('Invalid options provided to startMouseTracking'))
    }
    return ipcRenderer.invoke('start-mouse-tracking', options)
  },

  stopMouseTracking: () =>
    ipcRenderer.invoke('stop-mouse-tracking'),

  getMousePosition: (): Promise<MousePosition> =>
    ipcRenderer.invoke('get-mouse-position'),

  isNativeMouseTrackingAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('is-native-mouse-tracking-available'),

  onMouseMove: (callback: (event: IpcRendererEvent, position: MousePosition) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      // Validate data structure
      if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
        callback(event, data)
      }
    }
    ipcRenderer.on('mouse-move', wrappedCallback)
    return () => ipcRenderer.removeListener('mouse-move', wrappedCallback)
  },

  onMouseClick: (callback: (event: IpcRendererEvent, position: MousePosition) => void) => {
    const wrappedCallback = (event: IpcRendererEvent, data: any) => {
      // Validate data structure
      if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
        callback(event, data)
      }
    }
    ipcRenderer.on('mouse-click', wrappedCallback)
    return () => ipcRenderer.removeListener('mouse-click', wrappedCallback)
  },

  removeMouseListener: (event: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(event, callback)
  },

  removeAllMouseListeners: () => {
    ipcRenderer.removeAllListeners('mouse-move')
    ipcRenderer.removeAllListeners('mouse-click')
  },

  // System information
  getPlatform: (): Promise<NodeJS.Platform> =>
    ipcRenderer.invoke('get-platform'),

  // macOS wallpapers
  getMacOSWallpapers: (): Promise<{ wallpapers: any[], gradients: any[] }> =>
    ipcRenderer.invoke('get-macos-wallpapers'),

  loadWallpaperImage: (imagePath: string): Promise<string> =>
    ipcRenderer.invoke('load-wallpaper-image', imagePath),

  // Image selection for custom backgrounds
  selectImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-image-file'),

  loadImageAsDataUrl: (imagePath: string): Promise<string> =>
    ipcRenderer.invoke('load-image-as-data-url', imagePath),

  // Native screen area selection
  selectScreenArea: (): Promise<{
    success: boolean
    cancelled?: boolean
    area?: { x: number; y: number; width: number; height: number; displayId: number }
  }> => ipcRenderer.invoke('select-screen-area'),

  // Glassmorphism
  updateGlassmorphism: (settings: any) => ipcRenderer.invoke('update-glassmorphism', settings),

  // Recording and workspace control
  openWorkspace: () =>
    ipcRenderer.send('open-workspace'),

  startRecording: () =>
    ipcRenderer.invoke('start-recording'),

  stopRecording: () =>
    ipcRenderer.invoke('stop-recording'),

  minimizeRecordButton: () =>
    ipcRenderer.invoke('minimize-record-button'),

  showRecordButton: () =>
    ipcRenderer.invoke('show-record-button'),

  setWindowContentSize: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke('set-window-content-size', dimensions),

  // Dialog APIs
  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke('show-message-box', options),

  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),

  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),

  // Generic send method for IPC
  send: (channel: string, ...args: any[]) =>
    ipcRenderer.send(channel, ...args),

  // Countdown window
  showCountdown: (number: number) =>
    ipcRenderer.invoke('show-countdown', number),

  hideCountdown: () =>
    ipcRenderer.invoke('hide-countdown'),

  // File operations
  saveFile: (data: Buffer | ArrayBuffer, filepath: string) =>
    ipcRenderer.invoke('save-file', data, filepath),

  openFile: (filename: string) =>
    ipcRenderer.invoke('open-file', filename),

  // Recording file helpers
  getRecordingsDirectory: () =>
    ipcRenderer.invoke('get-recordings-directory'),

  saveRecording: (filePath: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('save-recording', filePath, buffer),

  loadRecordings: () =>
    ipcRenderer.invoke('load-recordings'),

  readLocalFile: (absolutePath: string) =>
    ipcRenderer.invoke('read-local-file', absolutePath),

  getFileSize: (filePath: string) =>
    ipcRenderer.invoke('get-file-size', filePath),

  // Get a URL that can be used to stream video files
  getVideoUrl: (filePath: string) =>
    ipcRenderer.invoke('get-video-url', filePath),

  // Recording events
  onRecordingStarted: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on('recording-started', callback)
    return () => ipcRenderer.removeListener('recording-started', callback)
  },

  onRecordingStopped: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on('recording-stopped', callback)
    return () => ipcRenderer.removeListener('recording-stopped', callback)
  },

  onRecordingError: (callback: (error: any) => void) => {
    const wrappedCallback = (_event: IpcRendererEvent, error: any) => callback(error)
    ipcRenderer.on('recording-error', wrappedCallback)
    return () => ipcRenderer.removeListener('recording-error', wrappedCallback)
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // Native recorder API (macOS 12.3+ with ScreenCaptureKit)
  nativeRecorder: {
    isAvailable: () => ipcRenderer.invoke('native-recorder:available'),
    startDisplay: (displayId: number) => ipcRenderer.invoke('native-recorder:start-display', displayId),
    stop: () => ipcRenderer.invoke('native-recorder:stop'),
    isRecording: () => ipcRenderer.invoke('native-recorder:is-recording'),
    readVideo: (filePath: string) => ipcRenderer.invoke('native-recorder:read-video', filePath)
  }
}

// Always expose the API using contextBridge for security
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
console.log('Electron API exposed via contextBridge')

// Export types for TypeScript support
export type ElectronAPI = typeof electronAPI
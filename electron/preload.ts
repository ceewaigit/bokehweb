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
  // Desktop capture - with proper constraint format
  getDesktopSources: async (options?: DesktopSourceOptions): Promise<DesktopSource[]> => {
    // WORKAROUND: Skip IPC entirely to avoid Electron bug
    // Return hardcoded screen source that will work with getUserMedia
    console.log('🎥 Preload: Returning hardcoded screen source to avoid IPC bug')

    // Just return a basic screen source - the actual capture happens via getUserMedia
    return Promise.resolve([{
      id: 'screen:1:0',
      name: 'Entire screen',
      display_id: 1
    }])
  },

  getDesktopStream: (sourceId: string, hasAudio: boolean) => {
    // Simple pass-through - let main process handle it
    return ipcRenderer.invoke('get-desktop-stream', sourceId, hasAudio)
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

  getScreens: () =>
    ipcRenderer.invoke('get-screens'),

  // Recording and workspace control
  openWorkspace: () =>
    ipcRenderer.invoke('open-workspace'),

  startRecording: () =>
    ipcRenderer.invoke('start-recording'),

  stopRecording: () =>
    ipcRenderer.invoke('stop-recording'),

  minimizeRecordButton: () =>
    ipcRenderer.invoke('minimize-record-button'),

  showRecordButton: () =>
    ipcRenderer.invoke('show-record-button'),

  // Dialog APIs
  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke('show-message-box', options),

  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),

  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),

  // Window controls
  minimize: () =>
    ipcRenderer.send('minimize'),

  maximize: () =>
    ipcRenderer.send('maximize'),

  quit: () =>
    ipcRenderer.send('quit'),

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
  }
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Export types for TypeScript support
export type ElectronAPI = typeof electronAPI
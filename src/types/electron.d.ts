export interface ElectronAPI {
  // Desktop capture
  getDesktopSources: (options: any) => Promise<any[]>
  getDesktopStream?: (sourceId: string, hasAudio?: boolean) => Promise<any>
  getScreens?: () => Promise<Array<{
    id: number
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    rotation: number
    internal: boolean
  }>>

  // Permission checking
  checkScreenRecordingPermission: () => Promise<{ status: string; granted: boolean }>
  requestScreenRecordingPermission: () => Promise<{ opened: boolean; status: string; granted: boolean }>
  startPermissionMonitoring?: () => Promise<void>
  stopPermissionMonitoring?: () => Promise<void>
  onPermissionStatusChanged?: (callback: (event: any, data: { status: string; granted: boolean }) => void) => () => void

  // Mouse tracking
  startMouseTracking: (options: any) => Promise<any>
  stopMouseTracking: () => Promise<any>
  isNativeMouseTrackingAvailable: () => Promise<{ available: boolean; tracker: boolean }>
  onMouseMove: (callback: any) => () => void
  onMouseClick: (callback: any) => () => void
  onScroll?: (callback: any) => () => void
  removeAllMouseListeners: () => void

  // Recording and workspace control
  openWorkspace?: () => Promise<void>
  startRecording?: () => Promise<any>
  stopRecording?: () => Promise<any>
  getRecordingsDirectory?: () => Promise<string>
  saveRecording?: (filePath: string, buffer: ArrayBuffer) => Promise<any>
  loadRecordings?: () => Promise<Array<{
    name: string
    path: string
    timestamp: string | Date
    size?: number
    videoSize?: number
  }>>
  readLocalFile?: (absolutePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  getFileSize?: (filePath: string) => Promise<{ success: boolean; size?: number; error?: string }>
  onToggleRecording?: (callback: () => void) => void

  // Dialog APIs
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  showMessageBox: (options: any) => Promise<{ response: number; checkboxChecked: boolean }>

  // File operations
  saveFile: (data: any, filepath?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openFile: (filename: string) => Promise<{ success: boolean; data?: any; error?: string }>

  // IPC communication
  send: (channel: string, ...args: any[]) => void

  // Platform-specific features
  getPlatform?: () => Promise<{ platform: string; arch: string; version: string }>
  getMacOSWallpapers?: () => Promise<{
    wallpapers: Array<{ name: string; path: string; thumbnail?: string }>
    gradients: Array<{ name: string; path: string; colors: string[] }>
  }>

  // Window controls
  minimize: () => void
  maximize: () => void
  quit: () => void
  minimizeRecordButton?: () => void
  showRecordButton?: () => void
  setWindowContentSize?: (dimensions: { width: number; height: number }) => Promise<{ success: boolean }>

  // Countdown window methods
  showCountdown?: (number: number) => Promise<{ success: boolean }>
  hideCountdown?: () => Promise<{ success: boolean }>

  // Recording events
  onRecordingStarted: (callback: () => void) => () => void
  onRecordingStopped: (callback: () => void) => () => void
  onRecordingError: (callback: (error: string) => void) => () => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export { }
export interface ElectronAPI {
  // Desktop capture
  getDesktopSources: (options: any) => Promise<Array<{
    id: string
    name: string
    display_id?: number
    thumbnail?: string
    displayInfo?: {
      id: number
      isPrimary: boolean
      isInternal: boolean
      bounds: { x: number; y: number; width: number; height: number }
      workArea: { x: number; y: number; width: number; height: number }
      scaleFactor: number
    }
  }>>
  getDesktopStream?: (sourceId: string, hasAudio?: boolean) => Promise<any>
  getScreens?: () => Promise<Array<{
    id: number
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    rotation: number
    internal: boolean
  }>>
  getSourceBounds?: (sourceId: string) => Promise<{ x: number; y: number; width: number; height: number } | null>

  // Permission checking
  checkScreenRecordingPermission: () => Promise<{ status: string; granted: boolean }>
  requestScreenRecordingPermission: () => Promise<{ opened: boolean; status: string; granted: boolean }>
  checkMicrophonePermission: () => Promise<{ status: string; granted: boolean }>
  requestMicrophonePermission: () => Promise<{ status: string; granted: boolean }>
  setMockPermissions: (permissions: { screen?: boolean; microphone?: boolean }) => Promise<void>
  startPermissionMonitoring?: () => Promise<void>
  stopPermissionMonitoring?: () => Promise<void>
  onPermissionStatusChanged?: (callback: (event: any, data: {
    screen: { status: string; granted: boolean };
    microphone: { status: string; granted: boolean };
  } | { status: string; granted: boolean }) => void) => () => void

  // Mouse tracking
  startMouseTracking: (options: any) => Promise<any>
  stopMouseTracking: () => Promise<any>
  isNativeMouseTrackingAvailable: () => Promise<{ available: boolean; tracker: boolean }>
  onMouseMove: (callback: any) => () => void
  onMouseClick: (callback: any) => () => void
  onScroll?: (callback: any) => () => void
  removeAllMouseListeners: () => void

  // Keyboard tracking
  startKeyboardTracking?: () => Promise<any>
  stopKeyboardTracking?: () => Promise<any>
  onKeyboardEvent?: (callback: any) => () => void

  // Recording and workspace control
  openWorkspace?: () => Promise<void>
  startRecording?: () => Promise<any>
  stopRecording?: () => Promise<any>
  getRecordingsDirectory?: () => Promise<string>
  resolveRecordingPath?: (filePath: string, folderPath?: string) => Promise<string>
  saveRecording?: (filePath: string, buffer: ArrayBuffer) => Promise<any>
  loadRecordings?: () => Promise<Array<{
    name: string
    path: string
    timestamp: string | Date
    size?: number
  }>>
  readLocalFile?: (absolutePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  getFileSize?: (filePath: string) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  getVideoUrl?: (filePath: string) => Promise<string | null>
  onToggleRecording?: (callback: () => void) => void

  // Streaming recording handlers
  createTempRecordingFile?: (extension?: string) => Promise<{ success: boolean; data?: string; error?: string }>
  appendToRecording?: (filePath: string, chunk: ArrayBuffer | Blob) => Promise<{ success: boolean; error?: string }>
  finalizeRecording?: (filePath: string) => Promise<{ success: boolean; error?: string }>
  createMetadataFile?: () => Promise<{ success: boolean; data?: string; error?: string }>
  appendMetadata?: (filePath: string, metadata: any[]) => Promise<{ success: boolean; error?: string }>
  appendMetadataBatch?: (filePath: string, metadata: any[], isLast?: boolean) => Promise<{ success: boolean; error?: string }>
  readMetadata?: (filePath: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
  readMetadataFile?: (filePath: string) => Promise<{ success: boolean; data?: any[]; error?: string }>

  // File operations
  moveFile?: (source: string, destination: string) => Promise<{ success: boolean; error?: string }>

  // Dialog APIs
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  showMessageBox: (options: any) => Promise<{ response: number; checkboxChecked: boolean }>

  // File operations
  saveFile: (data: any, filepath?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openFile: (filename: string) => Promise<{ success: boolean; data?: any; error?: string }>
  openPath?: (path: string) => Promise<void>

  // IPC communication
  send: (channel: string, ...args: any[]) => void
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }

  // Platform-specific features
  getPlatform?: () => Promise<{ platform: string; arch: string; version: string }>
  getMacOSWallpapers?: () => Promise<{
    wallpapers: Array<{ name: string; path: string; thumbnail?: string }>
    gradients: Array<{ name: string; path: string; colors: string[] }>
  }>
  loadWallpaperImage?: (imagePath: string) => Promise<string>
  selectImageFile?: () => Promise<string | null>
  loadImageAsDataUrl?: (imagePath: string) => Promise<string>
  selectScreenArea?: () => Promise<{
    success: boolean
    cancelled?: boolean
    area?: { x: number; y: number; width: number; height: number; displayId: number }
  }>

  // Window controls
  minimize: () => void
  maximize: () => void
  quit: () => void
  minimizeRecordButton?: () => void
  showRecordButton?: () => void
  openWorkspace?: () => void
  setWindowContentSize?: (dimensions: { width: number; height: number }) => Promise<{ success: boolean }>

  // Countdown window methods
  showCountdown?: (number: number, displayId?: number) => Promise<{ success: boolean }>
  hideCountdown?: () => Promise<{ success: boolean }>

  // Monitor overlay methods
  showMonitorOverlay?: (displayId?: number) => Promise<{ success: boolean }>
  hideMonitorOverlay?: () => Promise<{ success: boolean }>
  showWindowOverlay?: (windowId: string) => Promise<{ success: boolean }>

  // Recording events
  onRecordingStarted: (callback: () => void) => () => void
  onRecordingStopped: (callback: () => void) => () => void
  onRecordingError: (callback: (error: string) => void) => () => void
  removeAllListeners: (channel: string) => void

  // Native recorder API (macOS 12.3+ with ScreenCaptureKit)
  nativeRecorder?: {
    isAvailable: () => Promise<boolean>
    startDisplay: (displayId: number) => Promise<{ outputPath: string }>
    stop: () => Promise<{ outputPath: string }>
    isRecording: () => Promise<boolean>
    readVideo: (filePath: string) => Promise<ArrayBuffer>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export { }
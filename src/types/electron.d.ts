export interface ElectronAPI {
  // Desktop capture
  getDesktopSources: (options: any) => Promise<any[]>
  getDesktopStream?: (sourceId: string) => Promise<any>
  getSources?: () => Promise<Electron.DesktopCapturerSource[]>
  
  // Permission checking
  checkScreenRecordingPermission: () => Promise<{ status: string; granted: boolean }>
  requestScreenRecordingPermission: () => Promise<{ opened: boolean; status: string; granted: boolean }>
  startPermissionMonitoring?: () => Promise<void>
  stopPermissionMonitoring?: () => Promise<void>
  onPermissionStatusChanged?: (callback: (event: any, data: { status: string; granted: boolean }) => void) => void
  
  // Mouse tracking
  startMouseTracking: (options: any) => Promise<any>
  stopMouseTracking: () => Promise<any>
  isNativeMouseTrackingAvailable: () => Promise<{ available: boolean; tracker: boolean }>
  onMouseMove: (callback: any) => void
  onMouseClick: (callback: any) => void
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
  }>>
  onToggleRecording?: (callback: () => void) => void
  
  // Dialog APIs
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  showMessageBox: (options: any) => Promise<{ response: number; checkboxChecked: boolean }>
  
  // File operations
  saveFile: (data: any, filepath?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openFile: (filename: string) => Promise<{ success: boolean; data?: any; error?: string }>
  
  // Window controls
  minimize: () => void
  maximize: () => void
  quit: () => void
  minimizeRecordButton?: () => void
  
  // Recording events
  onRecordingStarted: (callback: () => void) => void
  onRecordingStopped: (callback: () => void) => void
  onRecordingError: (callback: (error: string) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
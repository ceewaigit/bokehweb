/**
 * Recording System
 * Screen recording, media management, and recording utilities
 */

export { ElectronRecorder } from './electron-recorder'
export { ElectronRecorder as ScreenRecorder } from './electron-recorder' // Alias for compatibility
export type { 
  ElectronRecordingResult as RecordingResult,
  ElectronMetadata as RecordingMetadata,
  EnhancementSettings 
} from './electron-recorder'
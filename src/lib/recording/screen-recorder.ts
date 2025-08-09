/**
 * Simplified ScreenRecorder - Direct alias to ElectronRecorder
 * All recording goes through Electron's native desktop capture API
 */

import type { RecordingSettings } from '@/types'
import { ElectronRecorder, type ElectronRecordingResult, type ElectronMetadata } from './electron-recorder'
import { logger } from '@/lib/utils/logger'

// Re-export types for backward compatibility
export type RecordingResult = ElectronRecordingResult & {
  enhancedVideo?: Blob
}

export type RecordingMetadata = ElectronMetadata & {
  scrollX?: number
  scrollY?: number
  windowWidth?: number
  windowHeight?: number
  data?: any
}

export interface EnhancementSettings {
  enableAutoZoom: boolean
  zoomSensitivity: number
  maxZoom: number
  zoomSpeed: number
  showCursor: boolean
  cursorSize: number
  cursorColor: string
  showClickEffects: boolean
  clickEffectSize: number
  clickEffectColor: string
  enableSmartPanning: boolean
  panSpeed: number
  motionSensitivity: number
  enableSmoothAnimations: boolean
}

export interface MotionData {
  zoomKeyframes: any[]
  isTracking: boolean
}

/**
 * ScreenRecorder class - Simplified wrapper around ElectronRecorder
 * Maintains backward compatibility while using single recording implementation
 */
export class ScreenRecorder {
  private electronRecorder: ElectronRecorder

  constructor() {
    this.electronRecorder = new ElectronRecorder()
    logger.debug('ScreenRecorder initialized with ElectronRecorder backend')
  }

  async startRecording(
    recordingSettings: RecordingSettings,
    enhancementSettings?: EnhancementSettings
  ): Promise<void> {
    logger.info('Starting recording via ScreenRecorder -> ElectronRecorder')
    return this.electronRecorder.startRecording(recordingSettings, enhancementSettings)
  }

  async stopRecording(): Promise<RecordingResult | null> {
    logger.info('Stopping recording via ScreenRecorder -> ElectronRecorder')
    const result = await this.electronRecorder.stopRecording()

    if (!result) return null

    // Convert ElectronRecordingResult to RecordingResult for backward compatibility
    return {
      ...result,
      metadata: result.metadata as RecordingMetadata[]
    }
  }

  pauseRecording(): void {
    // MediaRecorder pause is not exposed; this is a no-op in current ElectronRecorder
  }

  resumeRecording(): void {
    // MediaRecorder resume is not exposed; this is a no-op in current ElectronRecorder
  }

  isRecording(): boolean {
    return this.electronRecorder.isCurrentlyRecording()
  }

  getState(): 'idle' | 'recording' | 'paused' {
    return this.electronRecorder.isCurrentlyRecording() ? 'recording' : 'idle'
  }

  getDuration(): number {
    // Duration is tracked in useRecording store; return 0 here
    return 0
  }
}
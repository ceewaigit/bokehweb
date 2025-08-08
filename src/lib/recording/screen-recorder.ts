import type { RecordingSettings } from '@/types'
import { ElectronRecorder } from './electron-recorder'
import { logger } from '@/lib/utils/logger'
import { RecordingError, ElectronError } from '@/lib/core/errors'

export interface RecordingResult {
  video: Blob
  enhancedVideo?: Blob
  metadata: RecordingMetadata[]
  duration: number
  effectsApplied?: string[]
  processingTime?: number
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

export interface RecordingMetadata {
  timestamp: number
  mouseX: number
  mouseY: number
  scrollX: number
  scrollY: number
  windowWidth: number
  windowHeight: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  data?: any
}

/**
 * Simplified ScreenRecorder that only uses ElectronRecorder
 * Browser fallback removed for cleaner architecture
 */
export class ScreenRecorder {
  private electronRecorder = new ElectronRecorder()
  private _isRecording = false
  private enhancementSettings: EnhancementSettings | null = null

  constructor() {
    logger.debug('ScreenRecorder created')
  }

  async startRecording(settings?: RecordingSettings, sourceId?: string): Promise<void> {
    if (this._isRecording) {
      logger.warn('Already recording')
      throw new RecordingError('Already recording')
    }

    const recordingSettings: RecordingSettings = settings || {
      area: 'fullscreen',
      audioInput: 'system',
      quality: 'high',
      framerate: 30,
      format: 'webm'
    }

    try {
      logger.info('Starting recording with ElectronRecorder')
      
      // Always use ElectronRecorder - this is an Electron app
      await this.electronRecorder.startRecording(recordingSettings, this.enhancementSettings || undefined)
      this._isRecording = true

      this.dispatchEvent('recording-started', { startTime: Date.now() })
      logger.info('Recording started successfully')

    } catch (error) {
      logger.error('Failed to start recording:', error)
      this.cleanup()
      throw error
    }
  }

  async stopRecording(): Promise<RecordingResult | null> {
    if (!this._isRecording) {
      logger.warn('Not recording')
      return null
    }

    try {
      logger.info('Stopping recording')

      const electronResult = await this.electronRecorder.stopRecording()

      // Convert metadata to our expected format
      const convertedMetadata: RecordingMetadata[] = electronResult.metadata.map(meta => ({
        timestamp: meta.timestamp,
        mouseX: meta.mouseX,
        mouseY: meta.mouseY,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1920,
        windowHeight: 1080,
        eventType: meta.eventType as 'mouse' | 'click' | 'scroll' | 'key',
        data: meta.key ? { key: meta.key } : undefined
      }))

      const finalResult: RecordingResult = {
        video: electronResult.video,
        enhancedVideo: electronResult.video,
        metadata: convertedMetadata,
        duration: electronResult.duration,
        effectsApplied: electronResult.effectsApplied,
        processingTime: electronResult.processingTime
      }

      this._isRecording = false
      logger.info(`Recording complete: ${finalResult.duration}ms`)

      this.dispatchEvent('recording-stopped', finalResult)
      return finalResult

    } catch (error) {
      logger.error('Failed to stop recording:', error)
      this._isRecording = false
      throw error
    }
  }

  pauseRecording(): void {
    logger.debug('Pause not implemented for Electron recording')
  }

  resumeRecording(): void {
    logger.debug('Resume not implemented for Electron recording')
  }

  // Enhancement methods
  enableEnhancements(settings: EnhancementSettings): void {
    this.enhancementSettings = settings
    logger.debug('Enhancements enabled')
  }

  disableEnhancements(): void {
    this.enhancementSettings = null
    logger.debug('Enhancements disabled')
  }

  getEnhancementSettings(): EnhancementSettings | null {
    return this.enhancementSettings
  }

  getMotionData(): MotionData | null {
    if (this.enhancementSettings?.enableAutoZoom) {
      return {
        zoomKeyframes: [],
        isTracking: true
      }
    }
    return null
  }

  // Helper methods
  isRecording(): boolean {
    return this._isRecording
  }

  async getAvailableSources(): Promise<Array<{ id: string, name: string, type: string }>> {
    return this.electronRecorder.getAvailableSources()
  }

  private cleanup(): void {
    this._isRecording = false
  }

  private dispatchEvent(eventName: string, detail: any): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
    }
  }

  // Compatibility method for tests
  async stopRecordingCompat(): Promise<{ enhanced: Blob; original: Blob } | null> {
    const result = await this.stopRecording()
    if (result) {
      return {
        enhanced: result.enhancedVideo || result.video,
        original: result.video
      }
    }
    return null
  }

  // Static compatibility methods
  static async getAvailableSources(): Promise<Array<{ id: string, name: string, type: string }>> {
    const recorder = new ElectronRecorder()
    return recorder.getAvailableSources()
  }

  static isSupported(): boolean {
    // Check if we're in Electron environment
    return typeof window !== 'undefined' && 
           typeof window.electronAPI === 'object' && 
           window.electronAPI !== null
  }
}

// Export types for backward compatibility
export type { RecordingSource } from './stream-manager'
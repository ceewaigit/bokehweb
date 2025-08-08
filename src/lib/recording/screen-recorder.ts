"use client"

import type { RecordingSettings } from '@/types'
import { MediaRecorderManager, type MediaRecorderResult } from './media-recorder-manager'
import { MetadataCollector, type RecordingMetadata } from './metadata-collector'
import { StreamManager, type RecordingSource } from './stream-manager'
import { EffectsProcessor, type EffectsResult } from './effects-processor'
import { HardwareEffectsProcessor } from './hardware-effects-processor'
import { ElectronRecorder, type ElectronRecordingResult } from './electron-recorder'

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

export class ScreenRecorder {
  private streamManager = new StreamManager()
  private mediaRecorderManager: MediaRecorderManager | null = null
  private metadataCollector = new MetadataCollector()
  private effectsProcessor = new EffectsProcessor()
  private hardwareEffectsProcessor = new HardwareEffectsProcessor()
  private electronRecorder = new ElectronRecorder()
  private _isRecording = false
  private instanceId = Math.random().toString(36).substr(2, 9)
  private enhancementSettings: EnhancementSettings | null = null
  private get useElectronRecording(): boolean {
    // Check if we're in Electron environment
    const hasWindow = typeof window !== 'undefined'
    const hasElectronAPI = hasWindow && typeof window.electronAPI === 'object' && window.electronAPI !== null
    const hasDesktopSources = hasElectronAPI && typeof window.electronAPI?.getDesktopSources === 'function'
    
    // Additional check for Electron process
    const isElectronProcess = typeof process !== 'undefined' && process.versions && 'electron' in process.versions
    
    const result = hasWindow && hasElectronAPI && hasDesktopSources

    console.log('🔍 ScreenRecorder Electron detection:', {
      hasWindow,
      hasElectronAPI,
      hasDesktopSources,
      isElectronProcess,
      result,
      electronAPIKeys: hasElectronAPI && window.electronAPI ? Object.keys(window.electronAPI) : 'N/A'
    })

    if (isElectronProcess && !result) {
      console.error('❌ Running in Electron but electronAPI not available!')
      console.error('Check that preload script is properly configured')
    }

    return result
  }

  constructor() {
    console.log(`🔧 ScreenRecorder[${this.instanceId}] created`)
  }

  async startRecording(settings?: RecordingSettings, sourceId?: string): Promise<void> {
    if (this._isRecording) {
      console.log('⚠️ Already recording')
      throw new Error('Already recording')
    }

    const recordingSettings: RecordingSettings = settings || {
      area: 'fullscreen',
      audioInput: 'system',
      quality: 'high',
      framerate: 30,
      format: 'webm'
    }

    try {
      // Check if we should use Electron recording
      if (this.useElectronRecording) {
        console.log('🖥️ Using ElectronRecorder for system-wide recording')
        
        // Use ElectronRecorder for true system recording
        await this.electronRecorder.startRecording(recordingSettings, this.enhancementSettings || undefined)
        this._isRecording = true
        
        this.dispatchEvent('recording-started', { startTime: Date.now() })
        console.log('✅ Electron recording started successfully')
        
      } else {
        console.log('🌐 Using browser-based recording (Electron API not available)')
        
        // Fallback to browser recording
        const stream = await this.streamManager.getDisplayStream(recordingSettings, sourceId)
        console.log('✅ Display stream acquired:', {
          streamId: stream.id,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
          active: stream.active
        })

        // Setup MediaRecorder
        this.mediaRecorderManager = new MediaRecorderManager(stream)
        await this.mediaRecorderManager.start(recordingSettings)
        console.log('✅ MediaRecorder started')

        // Start metadata collection
        this.metadataCollector.start()
        console.log('✅ Metadata collection started')

        this._isRecording = true

        // Handle stream end
        window.addEventListener('stream-ended', () => {
          this.stopRecording()
        }, { once: true })

        this.dispatchEvent('recording-started', { startTime: Date.now() })
      }

    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      this.cleanup()

      // Handle specific error types for test compatibility
      if (error instanceof Error) {
        if (error.message.includes('Permission denied') || error.message.includes('permission denied')) {
          throw new Error('Failed to start recording: Error: Screen recording permission denied')
        }
        throw new Error(`Failed to start recording: ${error}`)
      }
      throw error
    }
  }

  async stopRecording(): Promise<RecordingResult | null> {
    if (!this._isRecording) {
      console.log('⚠️ Not recording')
      return null
    }

    try {
      console.log('🛑 Stopping recording...')

      // Handle Electron recording first
      if (this.electronRecorder.isCurrentlyRecording()) {
        console.log('🛑 Stopping Electron recording...')

        const electronResult = await this.electronRecorder.stopRecording()

        // Apply hardware-accelerated effects if needed
        let enhancedVideo = electronResult.video
        let effectsApplied = electronResult.effectsApplied
        let processingTime = 0

        if (this.enhancementSettings && electronResult.metadata.length > 0) {
          try {
            console.log('🎬 Applying hardware-accelerated effects to Electron recording...')
            const hardwareResult = await this.hardwareEffectsProcessor.processVideoWithEffects(
              electronResult.video,
              electronResult.metadata,
              this.enhancementSettings,
              electronResult.duration
            )

            enhancedVideo = hardwareResult.enhancedVideo
            effectsApplied = [...electronResult.effectsApplied, ...hardwareResult.effectsApplied]
            processingTime = hardwareResult.processingTime

            console.log(`✨ Hardware effects applied: ${hardwareResult.effectsApplied.join(', ')} (${processingTime.toFixed(2)}ms)`)
          } catch (error) {
            console.error('⚠️ Hardware effects processing failed, using original video:', error)
            effectsApplied.push('hardware-effects-failed')
          }
        }

        // Convert metadata to our expected format
        const convertedMetadata: RecordingMetadata[] = electronResult.metadata.map(meta => ({
          timestamp: meta.timestamp,
          mouseX: meta.mouseX,
          mouseY: meta.mouseY,
          scrollX: 0, // Default values for browser compatibility
          scrollY: 0,
          windowWidth: 1920, // Default screen dimensions
          windowHeight: 1080,
          eventType: meta.eventType as 'mouse' | 'click' | 'scroll' | 'key',
          data: meta.key ? { key: meta.key } : undefined
        }))

        // Convert to our expected format
        const finalResult: RecordingResult = {
          video: electronResult.video,
          enhancedVideo,
          metadata: convertedMetadata,
          duration: electronResult.duration,
          effectsApplied,
          processingTime
        }

        this._isRecording = false
        console.log(`✅ Electron recording complete: ${finalResult.duration}ms, effects: ${finalResult.effectsApplied?.join(', ') || 'none'}`)

        this.dispatchEvent('recording-stopped', finalResult)
        return finalResult
      }


      // Handle standard recording (fallback)
      if (!this.mediaRecorderManager) {
        console.log('⚠️ No media recorder available')
        return null
      }

      // Stop metadata collection
      const metadata = this.metadataCollector.stop()
      console.log(`📊 Collected ${metadata.length} metadata events`)

      // Stop MediaRecorder
      const result = await this.mediaRecorderManager.stop()
      console.log(`📹 Recording stopped: ${result.duration}ms, ${result.video.size} bytes`)

      // Apply effects if enhancement settings are enabled
      let enhancedVideo: Blob | undefined
      let effectsApplied: string[] | undefined
      let processingTime: number | undefined

      if (this.enhancementSettings && metadata.length > 0) {
        try {
          console.log('🎨 Applying Screen Studio effects...')

          // Add a timeout for effects processing
          const effectsPromise = this.effectsProcessor.processVideo(
            result.video,
            metadata,
            this.enhancementSettings,
            result.duration // Pass estimated duration from recording
          )

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Effects processing timeout')), 60000) // 60 second timeout
          })

          const effectsResult = await Promise.race([effectsPromise, timeoutPromise]) as any

          if (effectsResult && effectsResult.enhancedVideo) {
            enhancedVideo = effectsResult.enhancedVideo
            effectsApplied = effectsResult.effectsApplied
            processingTime = effectsResult.processingTime

            console.log(`✨ Effects applied: ${effectsApplied?.join(', ') || 'none'} (${processingTime?.toFixed(2) || 0}ms)`)
          } else {
            console.log('⚠️ Effects processing returned invalid result, using original video')
            effectsApplied = ['effects-invalid-result']
            processingTime = 0
          }
        } catch (error) {
          console.error('⚠️ Effects processing failed, using original video:', error)
          // Continue with original video
          enhancedVideo = undefined
          effectsApplied = ['effects-failed']
          processingTime = 0
        }
      } else {
        console.log('ℹ️ No enhancement settings or metadata - using original video')
      }

      // Cleanup
      this.cleanup()

      const finalResult: RecordingResult = {
        video: result.video,
        enhancedVideo,
        metadata,
        duration: result.duration,
        effectsApplied,
        processingTime
      }

      this.dispatchEvent('recording-stopped', finalResult)
      return finalResult

    } catch (error) {
      console.error('❌ Failed to stop recording:', error)
      this.cleanup()
      return null
    }
  }

  cleanup(): void {
    this._isRecording = false
    this.streamManager.stopStream()
    this.mediaRecorderManager = null
    this.effectsProcessor.dispose()
    this.hardwareEffectsProcessor.dispose()
    this.enhancementSettings = null
    console.log(`🧹 ScreenRecorder[${this.instanceId}] cleaned up`)
  }

  private dispatchEvent(name: string, detail?: any): void {
    window.dispatchEvent(new CustomEvent(`screen-recorder-${name}`, { detail }))
  }

  isRecording(): boolean {
    return this._isRecording
  }

  getRecordingDurationMs(): number {
    return this.mediaRecorderManager?.getDuration() || 0
  }

  getRecordingDuration(): number {
    return this.getRecordingDurationMs() / 1000 // Convert to seconds for compatibility
  }

  // Backward compatibility methods for tests
  getRecordingState(): { isRecording: boolean; isPaused: boolean; duration: number } {
    return {
      isRecording: this._isRecording,
      isPaused: this.mediaRecorderManager?.isPaused() || false,
      duration: this.getRecordingDurationMs() / 1000 // Convert to seconds for compatibility
    }
  }

  pauseRecording(): void {
    if (this.mediaRecorderManager && this._isRecording) {
      this.mediaRecorderManager.pause()
    }
  }

  resumeRecording(): void {
    if (this.mediaRecorderManager && this._isRecording) {
      this.mediaRecorderManager.resume()
    }
  }

  // Compatibility method that returns result in old format for tests
  async stopRecordingCompat(): Promise<{ enhanced: Blob; original: Blob } | null> {
    const result = await this.stopRecording()
    if (result) {
      return {
        enhanced: result.enhancedVideo || result.video, // Use enhanced video if available
        original: result.video
      }
    }
    return null
  }

  // Enhancement methods (simplified stubs for compatibility)
  enableEnhancements(settings: EnhancementSettings): void {
    this.enhancementSettings = settings
    console.log('📈 Enhancements enabled (simplified mode)')
  }

  // Expose effects processor for progress callbacks
  getEffectsProcessor() {
    return this.effectsProcessor
  }

  disableEnhancements(): void {
    this.enhancementSettings = null
    console.log('📉 Enhancements disabled')
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

  // Simplified method for getting available sources
  getAvailableSources(): Promise<RecordingSource[]> {
    return ScreenRecorder.getAvailableSources()
  }

  // Static methods
  static getAvailableSources(): Promise<RecordingSource[]> {
    return StreamManager.getAvailableSources()
  }

  static isSupported(): boolean {
    return StreamManager.isSupported()
  }
}

// Export all types
export type { RecordingSource, RecordingMetadata }
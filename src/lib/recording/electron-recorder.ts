/**
 * Electron-based screen recorder using desktopCapturer
 * Thin wrapper around MediaRecorder with IPC coordination
 */

import type { RecordingSettings } from '@/types'
import type { ElectronRecordingResult, ElectronMetadata } from '@/types/recording'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/core/errors'

export class ElectronRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startTime = 0
  private metadata: ElectronMetadata[] = []
  private captureArea: ElectronRecordingResult['captureArea'] = undefined
  private captureWidth = 0
  private captureHeight = 0
  private dataRequestInterval: NodeJS.Timeout | null = null
  private isRecording = false

  constructor() {
    logger.debug('ElectronRecorder initialized')
  }

  async startRecording(recordingSettings: RecordingSettings): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording')
    }

    logger.info('Starting Electron-based screen recording')

    try {
      // Check if running in Electron
      if (!window.electronAPI?.getDesktopSources) {
        throw new ElectronError('Electron API not available', 'getDesktopSources')
      }

      // Get screen sources from main process
      const sources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      })

      if (!sources || sources.length === 0) {
        throw new PermissionError('No screen sources available. Please check permissions.', 'screen')
      }

      // Select the appropriate source
      let primarySource = sources.find(s => s.id === recordingSettings.sourceId)

      if (!primarySource) {
        // Auto-select screen for fullscreen/region recording
        if (recordingSettings.area !== 'window') {
          primarySource = sources.find(s => s.id.startsWith('screen:'))
        }

        if (!primarySource) {
          throw new Error('No suitable recording source found')
        }
      }

      logger.info(`Using source: ${primarySource.name} (${primarySource.id})`)

      // Get source bounds from main process
      if (window.electronAPI?.getSourceBounds) {
        const bounds = await window.electronAPI.getSourceBounds(primarySource.id)
        if (bounds) {
          this.captureArea = {
            fullBounds: bounds,
            workArea: bounds,
            scaleFactor: 1,
            sourceType: primarySource.id.startsWith('screen:') ? 'screen' : 'window',
            sourceId: primarySource.id
          }
          // Store capture dimensions for consistent use throughout recording
          this.captureWidth = bounds.width
          this.captureHeight = bounds.height
        }
      }

      // Get media stream constraints
      const hasAudio = recordingSettings.audioInput !== 'none'
      const constraints: any = {
        audio: hasAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primarySource.id
          }
        } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primarySource.id
          },
          // Apply cursor constraint at the correct level
          cursor: 'never'
        }
      }

      // Get media stream
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.info('Desktop capture stream acquired')

        // Simple track monitoring
        this.stream.getTracks().forEach(track => {
          track.onended = () => {
            logger.warn(`Track ended: ${track.kind}`)
            if (track.kind === 'video' && this.mediaRecorder?.state === 'recording') {
              this.mediaRecorder.stop()
            }
          }
        })
      } catch (error) {
        logger.error('getUserMedia failed:', error)
        throw new ElectronError(`Failed to capture desktop: ${error}`, 'getUserMedia')
      }

      const videoTrack = this.stream.getVideoTracks()[0]
      if (!videoTrack) {
        throw new Error('No video track found in stream')
      }

      // Fallback: attempt to hide cursor at the track level as some Chromium builds ignore the constraint on getUserMedia
      try {
        // @ts-expect-error non-standard constraint but supported by Chromium for display capture
        await videoTrack.applyConstraints({ cursor: 'never' })
      } catch (err) {
        logger.warn('Unable to apply cursor constraint at track level:', err)
      }

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm'

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 5000000,
        ...(hasAudio ? { audioBitsPerSecond: 128000 } : {})
      })

      // Set up MediaRecorder handlers
      this.chunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          this.chunks.push(event.data)
        }
      }

      this.mediaRecorder.onerror = (event) => {
        logger.error('MediaRecorder error:', event)
        if (this.mediaRecorder?.state === 'recording') {
          this.mediaRecorder.stop()
        }
      }

      // Start tracking and recording
      this.startTime = Date.now()
      this.isRecording = true

      // Start mouse tracking via IPC
      if (window.electronAPI && typeof window.electronAPI.startMouseTracking === 'function') {
        await this.startMouseTracking(primarySource.id)
      }

      // Start MediaRecorder
      this.mediaRecorder.start()

      // Periodically request data
      this.dataRequestInterval = setInterval(() => {
        if (this.mediaRecorder?.state === 'recording') {
          try {
            this.mediaRecorder.requestData()
          } catch (e) {
            clearInterval(this.dataRequestInterval!)
            this.dataRequestInterval = null
          }
        }
      }, 1000)

      logger.info('Screen recording started successfully')

    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  async stopRecording(): Promise<ElectronRecordingResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Not recording')
    }

    logger.info('Stopping screen recording')

    return new Promise(async (resolve, reject) => {
      // Handle already stopped recorder
      if (this.mediaRecorder!.state === 'inactive') {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: 'video/webm' })

        this.isRecording = false
        await this.cleanup()

        resolve({
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea
        })
        return
      }

      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: 'video/webm' })

        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes`)

        const result = {
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea
        }

        this.isRecording = false
        await this.cleanup()
        resolve(result)
      }

      this.mediaRecorder!.onerror = (error) => {
        logger.error('MediaRecorder error:', error)
        reject(error)
      }

      // Mark as not recording before stopping
      this.isRecording = false

      // Stop mouse tracking first
      if (window.electronAPI?.stopMouseTracking) {
        await window.electronAPI.stopMouseTracking()
      }

      try {
        this.mediaRecorder!.stop()
      } catch (e) {
        logger.error('Error stopping MediaRecorder:', e)
        reject(e)
      }
    })
  }

  private async startMouseTracking(sourceId: string): Promise<void> {
    logger.info('Starting mouse tracking via IPC')

    // Set up event listeners for mouse data from main process
    const handleMouseMove = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      this.metadata.push({
        timestamp,
        mouseX: data.x,
        mouseY: data.y,
        eventType: 'mouse',
        velocity: data.velocity,
        cursorType: data.cursorType,
        scaleFactor: data.scaleFactor,
        // Always include capture dimensions with mouse events
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight
      })
    }

    const handleMouseClick = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      this.metadata.push({
        timestamp,
        mouseX: data.x,
        mouseY: data.y,
        eventType: 'click',
        key: data.button,
        cursorType: data.cursorType
      })
    }

    // Register listeners if available
    if (window.electronAPI?.onMouseMove && window.electronAPI?.onMouseClick) {
      window.electronAPI.onMouseMove(handleMouseMove)
      window.electronAPI.onMouseClick(handleMouseClick)
    }

    // Start tracking in main process
    const sourceType = sourceId.startsWith('screen:') ? 'screen' : 'window'
    const result = await window.electronAPI!.startMouseTracking({
      intervalMs: 16,
      sourceId,
      sourceType
    })

    if (!result.success) {
      throw new Error(`Failed to start mouse tracking: ${result.error}`)
    }

    logger.debug(`Mouse tracking started at ${result.fps}fps`)
  }

  private async cleanup(): Promise<void> {
    // Clear intervals
    if (this.dataRequestInterval) {
      clearInterval(this.dataRequestInterval)
      this.dataRequestInterval = null
    }

    // Stop stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    // Reset state
    this.mediaRecorder = null
    this.chunks = []
    this.metadata = []
    this.captureArea = undefined
    this.isRecording = false

    logger.debug('ElectronRecorder cleaned up')
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording
  }

  pauseRecording(): void {
    if (!this.mediaRecorder || !this.isRecording) {
      logger.warn('Cannot pause: not recording')
      return
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      logger.info('Recording paused')
    }
  }

  resumeRecording(): void {
    if (!this.mediaRecorder || !this.isRecording) {
      logger.warn('Cannot resume: not recording')
      return
    }

    if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
      logger.info('Recording resumed')
    }
  }

  getDuration(): number {
    return Date.now() - this.startTime
  }

  getState(): 'idle' | 'recording' | 'paused' {
    if (!this.isRecording) return 'idle'
    if (this.mediaRecorder?.state === 'paused') return 'paused'
    return 'recording'
  }

  async getAvailableSources(): Promise<Array<{ id: string, name: string, type: string }>> {
    try {
      if (!window.electronAPI?.getDesktopSources) {
        throw new Error('Desktop sources API not available')
      }

      const sources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      })

      return sources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window'
      }))
    } catch (error) {
      logger.error('Failed to get available sources:', error)
      return []
    }
  }
}

// Window interface is already extended in src/types/electron.d.ts
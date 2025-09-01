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
  private useNativeRecorder = false
  private nativeRecorderPath: string | null = null
  private hasAudio = false

  constructor() {
    logger.debug('ElectronRecorder initialized')
    this.checkNativeRecorderAvailability()
  }

  private async checkNativeRecorderAvailability() {
    logger.info('Checking native recorder availability...')
    if (window.electronAPI?.nativeRecorder) {
      logger.info('Native recorder API found, checking if available...')
      try {
        this.useNativeRecorder = await window.electronAPI.nativeRecorder.isAvailable()
        if (this.useNativeRecorder) {
          logger.info('✅ Native ScreenCaptureKit recorder available - cursor WILL be hidden!')
        } else {
          logger.info('Native recorder API exists but not available on this system')
        }
      } catch (err) {
        logger.warn('Native recorder check failed:', err)
      }
    } else {
      logger.info('Native recorder API not found in window.electronAPI')
    }
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

      // Check screen recording permission on macOS
      if (window.electronAPI?.checkScreenRecordingPermission) {
        const permissionResult = await window.electronAPI.checkScreenRecordingPermission()
        logger.info('Screen recording permission status:', permissionResult)

        if (!permissionResult.granted) {
          // Request permission and show system preferences
          if (window.electronAPI?.requestScreenRecordingPermission) {
            await window.electronAPI.requestScreenRecordingPermission()
          }
          throw new PermissionError(
            'Screen recording permission is required.\n\nPlease grant permission in System Preferences > Security & Privacy > Screen Recording, then try again.',
            'screen'
          )
        }
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
          // Default to 1x if we cannot resolve the display scale factor
          let scaleFactor = 1

          // For screen sources, fetch actual display scale factor for pixel dimensions
          if (primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
            try {
              const screens = await window.electronAPI.getScreens()
              const partsForScale = primarySource.id.split(':')
              const parsedDisplayId = parseInt(partsForScale[1])
              const displayInfo = screens?.find((d: any) => d.id === parsedDisplayId)
              if (displayInfo && typeof displayInfo.scaleFactor === 'number' && displayInfo.scaleFactor > 0) {
                scaleFactor = displayInfo.scaleFactor
              }
            } catch (_) {
              // Ignore and keep scaleFactor = 1
            }
          }

          this.captureArea = {
            fullBounds: bounds,
            workArea: bounds,
            scaleFactor,
            sourceType: primarySource.id.startsWith('screen:') ? 'screen' : 'window',
            sourceId: primarySource.id
          }
          // Store capture dimensions in PHYSICAL PIXELS for consistency
          this.captureWidth = Math.round(bounds.width * (this.captureArea.scaleFactor || 1))
          this.captureHeight = Math.round(bounds.height * (this.captureArea.scaleFactor || 1))
        }
      }

      // Check if we should use native recorder (macOS 12.3+ with ScreenCaptureKit)
      if (this.useNativeRecorder && window.electronAPI?.nativeRecorder) {
        logger.info('🎯 Using native ScreenCaptureKit recorder - cursor will be HIDDEN!')
        logger.info(`Audio setting: ${recordingSettings.audioInput} (native recorder always captures system audio)`)

        // Parse source ID to get display ID (screen:0:0 format)
        const parts = primarySource.id.split(':')
        const displayId = parseInt(parts[1]) || 0

        try {
          // Start native recording with cursor hidden
          const result = await window.electronAPI.nativeRecorder.startDisplay(displayId)

          this.nativeRecorderPath = result.outputPath
          this.isRecording = true
          this.startTime = Date.now()
          this.hasAudio = true

          // Start metadata tracking (mouse events for custom cursor overlay if enabled)
          await this.startMouseTracking(primarySource.id)

          logger.info('Native recording started successfully - NO cursor in video!')
          return
        } catch (err) {
          logger.warn('Failed to use native recorder, falling back to MediaRecorder:', err)
          this.useNativeRecorder = false
        }
      }

      // Fallback to MediaRecorder (cursor will be visible)
      logger.info('Using MediaRecorder - cursor WILL be visible in recording')
      this.hasAudio = recordingSettings.audioInput !== 'none'

      // Get proper constraints from IPC for desktop audio
      let constraints: any
      
      if (window.electronAPI?.getDesktopStream) {
        // Use IPC to get constraints that include desktop audio
        constraints = await window.electronAPI.getDesktopStream(primarySource.id, this.hasAudio)
      } else {
        // Fallback to manual constraints if IPC not available
        logger.warn('IPC getDesktopStream not available, using manual constraints')
        constraints = {
          audio: this.hasAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: primarySource.id } } : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: primarySource.id
            }
          }
        }
      }

      // Get media stream with desktop audio
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.info('Desktop capture stream acquired with system audio')
        
        // Log audio tracks
        const audioTracks = this.stream.getAudioTracks()
        if (audioTracks.length > 0) {
          logger.info(`✅ System audio captured: ${audioTracks.length} track(s)`)
          audioTracks.forEach((track, i) => {
            logger.info(`  Audio track ${i}: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}`)
          })
        } else if (this.hasAudio) {
          logger.warn('⚠️ No audio tracks despite requesting audio - check screen recording permissions')
          // Don't set hasAudio to false - let the user know audio was requested but not captured
        }

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

      // Log final stream composition
      const audioTracks = this.stream.getAudioTracks()
      logger.info(`Stream ready - Video: 1 track, Audio: ${audioTracks.length} track(s)`)

      // Create MediaRecorder with proper audio codec
      let mimeType = 'video/webm'

      // Try different codec combinations for better compatibility
      if (this.hasAudio) {
        // For recordings with audio, specify both video and audio codecs
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus'
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus'
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mimeType = 'video/webm;codecs=vp8'
        }
      } else {
        // For video-only, use simpler codec
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mimeType = 'video/webm;codecs=vp8'
        }
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 5000000,
        ...(this.hasAudio ? { audioBitsPerSecond: 128000 } : {})
      })
      
      logger.info(`MediaRecorder using: ${this.mediaRecorder.mimeType}`)

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
    if (!this.isRecording) {
      throw new Error('Not recording')
    }

    logger.info('Stopping screen recording')

    // Handle native recorder
    if (this.useNativeRecorder && this.nativeRecorderPath && window.electronAPI?.nativeRecorder) {
      try {
        // Stop mouse and keyboard tracking
        if (window.electronAPI?.stopMouseTracking) {
          await window.electronAPI.stopMouseTracking()
        }
        if (window.electronAPI?.stopKeyboardTracking) {
          await window.electronAPI.stopKeyboardTracking()
        }

        // Stop native recording
        const result = await window.electronAPI.nativeRecorder.stop()
        const duration = Date.now() - this.startTime

        // Read the video file (ScreenCaptureKit creates .mov files)
        const videoBuffer = await window.electronAPI.nativeRecorder.readVideo(result.outputPath || this.nativeRecorderPath)
        const video = new Blob([videoBuffer], { type: 'video/quicktime' })

        logger.info(`Native recording complete: ${duration}ms, ${video.size} bytes, NO CURSOR!`)

        const recordingResult = {
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea,
          hasAudio: this.hasAudio  // Use the stored audio setting
        }

        this.isRecording = false
        this.nativeRecorderPath = null
        await this.cleanup()

        return recordingResult
      } catch (err) {
        logger.error('Failed to stop native recorder:', err)
        throw err
      }
    }

    // Handle MediaRecorder
    if (!this.mediaRecorder) {
      throw new Error('MediaRecorder not initialized')
    }

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
          captureArea: this.captureArea,
          hasAudio: this.hasAudio
        })
        return
      }

      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        const blobType = this.hasAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm'
        const video = new Blob(this.chunks, { type: blobType })

        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes, type: ${video.type}, chunks: ${this.chunks.length}, hasAudio: ${this.hasAudio}`)

        const result = {
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea,
          hasAudio: this.hasAudio
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

    const handleKeyboardEvent = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      this.metadata.push({
        timestamp,
        eventType: 'keypress',
        key: data.key,
        modifiers: data.modifiers || [],
        keyEventType: data.type // 'keydown' or 'keyup'
      })
      logger.info(`🎹 Keyboard event captured: ${data.type} ${data.key} at ${timestamp}ms`)
    }

    // Register listeners if available
    if (window.electronAPI?.onMouseMove && window.electronAPI?.onMouseClick) {
      window.electronAPI.onMouseMove(handleMouseMove)
      window.electronAPI.onMouseClick(handleMouseClick)
    }

    // Register keyboard listener
    if (window.electronAPI?.onKeyboardEvent) {
      window.electronAPI.onKeyboardEvent(handleKeyboardEvent)
    }

    // Start keyboard tracking
    if (window.electronAPI?.startKeyboardTracking) {
      logger.info('Starting keyboard tracking...')
      await window.electronAPI.startKeyboardTracking()
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

}

// Window interface is already extended in src/types/electron.d.ts
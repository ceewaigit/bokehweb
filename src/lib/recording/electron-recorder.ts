/**
 * Electron-based screen recorder using desktopCapturer
 * Thin wrapper around MediaRecorder with IPC coordination
 */

import type { RecordingSettings } from '@/types'
import type { ElectronRecordingResult, ElectronMetadata } from '@/types/recording'
import { RecordingSourceType } from '@/types'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/core/errors'

export class ElectronRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private recordingPath: string | null = null
  private metadataPath: string | null = null
  private metadataWriteQueue: ElectronMetadata[] = []
  private metadataFlushTimer: NodeJS.Timeout | null = null
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

          // For window sources, getSourceBounds returns pixel coordinates already; use scaleFactor 1
          if (!primarySource.id.startsWith('screen:')) {
            scaleFactor = 1
          }

          this.captureArea = {
            fullBounds: bounds,
            workArea: bounds,
            scaleFactor,
            sourceType: primarySource.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window,
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

      // Set up streaming handlers
      if (!window.electronAPI?.createTempRecordingFile) {
        throw new Error('Streaming API not available')
      }
      
      // Create temp file for streaming
      const fileResult = await window.electronAPI.createTempRecordingFile('webm')
      if (!fileResult?.success || !fileResult.data) {
        throw new Error('Failed to create temp recording file')
      }
      
      this.recordingPath = fileResult.data
      logger.info(`Streaming to temp file: ${this.recordingPath}`)
      
      // Create metadata file
      if (window.electronAPI.createMetadataFile) {
        const metaResult = await window.electronAPI.createMetadataFile()
        if (metaResult?.success && metaResult.data) {
          this.metadataPath = metaResult.data
        }
      }

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data?.size > 0 && this.recordingPath && window.electronAPI?.appendToRecording) {
          // Stream chunk directly to file
          const result = await window.electronAPI.appendToRecording(this.recordingPath, event.data)
          if (!result?.success) {
            logger.error('Failed to stream chunk:', result?.error)
          }
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

        const tempPath = result.outputPath || this.nativeRecorderPath
        if (!tempPath) {
          throw new Error('No output path from native recorder')
        }

        logger.info(`Native recording complete: ${duration}ms, path: ${tempPath}`)

        const recordingResult: ElectronRecordingResult = {
          videoPath: tempPath,
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
        
        if (!this.recordingPath) {
          throw new Error('Recording path not available')
        }
        
        // Finalize streaming files
        if (window.electronAPI?.finalizeRecording) {
          await window.electronAPI.finalizeRecording(this.recordingPath)
        }
        await this.flushMetadata(true)
        
        let metadata = this.metadata
        if (this.metadataPath && window.electronAPI?.readMetadataFile) {
          const metaResult = await window.electronAPI.readMetadataFile(this.metadataPath)
          if (metaResult?.success && metaResult.data) {
            metadata = metaResult.data
          }
        }
        
        this.isRecording = false
        await this.cleanup()

        resolve({
          videoPath: this.recordingPath,
          duration,
          metadata,
          captureArea: this.captureArea,
          hasAudio: this.hasAudio
        })
        return
      }

      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        
        if (!this.recordingPath) {
          throw new Error('Recording path not available')
        }
        
        // Finalize video file
        if (window.electronAPI?.finalizeRecording) {
          await window.electronAPI.finalizeRecording(this.recordingPath)
        }
        
        // Flush and finalize metadata
        await this.flushMetadata(true)
        
        // Read metadata from file if needed
        let metadata = this.metadata
        if (this.metadataPath && window.electronAPI?.readMetadataFile) {
          const metaResult = await window.electronAPI.readMetadataFile(this.metadataPath)
          if (metaResult?.success && metaResult.data) {
            metadata = metaResult.data
          }
        }
        
        logger.info(`Recording complete: ${duration}ms, path: ${this.recordingPath}`)
        
        const result: ElectronRecordingResult = {
          videoPath: this.recordingPath,
          duration,
          metadata,
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

      // Stop all tracking first
      if (window.electronAPI?.stopMouseTracking) {
        await window.electronAPI.stopMouseTracking()
      }
      if (window.electronAPI?.stopKeyboardTracking) {
        await window.electronAPI.stopKeyboardTracking()
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

    // Helper to convert absolute (physical) screen coords to capture-relative coords
    const toCaptureRelative = (x: number, y: number): { rx: number; ry: number; inside: boolean } => {
      const scale = this.captureArea?.scaleFactor || 1
      const bounds = this.captureArea?.fullBounds
      if (!bounds) {
        return { rx: x, ry: y, inside: true }
      }
      const originX = Math.round(bounds.x * scale)
      const originY = Math.round(bounds.y * scale)
      const rx = x - originX
      const ry = y - originY
      const w = this.captureWidth || Math.round(bounds.width * scale)
      const h = this.captureHeight || Math.round(bounds.height * scale)
      const inside = rx >= 0 && ry >= 0 && rx < w && ry < h
      return { rx, ry, inside }
    }

    // Set up event listeners for mouse data from main process
    const handleMouseMove = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      const { rx, ry, inside } = toCaptureRelative(Number(data.x), Number(data.y))
      if (!inside) return
      this.addMetadata({
        timestamp,
        mouseX: rx, // relative to capture origin, in physical pixels
        mouseY: ry,
        eventType: 'mouse',
        velocity: data.velocity,
        cursorType: data.cursorType,
        scaleFactor: this.captureArea?.scaleFactor,
        // Always include capture dimensions with mouse events (in physical pixels)
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight,
        // Store logical coordinates for debugging if available
        logicalX: data.logicalX,
        logicalY: data.logicalY
      })
    }

    const handleMouseClick = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      const { rx, ry, inside } = toCaptureRelative(Number(data.x), Number(data.y))
      if (!inside) return
      this.addMetadata({
        timestamp,
        mouseX: rx, // relative to capture origin, in physical pixels
        mouseY: ry,
        eventType: 'click',
        key: data.button,
        cursorType: data.cursorType,
        scaleFactor: this.captureArea?.scaleFactor,
        // Store logical coordinates for debugging if available
        logicalX: data.logicalX,
        logicalY: data.logicalY
      })
    }

    const handleKeyboardEvent = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      this.addMetadata({
        timestamp,
        eventType: 'keypress',
        key: data.key,
        modifiers: data.modifiers || [],
        keyEventType: data.type // 'keydown' or 'keyup'
      })
      logger.info(`🎹 Keyboard event captured: ${data.type} ${data.key} at ${timestamp}ms`)
    }

    const handleScroll = (_event: unknown, data: any) => {
      const timestamp = Date.now() - this.startTime
      console.log('[ElectronRecorder] Scroll event received:', {
        timestamp,
        deltaX: data.deltaX || 0,
        deltaY: data.deltaY || 0
      })
      this.addMetadata({
        timestamp,
        eventType: 'scroll',
        scrollDelta: { x: data.deltaX || 0, y: data.deltaY || 0 },
        captureWidth: this.captureWidth,
        captureHeight: this.captureHeight
      })
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

    // Register scroll listener
    if (window.electronAPI?.onScroll) {
      console.log('[ElectronRecorder] Registering scroll listener')
      window.electronAPI.onScroll(handleScroll)
    } else {
      console.warn('[ElectronRecorder] No scroll listener available in electronAPI')
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

  private addMetadata(metadata: ElectronMetadata) {
    // Add to queue for batch writing
    this.metadataWriteQueue.push(metadata)
    
    // Also keep in memory for immediate access
    this.metadata.push(metadata)
    
    // Flush every 100 events or after 1 second
    if (this.metadataWriteQueue.length >= 100) {
      this.flushMetadata()
    } else if (!this.metadataFlushTimer) {
      this.metadataFlushTimer = setTimeout(() => this.flushMetadata(), 1000)
    }
  }

  private async flushMetadata(isLast = false) {
    if (this.metadataFlushTimer) {
      clearTimeout(this.metadataFlushTimer)
      this.metadataFlushTimer = null
    }

    if (this.metadataWriteQueue.length > 0 && this.metadataPath && window.electronAPI?.appendMetadataBatch) {
      try {
        await window.electronAPI.appendMetadataBatch(
          this.metadataPath,
          this.metadataWriteQueue,
          isLast
        )
        this.metadataWriteQueue = []
      } catch (err) {
        logger.error('Failed to flush metadata:', err)
        this.metadataWriteQueue = []
      }
    }
  }

  private async cleanup(): Promise<void> {
    // Flush any remaining metadata
    if (this.metadataWriteQueue.length > 0) {
      await this.flushMetadata(true)
    }

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
    this.recordingPath = null
    this.metadataPath = null
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
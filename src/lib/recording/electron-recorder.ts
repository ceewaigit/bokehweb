/**
 * Electron-based screen recorder using desktopCapturer
 * Provides native screen recording capabilities with system-level access
 */

import type { RecordingSettings } from '@/types'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/core/errors'
export interface ElectronRecordingResult {
  video: Blob
  duration: number
  metadata: ElectronMetadata[]
  effectsApplied: string[]
  processingTime: number
  captureArea?: {
    fullBounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
  }
}

export interface ElectronMetadata {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'keypress' | 'scroll'
  key?: string
  screenId?: string
  velocity?: { x: number; y: number }
  scrollDelta?: { x: number; y: number }
  captureX?: number
  captureY?: number
  captureWidth?: number
  captureHeight?: number
  scaleFactor?: number
}

export class ElectronRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private isRecording = false
  private isPaused = false
  private startTime = 0
  private pausedDuration = 0
  private lastPauseTime = 0
  private metadata: ElectronMetadata[] = []
  private captureArea: ElectronRecordingResult['captureArea'] = undefined
  private dataRequestInterval: NodeJS.Timeout | null = null

  // Mouse tracking optimization
  private lastMouseX = -1
  private lastMouseY = -1
  private lastMouseTime = 0
  private readonly POSITION_THRESHOLD = 3 // pixels - only log if movement exceeds this
  private readonly TIME_THRESHOLD = 50 // ms - minimum time between events

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
      if (!this.isElectron()) {
        throw new Error('ElectronRecorder requires Electron environment')
      }

      // Get screen sources using Electron's desktopCapturer
      let sources
      try {
        sources = await this.getDesktopSources()
      } catch (error) {
        logger.error('Failed to get desktop sources:', error)
        if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
          throw new PermissionError(
            'Please enable screen recording in System Preferences and restart the app',
            'screen',
            true
          )
        }
        throw error
      }

      if (!sources || sources.length === 0) {
        throw new PermissionError('No screen sources available. Please check permissions.', 'screen')
      }

      let primarySource

      // Select source based on recording settings
      if (recordingSettings.area === 'window') {
        // For window recording, we'll need to show a window picker
        // For now, use the first window source
        primarySource = sources.find((s: any) =>
          !s.id.startsWith('screen:') &&
          !s.name.toLowerCase().includes('entire screen')
        )

        if (!primarySource) {
          logger.warn('No window sources available, falling back to screen')
          primarySource = sources.find((s: any) => s.id.startsWith('screen:'))
        }
      } else if (recordingSettings.area === 'region') {
        // For region recording, we'll need to implement area selection
        // For now, use the entire screen and we'll crop in post-processing
        primarySource = sources.find((s: any) =>
          s.id.startsWith('screen:') ||
          s.name.toLowerCase().includes('entire screen') ||
          s.name.toLowerCase().includes('screen 1')
        )
      } else {
        // Default to fullscreen recording
        primarySource = sources.find((s: any) =>
          s.id.startsWith('screen:') ||
          s.name.toLowerCase().includes('entire screen') ||
          s.name.toLowerCase().includes('screen 1')
        )
      }

      // Fallback to last source (usually the entire screen)
      if (!primarySource) {
        logger.warn('Could not find appropriate source, using last available source')
        primarySource = sources[sources.length - 1]
      }

      logger.info(`Using ${recordingSettings.area} source: ${primarySource.name} (${primarySource.id})`)

      // Capture screen dimensions for dock exclusion
      await this.captureScreenInfo(primarySource.id)

      // Check and request screen recording permission first
      await this.checkScreenRecordingPermission()

      // Get media stream from desktop capturer with audio support
      const hasAudio = recordingSettings.audioInput !== 'none'
      logger.debug('Requesting media stream with constraints', {
        audio: hasAudio,
        sourceId: primarySource.id
      })

      // ALWAYS use the mandatory format - this is what works universally
      // Cast to 'any' because Electron extends the standard MediaStreamConstraints
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
          }
        }
      }

      logger.debug('Using universal Electron constraints', constraints)

      // Now use getUserMedia with the Electron-specific constraints
      logger.debug('Requesting media stream with Electron constraints')

      try {
        // In Electron, we must use getUserMedia with the specific desktop constraints
        this.stream = await navigator.mediaDevices.getUserMedia(constraints) as MediaStream
        logger.info('Desktop capture stream acquired successfully')

        // Add error handlers for individual tracks to prevent stream from stopping
        this.stream.getTracks().forEach(track => {
          track.onended = () => {
            logger.warn(`Track ended: ${track.kind} - ${track.label}`)
            // If it's an audio track that ended, don't stop the whole recording
            if (track.kind === 'audio' && this.isRecording) {
              logger.warn('Audio track ended but continuing video recording')
              this.stream?.removeTrack(track)
            } else if (track.kind === 'video' && this.isRecording && this.mediaRecorder) {
              // Video track ended unexpectedly - force save what we have
              logger.error('Video track ended unexpectedly - forcing save')
              logger.info('Video track ended - chunks available:', this.chunks.length)

              // Force MediaRecorder to give us any pending data
              if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                try {
                  this.mediaRecorder.requestData()
                } catch (e) {
                  logger.warn('Could not request data from MediaRecorder:', e)
                }
              }

              // Wait a brief moment for any pending chunks
              setTimeout(() => {
                logger.debug('After requestData - chunks available:', this.chunks.length)

                // Create blob immediately from chunks we have
                if (this.chunks.length > 0) {
                  const emergencyBlob = new Blob(this.chunks, { type: 'video/webm' })
                  logger.info(`Creating emergency blob: ${emergencyBlob.size} bytes from ${this.chunks.length} chunks`)

                  // Directly trigger save without waiting for onstop
                  const duration = Date.now() - this.startTime
                  const result: ElectronRecordingResult = {
                    video: emergencyBlob,
                    metadata: this.metadata,
                    duration,
                    effectsApplied: ['electron-desktop-capture', 'emergency-save'],
                    processingTime: 0,
                    captureArea: this.captureArea
                  }

                  // Save immediately via the project save function
                  this.emergencySave(result).catch(err => {
                    logger.error('Emergency save failed:', err)
                    console.error('EMERGENCY SAVE FAILED:', err)
                  })
                } else {
                  logger.error('NO CHUNKS AVAILABLE FOR EMERGENCY SAVE')
                }

                // Still try to stop MediaRecorder normally
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                  try {
                    this.mediaRecorder.stop()
                  } catch (e) {
                    logger.error('Failed to stop MediaRecorder after video track ended:', e)
                  }
                }
              }, 200) // Wait 200ms for chunks
            }
          }

          track.onmute = () => {
            logger.warn(`Track muted: ${track.kind} - ${track.label}`)
          }
        })

        // If audio was requested but not in the desktop stream, add microphone
        if (hasAudio && this.stream.getAudioTracks().length === 0) {
          logger.debug('Adding microphone audio track')
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            })
            const audioTrack = audioStream.getAudioTracks()[0]
            if (audioTrack) {
              this.stream.addTrack(audioTrack)
              logger.debug('Microphone audio added to stream')
            }
          } catch (audioError) {
            logger.warn('Could not add microphone audio:', audioError)
          }
        }
      } catch (error) {
        logger.error('getUserMedia failed:', error)
        throw new ElectronError(`Failed to capture desktop: ${error}`, 'getUserMedia')
      }

      logger.debug('Desktop capture stream acquired', {
        streamId: this.stream.id,
        videoTracks: this.stream.getVideoTracks().length,
        audioTracks: this.stream.getAudioTracks().length
      })

      // Set up MediaRecorder with optimized settings for stability
      // Use VP8 for better compatibility and stability with ScreenCaptureKit
      let mimeType = 'video/webm;codecs=vp8'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm'
      }

      logger.debug(`Using mimeType: ${mimeType}`)

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 5000000, // 5 Mbps - lower bitrate for stability
        // Add audio bitrate if audio is enabled
        ...(hasAudio ? { audioBitsPerSecond: 128000 } : {})
      })

      this.chunks = []

      // Set up data collection BEFORE starting
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data)
          logger.debug(`Recording chunk #${this.chunks.length}: ${event.data.size} bytes, total chunks: ${this.chunks.length}`)

          // Auto-save every 5 chunks as backup
          if (this.chunks.length % 5 === 0) {
            const backupBlob = new Blob(this.chunks, { type: mimeType })
            logger.debug(`Backup save point: ${backupBlob.size} bytes from ${this.chunks.length} chunks`)
          }
        }
      }

      this.mediaRecorder.onstart = () => {
        logger.debug('MediaRecorder started')

        // Immediately request data to start collecting chunks
        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try {
              this.mediaRecorder.requestData()
              logger.debug('Initial data request sent')
            } catch (e) {
              logger.warn('Could not request initial data:', e)
            }
          }
        }, 50)
      }

      this.mediaRecorder.onerror = (event: any) => {
        logger.error('MediaRecorder error:', event)

        // Try to save whatever we have so far
        if (this.chunks.length > 0) {
          const emergencyBlob = new Blob(this.chunks, { type: mimeType })
          logger.info(`MediaRecorder error - saving ${this.chunks.length} chunks, ${emergencyBlob.size} bytes`)

          const duration = Date.now() - this.startTime
          const result: ElectronRecordingResult = {
            video: emergencyBlob,
            metadata: this.metadata,
            duration,
            effectsApplied: ['electron-desktop-capture', 'error-recovery'],
            processingTime: 0,
            captureArea: this.captureArea
          }

          this.emergencySave(result).catch(err => {
            logger.error('Emergency save on error failed:', err)
          })
        }

        // Don't stop recording on audio errors - continue with video only
        if (event.error?.message?.includes('audio') || event.error?.message?.includes('Stream')) {
          logger.warn('Audio stream error detected, continuing with video only')
          // Remove audio tracks to prevent further errors
          const audioTracks = this.stream?.getAudioTracks()
          audioTracks?.forEach(track => {
            track.stop()
            this.stream?.removeTrack(track)
          })
        }
      }

      // Always capture mouse metadata to power effects
      await this.startMouseTracking()

      // Start recording with immediate data collection
      // Don't use timeslice - let MediaRecorder handle buffering
      this.mediaRecorder.start()
      this.isRecording = true
      this.startTime = Date.now()

      // Periodically request data to keep stream alive
      const dataRequestInterval = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          try {
            this.mediaRecorder.requestData()
          } catch (e) {
            clearInterval(dataRequestInterval)
          }
        } else {
          clearInterval(dataRequestInterval)
        }
      }, 1000) // Request data every second

      // Store interval for cleanup
      this.dataRequestInterval = dataRequestInterval

      logger.info('Screen recording started successfully')

    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  private async emergencySave(result: ElectronRecordingResult) {
    logger.info('EMERGENCY SAVE TRIGGERED - Attempting to save recording')

    // Import the save function dynamically to avoid circular dependency
    const { saveRecordingWithProject } = await import('@/types/project')

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const projectName = `Emergency_Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`

    try {
      const saved = await saveRecordingWithProject(result.video, result.metadata, projectName)
      if (saved) {
        logger.info(`✅ EMERGENCY RECORDING SAVED: video=${saved.videoPath}`)

        // Show user notification that emergency save worked
        if (window.electronAPI?.showMessageBox) {
          window.electronAPI.showMessageBox({
            type: 'info',
            title: 'Recording Saved',
            message: 'Recording was saved despite stream interruption',
            detail: `Saved to: ${saved.videoPath}`
          })
        }
      } else {
        logger.error('❌ EMERGENCY SAVE FAILED: saveRecordingWithProject returned null')
      }
    } catch (error) {
      logger.error('❌ EMERGENCY SAVE ERROR:', error)
    }
  }

  async stopRecording(): Promise<ElectronRecordingResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Not recording')
    }

    logger.info('Stopping screen recording')

    return new Promise(async (resolve, reject) => {
      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })

        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes, ${this.metadata.length} metadata events`)

        // Don't save here - let the consumer (use-recording.ts) handle saving
        // This was causing duplicate saves with different timestamp formats

        this.cleanup()

        const effectsApplied = ['electron-desktop-capture']
        if (this.metadata.length > 0) {
          effectsApplied.push('mouse-tracking', 'metadata-recording')
        }

        resolve({
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea,
          effectsApplied,
          processingTime: 0 // Electron recorder has no post-processing
        })
      }

      this.mediaRecorder!.onerror = reject
      this.isRecording = false
      this.stopMouseTracking()
      this.mediaRecorder!.stop()
    })
  }

  private isElectron(): boolean {
    const hasWindow = typeof window !== 'undefined'
    const hasElectronAPI = typeof window?.electronAPI === 'object' && window?.electronAPI !== null
    const hasDesktopSources = typeof window?.electronAPI?.getDesktopSources === 'function'

    logger.debug('Electron environment check', {
      hasWindow,
      hasElectronAPI,
      hasDesktopSources,
      result: hasWindow && hasElectronAPI && hasDesktopSources
    })

    return hasWindow && hasElectronAPI && hasDesktopSources
  }

  private async checkScreenRecordingPermission(): Promise<void> {
    logger.debug('Checking screen recording permission')

    if (!window.electronAPI?.showMessageBox) {
      logger.warn('Message box API not available, skipping permission check')
      return
    }

    try {
      // Try a test getUserMedia call to check if permission is already granted
      const testConstraints: any = {
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            maxWidth: 1,
            maxHeight: 1,
            maxFrameRate: 1
          }
        }
      }

      const testStream = await Promise.race([
        navigator.mediaDevices.getUserMedia(testConstraints),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        )
      ]) as MediaStream

      // If we get here, permission is granted
      testStream.getTracks().forEach(track => track.stop())
      logger.debug('Screen recording permission already granted')
      return

    } catch (error) {
      logger.info('Screen recording permission needed, showing dialog')

      // Show permission dialog
      const result = await window.electronAPI.showMessageBox({
        type: 'info',
        title: 'Screen Recording Permission Required',
        message: 'Screen Studio needs permission to record your screen.',
        detail: 'Please grant screen recording access in the next dialog, or go to System Preferences > Security & Privacy > Privacy > Screen Recording to manually enable it.',
        buttons: ['Grant Permission', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      })

      if (result.response === 1) {
        throw new PermissionError('Screen recording permission denied by user', 'screen')
      }

      logger.debug('User chose to grant permission, continuing')
    }
  }

  private async getDesktopSources(): Promise<any[]> {
    if (!window.electronAPI?.getDesktopSources) {
      throw new ElectronError('Desktop sources API not available', 'getDesktopSources')
    }

    try {
      const sources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      })

      logger.debug(`Found ${sources.length} desktop sources`, sources.map((s: any) => ({ name: s.name, id: s.id })))

      return sources
    } catch (error) {
      logger.error('Failed to get desktop sources:', error)
      throw new ElectronError('Failed to access desktop sources', 'getDesktopSources')
    }
  }

  private async captureScreenInfo(sourceId: string): Promise<void> {
    try {
      // Get screen information from Electron
      if (window.electronAPI?.getScreens) {
        const screens = await window.electronAPI.getScreens()

        // Find the screen that matches our source
        // Source ID format is usually "screen:ID:0" 
        const screenIdMatch = sourceId.match(/screen:(\d+):/)
        let screen = null
        
        if (screenIdMatch && screens.length > 0) {
          const screenId = parseInt(screenIdMatch[1])
          screen = screens.find((s: any) => s.id === screenId)
        }
        
        // Use primary screen as fallback
        if (!screen && screens.length > 0) {
          screen = screens[0]
        }

        if (screen) {
          this.captureArea = {
            fullBounds: screen.bounds,
            workArea: screen.workArea,
            scaleFactor: screen.scaleFactor ?? 1
          }

          logger.info('Screen info captured', {
            sourceId,
            fullBounds: this.captureArea.fullBounds,
            workArea: this.captureArea.workArea,
            scaleFactor: this.captureArea.scaleFactor
          })
        } else {
          logger.warn('No screen found, capture area will be undefined')
        }
      } else {
        logger.warn('getScreens API not available')
      }
    } catch (error) {
      logger.warn('Could not capture screen info, capture area will be undefined', error)
    }
  }

  private async startMouseTracking(): Promise<void> {
    logger.debug('Starting native mouse tracking')

    if (!window.electronAPI?.startMouseTracking) {
      throw new ElectronError('Native mouse tracking API not available', 'startMouseTracking')
    }

    // Check if native tracking is available
    const nativeAvailable = await window.electronAPI.isNativeMouseTrackingAvailable()
    logger.debug('Native tracking status', nativeAvailable)

    if (!nativeAvailable.available) {
      logger.warn('Native mouse tracking not available, using Electron fallback')
      // Continue anyway - the NativeMouseTracker uses Electron's screen API as fallback
    }

    // No longer need document-level click listeners
    // Global click detection is now handled by uiohook-napi in the main process
    // which can capture clicks anywhere on the screen, not just in the browser window

    // Set up event listeners for native mouse events
    const handleMouseMove = (_event: any, data: any) => {
      if (this.isRecording) {
        const now = Date.now()
        const timestamp = now - this.startTime
        

        // Calculate distance from last position
        const dx = this.lastMouseX >= 0 ? data.x - this.lastMouseX : 0
        const dy = this.lastMouseY >= 0 ? data.y - this.lastMouseY : 0
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Check thresholds - only log significant movements
        const timeDelta = now - this.lastMouseTime
        if (distance < this.POSITION_THRESHOLD && timeDelta < this.TIME_THRESHOLD) {
          return // Skip this event, movement too small
        }

        // Calculate velocity (pixels per second)
        let velocity = undefined
        if (this.lastMouseX >= 0 && timeDelta > 0) {
          velocity = {
            x: (dx / timeDelta) * 1000,
            y: (dy / timeDelta) * 1000
          }
        }

        // Don't scale the coordinates - keep them in logical pixels
        // The video player will handle the scaling
        const transformedX = data.x
        const transformedY = data.y

        this.metadata.push({
          timestamp,
          mouseX: transformedX,
          mouseY: transformedY,
          eventType: 'mouse',
          velocity,
          captureWidth: data.displayBounds?.width,
          captureHeight: data.displayBounds?.height,
          scaleFactor: data.scaleFactor
        })

        // Update last position
        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = now
      }
    }

    const handleMouseClick = (_event: any, data: any) => {
      if (this.isRecording) {
        const timestamp = Date.now() - this.startTime

        // Don't scale the coordinates - keep them in logical pixels
        const transformedX = data.x
        const transformedY = data.y

        this.metadata.push({
          timestamp,
          mouseX: transformedX,
          mouseY: transformedY,
          eventType: 'click',
          key: data.button,
          captureWidth: data.displayBounds?.width,
          captureHeight: data.displayBounds?.height,
          scaleFactor: data.scaleFactor
        })

        // Update position on click (use transformed coordinates)
        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = Date.now()

        logger.debug(`Global click captured at (${transformedX}, ${transformedY}), button: ${data.button}`)
      }
    }

    const handleScroll = (_event: any, data: any) => {
      if (this.isRecording && data.deltaX !== 0 || data.deltaY !== 0) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: data.x,
          mouseY: data.y,
          eventType: 'scroll',
          scrollDelta: { x: data.deltaX, y: data.deltaY },
          captureX: this.captureArea?.fullBounds?.x,
          captureY: this.captureArea?.fullBounds?.y,
          captureWidth: this.captureArea?.fullBounds?.width,
          captureHeight: this.captureArea?.fullBounds?.height
        })
      }
    }

    // Register event listeners
    window.electronAPI.onMouseMove(handleMouseMove)
    window.electronAPI.onMouseClick(handleMouseClick)

    // Add scroll handler if available
    if (window.electronAPI.onScroll) {
      window.electronAPI.onScroll(handleScroll)
    }

    // Start native tracking
    const result = await window.electronAPI.startMouseTracking({
      intervalMs: 16 // 60fps
    })

    if (!result.success) {
      throw new Error(`Failed to start native mouse tracking: ${result.error}`)
    }

    logger.debug(`Native mouse tracking started at ${result.fps}fps`)

    this.mouseTrackingCleanup = async () => {
      try {
        await window.electronAPI?.stopMouseTracking()
        window.electronAPI?.removeAllMouseListeners()
        logger.debug('Native mouse tracking stopped')
      } catch (error) {
        logger.error('Error stopping native mouse tracking:', error)
      }
    }
  }

  private mouseTrackingCleanup: (() => void | Promise<void>) | null = null

  private async stopMouseTracking(): Promise<void> {
    if (this.mouseTrackingCleanup) {
      await this.mouseTrackingCleanup()
      this.mouseTrackingCleanup = null
    }

    // Click detection is now handled globally in the main process
    // No need to remove document listeners

    logger.debug('Mouse tracking stopped')
  }

  private async cleanup(): Promise<void> {
    this.isRecording = false
    await this.stopMouseTracking()

    // Clear data request interval
    if (this.dataRequestInterval) {
      clearInterval(this.dataRequestInterval)
      this.dataRequestInterval = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.mediaRecorder = null
    this.chunks = []
    this.metadata = []
    this.captureArea = undefined

    // Reset mouse tracking state
    this.lastMouseX = -1
    this.lastMouseY = -1
    this.lastMouseTime = 0

    logger.debug('ElectronRecorder cleaned up')
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording
  }

  pauseRecording(): void {
    if (!this.mediaRecorder || !this.isRecording || this.isPaused) {
      logger.warn('Cannot pause: recorder not in recording state')
      return
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this.isPaused = true
      this.lastPauseTime = Date.now()
      logger.info('Recording paused')
    }
  }

  resumeRecording(): void {
    if (!this.mediaRecorder || !this.isRecording || !this.isPaused) {
      logger.warn('Cannot resume: recorder not in paused state')
      return
    }

    if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
      this.isPaused = false

      // Track total paused duration
      if (this.lastPauseTime > 0) {
        this.pausedDuration += Date.now() - this.lastPauseTime
        this.lastPauseTime = 0
      }

      logger.info('Recording resumed')
    }
  }

  getDuration(): number {
    if (!this.isRecording) return 0

    const now = Date.now()
    let duration = now - this.startTime - this.pausedDuration

    // If currently paused, subtract time since pause
    if (this.isPaused && this.lastPauseTime > 0) {
      duration -= (now - this.lastPauseTime)
    }

    return Math.max(0, duration)
  }

  getState(): 'idle' | 'recording' | 'paused' {
    if (!this.isRecording) return 'idle'
    if (this.isPaused) return 'paused'
    return 'recording'
  }

  // Get available sources for source selection UI
  async getAvailableSources(): Promise<Array<{ id: string, name: string, type: string }>> {
    try {
      const sources = await this.getDesktopSources()
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
/**
 * Electron-based screen recorder using desktopCapturer
 * Provides native screen recording capabilities with system-level access
 */

import type { RecordingSettings } from '@/types'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/core/errors'
import { saveRecordingWithProject } from '@/types/project'

// Note: Enhancement settings removed - effects are applied during export, not recording

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
  velocity?: { x: number; y: number } // pixels per second
  scrollDelta?: { x: number; y: number }
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

      // Find the "Entire screen" source - this is what Screen Studio uses
      let primarySource = sources.find((s: any) =>
        s.id.startsWith('screen:') ||
        s.name.toLowerCase().includes('entire screen') ||
        s.name.toLowerCase().includes('screen 1')
      )

      // Fallback to last source (usually the entire screen)
      if (!primarySource) {
        logger.warn('Could not find entire screen source, using last available source')
        primarySource = sources[sources.length - 1]
      }

      logger.info(`Using screen source: ${primarySource.name} (${primarySource.id})`)

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
            chromeMediaSource: 'desktop'
          }
        } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primarySource.id,
            // Hide cursor so we can overlay our own custom cursor
            cursorSize: 0
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

      // Set up MediaRecorder with high quality settings
      let mimeType = 'video/webm;codecs=vp9'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm'
        }
      }

      logger.debug(`Using mimeType: ${mimeType}`)

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 10000000 // 10 Mbps for high quality
      })

      this.chunks = []
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data)
          logger.debug(`Recording chunk: ${event.data.size} bytes`)
        }
      }

      this.mediaRecorder.onstart = () => {
        logger.debug('MediaRecorder started')
      }

      this.mediaRecorder.onerror = (event) => {
        logger.error('MediaRecorder error:', event)
      }

      // Always capture mouse metadata to power effects
      await this.startMouseTracking()

      // Start recording
      this.mediaRecorder.start(1000)
      this.isRecording = true
      this.startTime = Date.now()

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
        if (screenIdMatch && screens.length > 0) {
          const screenId = parseInt(screenIdMatch[1])
          const screen = screens.find((s: any) => s.id === screenId) || screens[0]

          if (screen) {
            this.captureArea = {
              fullBounds: screen.bounds,
              workArea: screen.workArea,
              scaleFactor: screen.scaleFactor || 1
            }

            logger.info('Screen info captured', {
              fullBounds: this.captureArea.fullBounds,
              workArea: this.captureArea.workArea,
              dockHeight: this.captureArea.fullBounds.height - this.captureArea.workArea.height
            })
          }
        }
      }
    } catch (error) {
      logger.warn('Could not capture screen info, dock exclusion will not be available', error)
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

    // Add document-level click listener to capture clicks
    const captureClick = (event: MouseEvent) => {
      if (this.isRecording) {
        // Send click event to main process
        if (window.electronAPI?.send) {
          window.electronAPI.send('detected-click', {
            x: event.screenX,
            y: event.screenY,
            button: event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle'
          })
        }
      }
    }

    // Listen for clicks on document
    document.addEventListener('click', captureClick, true);
    document.addEventListener('mousedown', captureClick, true);

    // Store for cleanup
    (this as any).clickListener = captureClick;

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

        // Transform logical pixels to video coordinate space
        // data.x/y are in logical pixels, we need to map to video space
        let transformedX = data.x
        let transformedY = data.y
        
        // If we have display bounds from the mouse event, use them
        if (data.displayBounds && data.scaleFactor) {
          // Convert logical pixels to physical pixels
          transformedX = data.x * data.scaleFactor
          transformedY = data.y * data.scaleFactor
        } else if (this.captureArea?.scaleFactor) {
          // Fallback to capture area scale factor
          transformedX = data.x * this.captureArea.scaleFactor
          transformedY = data.y * this.captureArea.scaleFactor
        }
        
        this.metadata.push({
          timestamp,
          mouseX: transformedX,
          mouseY: transformedY,
          eventType: 'mouse',
          velocity,
          // Store the logical screen dimensions for reference
          screenWidth: data.displayBounds?.width || this.captureArea?.fullBounds?.width || screen.width,
          screenHeight: data.displayBounds?.height || this.captureArea?.fullBounds?.height || screen.height,
          scaleFactor: data.scaleFactor || this.captureArea?.scaleFactor || 1
        })

        // Update last position (use transformed coordinates for consistency)
        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = now
      }
    }

    const handleMouseClick = (_event: any, data: any) => {
      if (this.isRecording) {
        const timestamp = Date.now() - this.startTime

        // Transform logical pixels to video coordinate space
        let transformedX = data.x
        let transformedY = data.y
        
        if (data.displayBounds && data.scaleFactor) {
          transformedX = data.x * data.scaleFactor
          transformedY = data.y * data.scaleFactor
        } else if (this.captureArea?.scaleFactor) {
          transformedX = data.x * this.captureArea.scaleFactor
          transformedY = data.y * this.captureArea.scaleFactor
        }
        
        this.metadata.push({
          timestamp,
          mouseX: transformedX,
          mouseY: transformedY,
          eventType: 'click',
          // Store the logical screen dimensions for reference
          screenWidth: data.displayBounds?.width || this.captureArea?.fullBounds?.width || screen.width,
          screenHeight: data.displayBounds?.height || this.captureArea?.fullBounds?.height || screen.height,
          scaleFactor: data.scaleFactor || this.captureArea?.scaleFactor || 1
        })

        // Update position on click (use transformed coordinates)
        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = Date.now()
      }
    }

    const handleScroll = (_event: any, data: any) => {
      if (this.isRecording && data.deltaX !== 0 || data.deltaY !== 0) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: data.x || this.lastMouseX,
          mouseY: data.y || this.lastMouseY,
          eventType: 'scroll',
          scrollDelta: { x: data.deltaX || 0, y: data.deltaY || 0 },
          // Add screen dimensions for proper coordinate normalization
          screenWidth: this.captureArea?.fullBounds?.width || screen.width,
          screenHeight: this.captureArea?.fullBounds?.height || screen.height
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

    // Remove click listener
    if ((this as any).clickListener) {
      document.removeEventListener('click', (this as any).clickListener, true)
      document.removeEventListener('mousedown', (this as any).clickListener, true)
      delete (this as any).clickListener
    }

    logger.debug('Mouse tracking stopped')
  }

  private async cleanup(): Promise<void> {
    this.isRecording = false
    await this.stopMouseTracking()

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
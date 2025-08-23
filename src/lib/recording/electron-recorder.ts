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
    sourceType?: 'screen' | 'window'
    sourceId?: string
  }
}

export interface ElectronMetadata {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'keypress' | 'scroll'
  key?: string
  velocity?: { x: number; y: number }
  scrollDelta?: { x: number; y: number }
  captureWidth?: number
  captureHeight?: number
  isWithinBounds?: boolean  // Whether cursor is within capture area
  scaleFactor?: number
  cursorType?: string  // Track cursor type for accurate rendering
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
      let captureAreaBounds: { x: number; y: number; width: number; height: number } | undefined

      // Check if this is an area selection
      if (recordingSettings.sourceId?.startsWith('area:')) {
        // Parse area coordinates from sourceId like "area:100,100,800,600"
        const coords = recordingSettings.sourceId.replace('area:', '').split(',').map(Number)
        if (coords.length === 4) {
          const [x, y, width, height] = coords
          captureAreaBounds = { x, y, width, height }
          logger.info(`Area selection: ${width}x${height} at (${x}, ${y})`)
          
          // For area selection, use the primary screen source
          primarySource = sources.find((s) =>
            s.id.startsWith('screen:') ||
            s.name.toLowerCase().includes('entire screen') ||
            s.name.toLowerCase().includes('screen 1')
          )
          
          if (!primarySource) {
            throw new Error('No screen source found for area recording')
          }
        } else {
          throw new Error('Invalid area coordinates in sourceId')
        }
      } else if (recordingSettings.sourceId) {
        primarySource = sources.find(s => s.id === recordingSettings.sourceId)
        if (!primarySource) {
          throw new Error(`Selected source ${recordingSettings.sourceId} is no longer available. Please select a different source.`)
        }
        logger.info(`Using user-selected source: ${primarySource.name} (${primarySource.id})`)
        
        // For window sources, try to get the actual window bounds
        if (!primarySource.id.startsWith('screen:') && window.electronAPI?.getSourceBounds) {
          try {
            const bounds = await window.electronAPI.getSourceBounds(primarySource.id)
            if (bounds) {
              captureAreaBounds = bounds
              logger.info(`Window bounds detected: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`)
            }
          } catch (error) {
            logger.warn('Could not get window bounds:', error)
          }
        }
      } else {
        // Only auto-select if no sourceId was provided
        if (recordingSettings.area === 'window') {
          // For window recording, user must select a source
          throw new Error('Window recording requires selecting a specific window source')
        } else if (recordingSettings.area === 'region') {
          // For region recording, use the entire screen
          primarySource = sources.find((s) =>
            s.id.startsWith('screen:') ||
            s.name.toLowerCase().includes('entire screen') ||
            s.name.toLowerCase().includes('screen 1')
          )
        } else {
          // Default to fullscreen recording
          primarySource = sources.find((s) =>
            s.id.startsWith('screen:') ||
            s.name.toLowerCase().includes('entire screen') ||
            s.name.toLowerCase().includes('screen 1')
          )
        }

        if (!primarySource) {
          throw new Error('No suitable recording source found. Please check screen recording permissions.')
        }
      }

      logger.info(`Using ${recordingSettings.area} source: ${primarySource.name} (${primarySource.id})`)

      // Capture screen dimensions for dock exclusion
      await this.captureScreenInfo(primarySource.id, captureAreaBounds)

      // Check and request screen recording permission first
      await this.checkScreenRecordingPermission()

      // Get media stream from desktop capturer with audio support
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
              // Video track ended - stop recording gracefully
              logger.info('Video track ended - stopping recording')
              if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                try {
                  this.mediaRecorder.stop()
                } catch (e) {
                  logger.error('Failed to stop MediaRecorder after video track ended:', e)
                }
              }
            }
          }

          track.onmute = () => {
            logger.warn(`Track muted: ${track.kind} - ${track.label}`)
          }
        })

        // Check audio status
        const audioTracks = this.stream.getAudioTracks()
        if (hasAudio && audioTracks.length > 0) {
          logger.info(`✅ Audio tracks captured: ${audioTracks.length}`)
        } else if (hasAudio) {
          logger.warn('⚠️ Audio requested but not available - macOS requires virtual audio device')
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

      this.mediaRecorder.onerror = (event) => {
        logger.error('MediaRecorder error:', event)
        
        // Check what type of error this is
        const errorMessage = (event as any).error?.message || ''
        const isAudioError = errorMessage.includes('audio') || errorMessage.includes('Audio')
        const isStreamError = errorMessage.includes('Tracks') || errorMessage.includes('Stream')
        
        if (isAudioError || isStreamError) {
          logger.warn('Audio/Stream error detected, attempting to continue with video only')
          
          // Remove audio tracks to prevent further errors
          const audioTracks = this.stream?.getAudioTracks()
          if (audioTracks && audioTracks.length > 0) {
            audioTracks.forEach(track => {
              track.stop()
              this.stream?.removeTrack(track)
            })
            logger.info('Removed audio tracks, continuing with video only')
          }
          
          // Check if we still have a valid video track
          const videoTracks = this.stream?.getVideoTracks()
          if (videoTracks && videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
            logger.info('Video track still active, recording continues')
            // Don't stop the recording, let it continue
            return
          }
        }
        
        // For critical errors, stop the recording
        logger.error('Critical recording error, stopping...')
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop()
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

  async stopRecording(): Promise<ElectronRecordingResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Not recording')
    }

    logger.info(`Stopping screen recording (MediaRecorder state: ${this.mediaRecorder.state})`)

    return new Promise(async (resolve, reject) => {
      // Check if MediaRecorder is already stopped/inactive
      if (this.mediaRecorder!.state === 'inactive') {
        logger.warn('MediaRecorder already inactive - returning available data')
        
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })
        
        logger.info(`Recording recovered: ${duration}ms, ${video.size} bytes, ${this.chunks.length} chunks`)
        
        this.cleanup()
        this.isRecording = false
        
        resolve({
          video,
          duration,
          metadata: this.metadata,
          captureArea: this.captureArea,
          effectsApplied: ['electron-desktop-capture'],
          processingTime: 0
        })
        return
      }

      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })

        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes, ${this.metadata.length} metadata events`)

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
          processingTime: 0
        })
      }

      this.mediaRecorder!.onerror = (error) => {
        logger.error('MediaRecorder error during stop:', error)
        // Don't reject - try to return what we have
        if (this.chunks.length > 0) {
          const duration = Date.now() - this.startTime
          const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })
          this.cleanup()
          resolve({
            video,
            duration,
            metadata: this.metadata,
            captureArea: this.captureArea,
            effectsApplied: ['electron-desktop-capture', 'error-recovery'],
            processingTime: 0
          })
        } else {
          reject(error)
        }
      }
      
      this.isRecording = false
      this.stopMouseTracking()
      
      try {
        this.mediaRecorder!.stop()
      } catch (e) {
        logger.error('Error calling stop on MediaRecorder:', e)
        // If stop fails, try to return what we have
        if (this.chunks.length > 0) {
          const duration = Date.now() - this.startTime
          const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })
          this.cleanup()
          resolve({
            video,
            duration,
            metadata: this.metadata,
            captureArea: this.captureArea,
            effectsApplied: ['electron-desktop-capture', 'stop-error-recovery'],
            processingTime: 0
          })
        } else {
          reject(e)
        }
      }
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

      logger.debug(`Found ${sources.length} desktop sources`, sources.map((s) => ({ name: s.name, id: s.id })))

      return sources
    } catch (error) {
      logger.error('Failed to get desktop sources:', error)
      throw new ElectronError('Failed to access desktop sources', 'getDesktopSources')
    }
  }

  private async captureScreenInfo(sourceId: string, areaSelection?: { x: number; y: number; width: number; height: number }): Promise<void> {
    try {
      // Determine if this is a window or screen recording
      const isWindow = !sourceId.startsWith('screen:')
      
      if (isWindow) {
        // For window recording, store the source type
        // Actual bounds come from the video stream dimensions
        this.captureArea = {
          fullBounds: { x: 0, y: 0, width: 0, height: 0 },
          workArea: { x: 0, y: 0, width: 0, height: 0 },
          scaleFactor: 1,
          sourceType: 'window',
          sourceId: sourceId
        }
        
        logger.info('Window recording mode', { sourceId })
      } else if (window.electronAPI?.getScreens) {
        // Get screen information from Electron
        const screens = await window.electronAPI.getScreens()

        // Find the screen that matches our source
        // Source ID format is usually "screen:ID:0" 
        const screenIdMatch = sourceId.match(/screen:(\d+):/)
        
        if (!screenIdMatch) {
          throw new Error(`Invalid screen source ID format: ${sourceId}`)
        }

        const screenId = parseInt(screenIdMatch[1])
        const screen = screens.find((s) => s.id === screenId)

        if (screen) {
          // If we have an area selection, use those bounds instead
          if (areaSelection) {
            this.captureArea = {
              fullBounds: areaSelection,
              workArea: areaSelection,
              scaleFactor: screen.scaleFactor ?? 1,
              sourceType: 'screen',
              sourceId: sourceId
            }
            
            logger.info('Area selection captured', {
              sourceId,
              sourceType: 'area',
              bounds: areaSelection,
              scaleFactor: this.captureArea.scaleFactor
            })
          } else {
            this.captureArea = {
              fullBounds: screen.bounds,
              workArea: screen.workArea,
              scaleFactor: screen.scaleFactor ?? 1,
              sourceType: 'screen',
              sourceId: sourceId
            }

            logger.info('Screen info captured', {
              sourceId,
              sourceType: 'screen',
              fullBounds: this.captureArea.fullBounds,
              workArea: this.captureArea.workArea,
              scaleFactor: this.captureArea.scaleFactor
            })
          }
        } else {
          throw new Error(`Screen with ID ${screenId} not found`)
        }
      } else {
        throw new Error('getScreens API not available')
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
      logger.warn('Native mouse tracking not available')
    }

    // Global click detection handled by uiohook-napi in main process

    // Set up event listeners for native mouse events
    const handleMouseMove = (_event: unknown, data: any) => {
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

        // Transform coordinates to be relative to capture area
        let transformedX = data.x
        let transformedY = data.y
        let isWithinBounds = true
        
        if (this.captureArea?.fullBounds) {
          // Check if cursor is within capture area
          isWithinBounds = data.x >= this.captureArea.fullBounds.x &&
                          data.x < this.captureArea.fullBounds.x + this.captureArea.fullBounds.width &&
                          data.y >= this.captureArea.fullBounds.y &&
                          data.y < this.captureArea.fullBounds.y + this.captureArea.fullBounds.height
          
          // Adjust mouse coordinates to be relative to the capture area
          transformedX = data.x - this.captureArea.fullBounds.x
          transformedY = data.y - this.captureArea.fullBounds.y
        }

        // Only record mouse events when within bounds
        // For full screen recording, always record. For partial, only when in bounds.
        if (isWithinBounds) {
          // Debug logging for cursor type
          if (this.captureArea?.fullBounds && this.metadata.length % 50 === 0) {
            console.log('📍 Recording cursor event:', {
              cursorType: data.cursorType,
              sourceType: data.sourceType,
              sourceId: data.sourceId,
              isWithinBounds,
              x: transformedX,
              y: transformedY
            })
          }
          
          this.metadata.push({
            timestamp,
            mouseX: transformedX,  // Capture-relative position
            mouseY: transformedY,  // Capture-relative position
            eventType: 'mouse',
            velocity,
            captureWidth: this.captureArea?.fullBounds?.width,
            captureHeight: this.captureArea?.fullBounds?.height,
            isWithinBounds,  // Whether cursor is within capture area
            scaleFactor: data.scaleFactor,
            cursorType: data.cursorType  // Save cursor type from main process
          })
        }

        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = now
      }
    }

    const handleMouseClick = (_event: unknown, data: any) => {
      if (this.isRecording) {
        const timestamp = Date.now() - this.startTime

        // Transform coordinates to be relative to capture area
        let transformedX = data.x
        let transformedY = data.y
        let isWithinBounds = true
        
        if (this.captureArea?.fullBounds) {
          // Check if click is within capture area
          isWithinBounds = data.x >= this.captureArea.fullBounds.x &&
                          data.x < this.captureArea.fullBounds.x + this.captureArea.fullBounds.width &&
                          data.y >= this.captureArea.fullBounds.y &&
                          data.y < this.captureArea.fullBounds.y + this.captureArea.fullBounds.height
          
          // Adjust mouse coordinates to be relative to the capture area
          transformedX = data.x - this.captureArea.fullBounds.x
          transformedY = data.y - this.captureArea.fullBounds.y
        }

        // Only record clicks within the capture area
        if (isWithinBounds) {
          this.metadata.push({
            timestamp,
            mouseX: transformedX,  // Capture-relative position
            mouseY: transformedY,  // Capture-relative position
            eventType: 'click',
            key: data.button,
            captureWidth: this.captureArea?.fullBounds?.width,
            captureHeight: this.captureArea?.fullBounds?.height,
            scaleFactor: data.scaleFactor,
            cursorType: data.cursorType  // Save cursor type for click events too
          })
        }

        this.lastMouseX = transformedX
        this.lastMouseY = transformedY
        this.lastMouseTime = Date.now()
      }
    }

    const handleScroll = (_event: unknown, data: any) => {
      if (this.isRecording && data.deltaX !== 0 || data.deltaY !== 0) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: data.x,
          mouseY: data.y,
          eventType: 'scroll',
          scrollDelta: { x: data.deltaX, y: data.deltaY },
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

    // Start native tracking with source information
    const result = await window.electronAPI.startMouseTracking({
      intervalMs: 16, // 60fps
      sourceId: this.captureArea?.sourceId,
      sourceType: this.captureArea?.sourceType || 'screen'
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
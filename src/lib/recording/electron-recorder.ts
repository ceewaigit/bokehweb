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
  scaleFactor?: number
  cursorType?: string  // Track cursor type for accurate rendering
  sourceBounds?: { x: number; y: number; width: number; height: number }  // Window/area bounds for coordinate mapping
  sourceType?: 'screen' | 'window' | 'area'  // Type of source being recorded
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
  private recordingSettings?: RecordingSettings
  private dataRequestInterval: NodeJS.Timeout | null = null
  private videoWidth?: number
  private videoHeight?: number

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
    
    // Store recording settings for later use
    this.recordingSettings = recordingSettings

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

      // Get the actual resolution to use for constraints
      // This prevents upscaling to 8K on high-res displays
      let targetWidth: number | undefined
      let targetHeight: number | undefined
      
      if (this.captureArea?.fullBounds) {
        // Use the actual screen/window dimensions with scale factor
        const scaleFactor = this.captureArea.scaleFactor || 1
        targetWidth = Math.floor(this.captureArea.fullBounds.width * scaleFactor)
        targetHeight = Math.floor(this.captureArea.fullBounds.height * scaleFactor)
        
        logger.info(`Setting capture resolution to ${targetWidth}x${targetHeight} (scale: ${scaleFactor})`)
      }

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
            chromeMediaSourceId: primarySource.id,
            // Add resolution constraints to prevent upscaling
            ...(targetWidth && targetHeight ? {
              maxWidth: targetWidth,
              maxHeight: targetHeight,
              minWidth: targetWidth,
              minHeight: targetHeight
            } : {})
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

      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        logger.info('Video track settings', settings)
        
        // Store video dimensions for coordinate mapping
        this.videoWidth = settings.width
        this.videoHeight = settings.height
      } else {
        logger.warn('No video track found in stream')
      }

      // Use VP8 codec for stability
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
          logger.debug(`Recording chunk #${this.chunks.length}: ${event.data.size} bytes`)
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
        
        const errorMessage = (event as any).error?.message || ''
        const isAudioError = errorMessage.includes('audio') || errorMessage.includes('Audio')
        
        if (isAudioError) {
          logger.warn('Audio error detected, continuing with video only')
          
          // Remove audio tracks to continue recording
          const audioTracks = this.stream?.getAudioTracks()
          audioTracks?.forEach(track => {
            track.stop()
            this.stream?.removeTrack(track)
          })
          
          // Continue recording if video track is still active
          const videoTracks = this.stream?.getVideoTracks()
          if (videoTracks?.[0]?.readyState === 'live') {
            return
          }
        }
        
        // Stop recording on critical errors
        if (this.mediaRecorder?.state === 'recording') {
          this.mediaRecorder.stop()
        }
      }

      // Set recording flag BEFORE starting mouse tracking
      // This ensures mouse events are captured from the very beginning
      this.isRecording = true
      this.startTime = Date.now()

      // Always capture mouse metadata to power effects
      await this.startMouseTracking()

      // Start recording with immediate data collection
      // Don't use timeslice - let MediaRecorder handle buffering
      this.mediaRecorder.start()

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
          captureArea: this.captureArea
        })
        return
      }

      this.mediaRecorder!.onstop = async () => {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'video/webm' })

        // Count event types for debugging
        const mouseEvents = this.metadata.filter(m => m.eventType === 'mouse').length
        const clickEvents = this.metadata.filter(m => m.eventType === 'click').length
        
        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes`)
        logger.info(`Metadata captured: ${this.metadata.length} total events (${mouseEvents} mouse, ${clickEvents} clicks)`)
        logger.info('Final capture area', this.captureArea)

        // Store capture area before cleanup
        const finalCaptureArea = this.captureArea
        
        this.cleanup()

        resolve({
          video,
          duration,
          metadata: this.metadata,
          captureArea: finalCaptureArea
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
            captureArea: this.captureArea
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
            captureArea: this.captureArea
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
        // For window recording, try to get window bounds and store in capture area
        if (window.electronAPI?.getSourceBounds) {
          try {
            const windowBounds = await window.electronAPI.getSourceBounds(sourceId)
            if (windowBounds) {
              // Store window bounds for metadata
              this.captureArea = {
                fullBounds: windowBounds,
                workArea: windowBounds,
                scaleFactor: (windowBounds as any).scaleFactor || 1,
                sourceType: 'window',
                sourceId
              }
              
              logger.info('Window recording mode with bounds', { 
                sourceId, 
                bounds: windowBounds
              })
            } else {
              // No bounds available
              this.captureArea = undefined
              logger.info('Window recording mode without bounds', { sourceId })
            }
          } catch (error) {
            logger.warn('Failed to get window bounds:', error)
            this.captureArea = undefined
          }
        } else {
          this.captureArea = undefined
          logger.info('Window recording mode (no bounds API)', { sourceId })
        }
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
            const areaSourceId = `area:${areaSelection.x},${areaSelection.y},${areaSelection.width},${areaSelection.height}`;
            this.captureArea = {
              fullBounds: areaSelection,
              workArea: areaSelection,
              scaleFactor: screen.scaleFactor ?? 1,
              sourceType: 'screen',
              sourceId: areaSourceId // Keep area info for cursor type detection
            }
            
            logger.info('Area selection captured', {
              sourceId: areaSourceId,
              sourceType: 'area',
              bounds: areaSelection,
              scaleFactor: this.captureArea.scaleFactor
            })
          } else {
            // For full screen recording, store the actual screen dimensions
            // This is crucial for correct cursor coordinate mapping
            this.captureArea = {
              fullBounds: screen.bounds,
              workArea: screen.workArea,
              scaleFactor: screen.scaleFactor ?? 1,
              sourceType: 'screen',
              sourceId
            }
            
            logger.info('Full screen recording mode with proper dimensions', {
              sourceId,
              sourceType: 'screen',
              screenBounds: screen.bounds,
              scaleFactor: screen.scaleFactor ?? 1
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

  private transformCoordinates(data: { x: number; y: number; scaleFactor?: number }): { 
    transformedX: number
    transformedY: number
    isWithinBounds: boolean
    captureW: number
    captureH: number
  } {
    let transformedX = data.x
    let transformedY = data.y
    let isWithinBounds = true
    
    if (this.captureArea?.fullBounds) {
      // Window or area recording - adjust coordinates relative to capture area
      isWithinBounds = data.x >= this.captureArea.fullBounds.x &&
                      data.x < this.captureArea.fullBounds.x + this.captureArea.fullBounds.width &&
                      data.y >= this.captureArea.fullBounds.y &&
                      data.y < this.captureArea.fullBounds.y + this.captureArea.fullBounds.height
      
      transformedX = data.x - this.captureArea.fullBounds.x
      transformedY = data.y - this.captureArea.fullBounds.y
      
      const captureW = this.captureArea.fullBounds.width
      const captureH = this.captureArea.fullBounds.height
      return { transformedX, transformedY, isWithinBounds, captureW, captureH }
    } else {
      // Fallback for when captureArea is not available (shouldn't happen normally)
      logger.warn('No capture area available, using video dimensions as fallback')
      
      if (data.scaleFactor && data.scaleFactor > 1) {
        transformedX = data.x * data.scaleFactor
        transformedY = data.y * data.scaleFactor
      }
      
      if (!this.videoWidth || !this.videoHeight) {
        throw new Error('Video dimensions not available for coordinate transformation')
      }
      const captureW = this.videoWidth
      const captureH = this.videoHeight
      return { transformedX, transformedY, isWithinBounds, captureW, captureH }
    }
  }

  private async startMouseTracking(): Promise<void> {
    logger.info('Starting native mouse tracking for recording')

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
      // No need to check isRecording here since handlers are only active during recording
      // This ensures we capture events from the very first moment
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

      // Transform coordinates using shared method
      const { transformedX, transformedY, isWithinBounds, captureW, captureH } = this.transformCoordinates(data)

      // Only record mouse events when within bounds
      if (isWithinBounds) {
        const previousLength = this.metadata.length
        
        this.metadata.push({
          timestamp,
          mouseX: transformedX,  // Capture-relative position
          mouseY: transformedY,  // Capture-relative position
          eventType: 'mouse',
          velocity,
          captureWidth: captureW,
          captureHeight: captureH,
          scaleFactor: data.scaleFactor,
          cursorType: data.cursorType,  // Save cursor type from main process
          sourceBounds: this.captureArea?.fullBounds,  // Include source bounds for later use
          sourceType: this.captureArea?.sourceType || 'screen'  // Include source type
        })
        
        // Log first mouse event capture
        if (previousLength === 0) {
          logger.info(`✅ First mouse event captured at (${transformedX.toFixed(1)}, ${transformedY.toFixed(1)}) with cursor type: ${data.cursorType}`)
        }
        
        // Log every 100th mouse event to confirm capture
        if (this.metadata.length % 100 === 0) {
          logger.debug(`Mouse events captured: ${this.metadata.length}, last position: (${transformedX.toFixed(1)}, ${transformedY.toFixed(1)})`)
        }
      }

      this.lastMouseX = transformedX
      this.lastMouseY = transformedY
      this.lastMouseTime = now
    }

    const handleMouseClick = (_event: unknown, data: any) => {
      // Also remove the isRecording check here for consistency
      const timestamp = Date.now() - this.startTime

      // Transform coordinates using shared method
      const { transformedX, transformedY, isWithinBounds, captureW, captureH } = this.transformCoordinates(data)

      // Only record clicks within the capture area
      if (isWithinBounds) {
        const clickCount = this.metadata.filter(m => m.eventType === 'click').length
        
        this.metadata.push({
          timestamp,
          mouseX: transformedX,  // Capture-relative position
          mouseY: transformedY,  // Capture-relative position
          eventType: 'click',
          key: data.button,
          captureWidth: captureW,
          captureHeight: captureH,
          scaleFactor: data.scaleFactor,
          cursorType: data.cursorType,  // Save cursor type for click events too
          sourceBounds: this.captureArea?.fullBounds,  // Include source bounds
          sourceType: this.captureArea?.sourceType  // Include source type
        })
        
        // Log first click event
        if (clickCount === 0) {
          logger.info(`✅ First click event captured at (${transformedX.toFixed(1)}, ${transformedY.toFixed(1)})`)
        }
      }

      this.lastMouseX = transformedX
      this.lastMouseY = transformedY
      this.lastMouseTime = Date.now()
    }

    const handleScroll = (_event: unknown, data: any) => {
      if (this.isRecording && (data.deltaX !== 0 || data.deltaY !== 0)) {
        const { transformedX, transformedY, isWithinBounds, captureW, captureH } = this.transformCoordinates(data)
        
        if (isWithinBounds) {
          this.metadata.push({
            timestamp: Date.now() - this.startTime,
            mouseX: transformedX,
            mouseY: transformedY,
            eventType: 'scroll',
            scrollDelta: { x: data.deltaX, y: data.deltaY },
            captureWidth: captureW,
            captureHeight: captureH
          })
        }
      }
    }

    // Register event listeners
    window.electronAPI.onMouseMove(handleMouseMove)
    window.electronAPI.onMouseClick(handleMouseClick)
    logger.debug('Mouse event listeners registered')

    // Add scroll handler if available
    if (window.electronAPI.onScroll) {
      window.electronAPI.onScroll(handleScroll)
    }

    // Start native tracking with source information
    // For full screen/window recordings without captureArea, we still need to pass the source info
    const sourceId = this.captureArea?.sourceId || this.recordingSettings?.sourceId || 'screen:unknown'
    const sourceType = this.captureArea?.sourceType || (this.recordingSettings?.area === 'window' ? 'window' : 'screen')
    
    logger.info('Starting mouse tracking with:', {
      sourceId,
      sourceType,
      isAreaRecording: sourceId?.includes('area:')
    })
    
    const result = await window.electronAPI.startMouseTracking({
      intervalMs: 16, // 60fps
      sourceId,
      sourceType
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
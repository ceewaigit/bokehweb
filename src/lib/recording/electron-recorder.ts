/**
 * Electron-based screen recorder using desktopCapturer
 * Provides native screen recording capabilities with system-level access
 */

import type { RecordingSettings } from '@/types'
import type { EnhancementSettings } from './screen-recorder'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/core/errors'

export interface ElectronRecordingResult {
  video: Blob
  duration: number
  metadata: ElectronMetadata[]
  effectsApplied: string[]
  processingTime: number
}

export interface ElectronMetadata {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'keypress'
  key?: string
  screenId?: string
}

export class ElectronRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private isRecording = false
  private startTime = 0
  private metadata: ElectronMetadata[] = []
  private mouseTracker: NodeJS.Timeout | null = null

  constructor() {
    logger.debug('ElectronRecorder initialized')
  }

  async startRecording(recordingSettings: RecordingSettings, enhancementSettings?: EnhancementSettings): Promise<void> {
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

      // Check and request screen recording permission first
      await this.checkScreenRecordingPermission()

      // Get media stream from desktop capturer with audio support
      const hasAudio = recordingSettings.audioInput !== 'none'
      logger.debug('Requesting media stream with constraints', {
        audio: hasAudio,
        sourceId: primarySource.id
      })

      // Add timeout to getUserMedia call to prevent hanging
      const getUserMediaWithTimeout = (constraints: any, timeoutMs = 10000) => {
        return Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Screen recording permission timeout - please grant access in System Preferences')), timeoutMs)
          )
        ])
      }

      // Get the proper constraints from the main process
      const constraints = await window.electronAPI?.getDesktopStream?.(primarySource.id) || {
        audio: hasAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primarySource.id,
            minWidth: 1280,
            maxWidth: 4096,
            minHeight: 720,
            maxHeight: 2160
          }
        }
      }
      logger.debug('Got stream constraints', constraints)

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
        
        // If that fails, try a different approach
        // Some Electron versions require different constraint format
        const fallbackConstraints = {
          audio: hasAudio,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: primarySource.id
            }
          } as any
        }
        
        logger.debug('Trying fallback constraints')
        
        try {
          this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints) as MediaStream
          logger.info('Stream acquired with fallback constraints')
        } catch (fallbackError) {
          logger.error('Fallback also failed:', fallbackError)
          throw new ElectronError(`Failed to capture desktop: ${fallbackError}`, 'getUserMedia')
        }
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

      // Start mouse tracking if effects are enabled
      if (enhancementSettings) {
        await this.startMouseTracking()
      }

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

    return new Promise((resolve, reject) => {
      this.mediaRecorder!.onstop = () => {
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
      const testStream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: {
            // @ts-ignore - Electron-specific constraint
            mandatory: {
              chromeMediaSource: 'desktop',
              maxWidth: 1,
              maxHeight: 1,
              maxFrameRate: 1
            }
          }
        }),
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

    // Set up event listeners for native mouse events
    const handleMouseMove = (_event: any, data: any) => {
      if (this.isRecording) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: data.x,
          mouseY: data.y,
          eventType: 'mouse'
        })
      }
    }

    const handleMouseClick = (_event: any, data: any) => {
      if (this.isRecording) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: data.x,
          mouseY: data.y,
          eventType: 'click'
        })
      }
    }

    // Register event listeners
    window.electronAPI.onMouseMove(handleMouseMove)
    window.electronAPI.onMouseClick(handleMouseClick)

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

    logger.debug('ElectronRecorder cleaned up')
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording
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
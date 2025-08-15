/**
 * Simple Electron screen recorder
 */

import type { RecordingSettings } from '@/types'
import { logger } from '@/lib/utils/logger'

export interface ElectronRecordingResult {
  video: Blob
  duration: number
  metadata: MouseEvent[]
}

export interface MouseEvent {
  timestamp: number
  x: number
  y: number
  type: 'move' | 'click'
}

export class ElectronRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private isRecording = false
  private startTime = 0
  private metadata: MouseEvent[] = []

  async startRecording(settings: RecordingSettings): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording')
    }

    logger.info('Starting screen recording')

    try {
      // Get screen sources
      const sources = await this.getSources()
      if (!sources.length) {
        throw new Error('No screen sources available')
      }

      // Use primary screen
      const source = sources.find(s => s.id.startsWith('screen:')) || sources[0]
      logger.info(`Using source: ${source.name}`)

      // Get media stream
      const constraints: any = {
        audio: settings.audioInput !== 'none',
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id
          }
        }
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      logger.info('Stream acquired')

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps
      })

      this.chunks = []
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data)
        }
      }

      // Start mouse tracking
      this.startMouseTracking()

      // Start recording
      this.mediaRecorder.start(1000)
      this.isRecording = true
      this.startTime = Date.now()

      logger.info('Recording started')

    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  async stopRecording(): Promise<ElectronRecordingResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Not recording')
    }

    logger.info('Stopping recording')

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const duration = Date.now() - this.startTime
        const video = new Blob(this.chunks, { type: 'video/webm' })

        logger.info(`Recording complete: ${duration}ms, ${video.size} bytes`)

        this.cleanup()

        resolve({
          video,
          duration,
          metadata: this.metadata
        })
      }

      this.isRecording = false
      this.stopMouseTracking()
      this.mediaRecorder!.stop()
    })
  }

  private async getSources(): Promise<any[]> {
    if (!window.electronAPI?.getDesktopSources) {
      throw new Error('Desktop capture API not available')
    }

    return await window.electronAPI.getDesktopSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1, height: 1 } // Don't need thumbnails
    })
  }

  private startMouseTracking(): void {
    if (!window.electronAPI?.startMouseTracking) {
      logger.warn('Mouse tracking not available')
      return
    }

    // Listen for mouse events
    window.electronAPI.onMouseMove((_: any, data: any) => {
      if (this.isRecording) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          x: data.x,
          y: data.y,
          type: 'move'
        })
      }
    })

    window.electronAPI.onMouseClick((_: any, data: any) => {
      if (this.isRecording) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          x: data.x,
          y: data.y,
          type: 'click'
        })
      }
    })

    // Start tracking
    window.electronAPI.startMouseTracking({ intervalMs: 50 }) // 20fps is enough
  }

  private stopMouseTracking(): void {
    window.electronAPI?.stopMouseTracking()
    window.electronAPI?.removeAllMouseListeners()
  }

  private cleanup(): void {
    this.isRecording = false
    this.stopMouseTracking()

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.mediaRecorder = null
    this.chunks = []
    this.metadata = []
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording
  }

  getState(): 'idle' | 'recording' {
    return this.isRecording ? 'recording' : 'idle'
  }
}
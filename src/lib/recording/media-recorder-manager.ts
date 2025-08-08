"use client"

import type { RecordingSettings } from '@/types'

export interface MediaRecorderResult {
  video: Blob
  duration: number
}

export class MediaRecorderManager {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startTime = 0
  private _isRecording = false

  constructor(private stream: MediaStream) {}

  async start(settings: RecordingSettings): Promise<void> {
    if (this._isRecording) {
      throw new Error('Already recording')
    }

    const options: MediaRecorderOptions = {
      mimeType: this.getBestMimeType(settings.format),
      videoBitsPerSecond: this.getBitrate(settings.quality),
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options)
    this.chunks = []
    this.setupEventHandlers()

    this.mediaRecorder.start(1000) // Prevent duration issues
    this._isRecording = true
    this.startTime = Date.now()
  }

  async stop(): Promise<MediaRecorderResult> {
    if (!this._isRecording || !this.mediaRecorder) {
      console.log('⚠️ MediaRecorderManager.stop called but not recording')
      throw new Error('Not recording')
    }

    return new Promise((resolve, reject) => {
      this.mediaRecorder!.onstop = () => {
        const duration = Date.now() - this.startTime
        // Use the actual MIME type from the MediaRecorder
        const mimeType = this.mediaRecorder!.mimeType || 'video/webm'
        const video = new Blob(this.chunks, { type: mimeType })
        
        this._isRecording = false
        this.cleanup()
        
        resolve({ video, duration })
      }

      this.mediaRecorder!.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`))
      }

      this.mediaRecorder!.stop()
    })
  }

  private setupEventHandlers(): void {
    if (!this.mediaRecorder) return

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data)
      }
    }
  }

  private getBestMimeType(format: string): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    throw new Error('No supported video codec found')
  }

  private getBitrate(quality: string): number {
    switch (quality) {
      case 'low': return 1000000    // 1 Mbps
      case 'medium': return 2500000 // 2.5 Mbps
      case 'high': return 5000000   // 5 Mbps
      default: return 2500000
    }
  }

  private cleanup(): void {
    this.mediaRecorder = null
    this.chunks = []
  }

  pause(): void {
    if (this._isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
    }
  }

  resume(): void {
    if (this._isRecording && this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
    }
  }

  isPaused(): boolean {
    return this.mediaRecorder?.state === 'paused' || false
  }

  isRecording(): boolean {
    return this._isRecording
  }

  getDuration(): number {
    return this._isRecording ? Date.now() - this.startTime : 0
  }
}
"use client"

import { CursorRenderer } from '../effects/cursor-renderer'
import { ZoomEngine } from '../effects/zoom-engine'

export interface ExportProgress {
  progress: number
  phase: 'preparing' | 'processing' | 'encoding' | 'complete' | 'error'
  message?: string
  currentFrame?: number
  totalFrames?: number
}

export interface ExportOptions {
  format?: 'mp4' | 'webm' | 'gif'
  quality?: 'low' | 'medium' | 'high' | 'ultra'
  framerate?: number
  resolution?: { width: number; height: number }
  enableCursor?: boolean
  enableZoom?: boolean
  enableEffects?: boolean
}

export class EffectsExportEngine {
  private processingCanvas: HTMLCanvasElement | null = null
  private processingCtx: CanvasRenderingContext2D | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  async exportWithEffects(
    videoBlob: Blob,
    metadata: any[],
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const {
      format = 'mp4',
      quality = 'high',
      framerate = 60,
      resolution,
      enableCursor = true,
      enableZoom = true,
      enableEffects = true
    } = options

    try {
      onProgress?.({
        progress: 0,
        phase: 'preparing',
        message: 'Loading video...'
      })

      // Create video element
      const video = document.createElement('video')
      video.src = URL.createObjectURL(videoBlob)
      video.muted = true

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve
        video.onerror = reject
      })

      const videoWidth = resolution?.width || video.videoWidth
      const videoHeight = resolution?.height || video.videoHeight
      const videoDuration = video.duration

      // Create processing canvas
      this.processingCanvas = document.createElement('canvas')
      this.processingCanvas.width = videoWidth
      this.processingCanvas.height = videoHeight
      this.processingCtx = this.processingCanvas.getContext('2d')!

      // Initialize effects if enabled
      let zoomEngine: ZoomEngine | null = null
      let cursorRenderer: CursorRenderer | null = null

      if (enableEffects && enableZoom && metadata.length > 0) {
        zoomEngine = new ZoomEngine({
          enabled: true,
          sensitivity: 1.0,
          maxZoom: 2.0,
          clickZoom: true
        })

        zoomEngine.generateKeyframes(
          metadata,
          videoDuration * 1000,
          videoWidth,
          videoHeight
        )
      }

      if (enableEffects && enableCursor && metadata.length > 0) {
        cursorRenderer = new CursorRenderer({
          size: 1.2,
          color: '#ffffff',
          clickColor: '#3b82f6'
        })
      }

      onProgress?.({
        progress: 10,
        phase: 'processing',
        message: 'Setting up export...'
      })

      // Set up MediaRecorder
      const stream = this.processingCanvas.captureStream(framerate)
      const mimeType = this.getMimeType(format, quality)

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: this.getBitrate(quality)
      })

      this.chunks = []
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data)
        }
      }

      // Start recording
      this.mediaRecorder.start()

      // Process video frame by frame
      const totalFrames = Math.ceil(videoDuration * framerate)
      let currentFrame = 0

      const processFrame = () => {
        return new Promise<void>((resolve) => {
          const currentTime = currentFrame / framerate

          if (currentTime >= videoDuration) {
            resolve()
            return
          }

          video.currentTime = currentTime
          video.onseeked = () => {
            // Clear canvas
            this.processingCtx!.clearRect(0, 0, videoWidth, videoHeight)

            // Apply zoom effect if enabled
            if (zoomEngine) {
              const zoom = zoomEngine.getZoomAtTime(currentTime * 1000)
              zoomEngine.applyZoomToCanvas(this.processingCtx!, video, zoom)
            } else {
              // Draw video frame directly
              this.processingCtx!.drawImage(video, 0, 0, videoWidth, videoHeight)
            }

            // Draw cursor if enabled
            if (cursorRenderer && metadata.length > 0) {
              const cursorEvent = metadata.find(m =>
                Math.abs(m.timestamp - currentTime * 1000) < 50
              )

              if (cursorEvent) {
                // Draw cursor
                const cursorSize = 20
                this.processingCtx!.save()

                // Draw cursor shadow
                this.processingCtx!.fillStyle = 'rgba(0,0,0,0.3)'
                this.processingCtx!.beginPath()
                this.processingCtx!.moveTo(cursorEvent.mouseX + 2, cursorEvent.mouseY + 2)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 2, cursorEvent.mouseY + 18)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 6, cursorEvent.mouseY + 14)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 9, cursorEvent.mouseY + 20)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 12, cursorEvent.mouseY + 19)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 9, cursorEvent.mouseY + 13)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 14, cursorEvent.mouseY + 13)
                this.processingCtx!.closePath()
                this.processingCtx!.fill()

                // Draw cursor
                this.processingCtx!.fillStyle = '#ffffff'
                this.processingCtx!.strokeStyle = '#000000'
                this.processingCtx!.lineWidth = 1
                this.processingCtx!.beginPath()
                this.processingCtx!.moveTo(cursorEvent.mouseX, cursorEvent.mouseY)
                this.processingCtx!.lineTo(cursorEvent.mouseX, cursorEvent.mouseY + 16)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 4, cursorEvent.mouseY + 12)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 7, cursorEvent.mouseY + 18)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 10, cursorEvent.mouseY + 17)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 7, cursorEvent.mouseY + 11)
                this.processingCtx!.lineTo(cursorEvent.mouseX + 12, cursorEvent.mouseY + 11)
                this.processingCtx!.closePath()
                this.processingCtx!.fill()
                this.processingCtx!.stroke()

                // Draw click effect if it's a click
                if (cursorEvent.eventType === 'click') {
                  this.processingCtx!.strokeStyle = '#3b82f6'
                  this.processingCtx!.lineWidth = 2
                  this.processingCtx!.globalAlpha = 0.6
                  this.processingCtx!.beginPath()
                  this.processingCtx!.arc(cursorEvent.mouseX, cursorEvent.mouseY, 15, 0, Math.PI * 2)
                  this.processingCtx!.stroke()
                }

                this.processingCtx!.restore()
              }
            }

            currentFrame++
            const progress = 10 + (currentFrame / totalFrames) * 80

            onProgress?.({
              progress,
              phase: 'processing',
              message: `Processing frame ${currentFrame} of ${totalFrames}`,
              currentFrame,
              totalFrames
            })

            // Process next frame
            setTimeout(() => {
              processFrame().then(resolve)
            }, 1000 / framerate)
          }
        })
      }

      // Start processing
      await processFrame()

      // Stop recording
      await new Promise<void>((resolve) => {
        this.mediaRecorder!.onstop = () => resolve()
        this.mediaRecorder!.stop()
      })

      onProgress?.({
        progress: 95,
        phase: 'encoding',
        message: 'Finalizing export...'
      })

      // Create final blob
      const finalBlob = new Blob(this.chunks, { type: mimeType })

      // Cleanup
      URL.revokeObjectURL(video.src)
      if (cursorRenderer) cursorRenderer.dispose()

      onProgress?.({
        progress: 100,
        phase: 'complete',
        message: 'Export complete!'
      })

      return finalBlob

    } catch (error) {
      console.error('Export failed:', error)
      onProgress?.({
        progress: 0,
        phase: 'error',
        message: error instanceof Error ? error.message : 'Export failed'
      })
      throw error
    }
  }

  private getMimeType(format: string, quality: string): string {
    if (format === 'webm') {
      return quality === 'ultra' ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8'
    }
    return 'video/webm' // MediaRecorder doesn't support mp4 directly
  }

  private getBitrate(quality: string): number {
    switch (quality) {
      case 'low': return 1000000 // 1 Mbps
      case 'medium': return 5000000 // 5 Mbps
      case 'high': return 10000000 // 10 Mbps
      case 'ultra': return 20000000 // 20 Mbps
      default: return 10000000
    }
  }
}
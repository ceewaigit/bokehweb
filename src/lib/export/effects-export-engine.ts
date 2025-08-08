"use client"

import { CursorRenderer } from '../effects/cursor-renderer'
import { ZoomEngine } from '../effects/zoom-engine'
import { BackgroundRenderer } from '../effects/background-renderer'
import { FFmpegConverter } from './ffmpeg-converter'

export interface ExportProgress {
  progress: number
  phase: 'preparing' | 'processing' | 'encoding' | 'complete' | 'error'
  message?: string
  currentFrame?: number
  totalFrames?: number
}

export interface ExportOptions {
  format?: 'mp4' | 'webm' | 'gif' | 'mov'
  quality?: 'low' | 'medium' | 'high' | 'ultra'
  framerate?: number
  resolution?: { width: number; height: number }
  enableCursor?: boolean
  enableZoom?: boolean
  enableEffects?: boolean
  enableBackground?: boolean
  background?: {
    type: 'solid' | 'gradient' | 'blur'
    color?: string
    gradient?: {
      colors: string[]
      angle?: number
    }
    padding?: number
    borderRadius?: number
    shadow?: boolean
  }
}

export class EffectsExportEngine {
  private processingCanvas: HTMLCanvasElement | null = null
  private processingCtx: CanvasRenderingContext2D | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private frameCache: Map<string, ImageData> = new Map()
  private lastRenderedFrame: { zoom: any; cursor: any; frameData: ImageData } | null = null

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
      let backgroundRenderer: BackgroundRenderer | null = null

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
          color: '#000000',
          clickColor: '#007AFF',
          cursorStyle: 'macos'
        })
      }

      if (options.enableBackground && options.background) {
        const bg = options.background
        backgroundRenderer = new BackgroundRenderer({
          type: bg.type,
          color: bg.color,
          gradient: bg.gradient ? {
            type: 'linear',
            colors: bg.gradient.colors,
            angle: bg.gradient.angle
          } : undefined,
          padding: bg.padding || 60,
          borderRadius: bg.borderRadius || 12,
          shadow: bg.shadow ? {
            color: 'rgba(0, 0, 0, 0.3)',
            blur: 20,
            offsetX: 0,
            offsetY: 10
          } : undefined
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

      // Process video frame by frame with optimizations
      const totalFrames = Math.ceil(videoDuration * framerate)
      let currentFrame = 0
      let lastZoomState: any = null
      let lastCursorState: any = null
      let consecutiveUnchangedFrames = 0

      const processFrame = () => {
        return new Promise<void>((resolve) => {
          const currentTime = currentFrame / framerate

          if (currentTime >= videoDuration) {
            resolve()
            return
          }

          // Check if we can skip rendering (nothing changed)
          const currentZoom = zoomEngine ? zoomEngine.getZoomAtTime(currentTime * 1000) : null
          const currentCursor = metadata.find(m =>
            Math.abs(m.timestamp - currentTime * 1000) < 50
          )

          const zoomChanged = !lastZoomState ||
            (currentZoom && (
              Math.abs(currentZoom.x - lastZoomState.x) > 0.001 ||
              Math.abs(currentZoom.y - lastZoomState.y) > 0.001 ||
              Math.abs(currentZoom.scale - lastZoomState.scale) > 0.001
            ))

          const cursorChanged = !lastCursorState || !currentCursor ||
            Math.abs(currentCursor.mouseX - lastCursorState.mouseX) > 1 ||
            Math.abs(currentCursor.mouseY - lastCursorState.mouseY) > 1 ||
            currentCursor.eventType !== lastCursorState.eventType

          // If nothing significant changed, we can potentially reuse the last frame
          if (!zoomChanged && !cursorChanged && this.lastRenderedFrame && consecutiveUnchangedFrames < 5) {
            consecutiveUnchangedFrames++
            // Still need to advance frame for timing
            currentFrame++
            const progress = 10 + (currentFrame / totalFrames) * 80
            onProgress?.({
              progress,
              phase: 'processing',
              message: `Processing frame ${currentFrame} of ${totalFrames} (cached)`,
              currentFrame,
              totalFrames
            })
            setTimeout(() => processFrame().then(resolve), 1000 / framerate / 2) // Faster for cached frames
            return
          }

          consecutiveUnchangedFrames = 0
          lastZoomState = currentZoom
          lastCursorState = currentCursor

          video.currentTime = currentTime
          video.onseeked = () => {
            // Clear canvas
            this.processingCtx!.clearRect(0, 0, videoWidth, videoHeight)

            // Apply background if enabled
            if (backgroundRenderer) {
              // Create a temporary canvas for the video frame with zoom
              const tempCanvas = document.createElement('canvas')
              tempCanvas.width = videoWidth
              tempCanvas.height = videoHeight
              const tempCtx = tempCanvas.getContext('2d')!

              // Apply zoom to temp canvas
              if (zoomEngine && currentZoom) {
                zoomEngine.applyZoomToCanvas(tempCtx, video, currentZoom)
              } else {
                tempCtx.drawImage(video, 0, 0, videoWidth, videoHeight)
              }

              // Apply background with video frame
              backgroundRenderer.applyBackground(this.processingCtx!, tempCanvas)
            } else {
              // Apply zoom effect if enabled (no background)
              if (zoomEngine && currentZoom) {
                zoomEngine.applyZoomToCanvas(this.processingCtx!, video, currentZoom)
              } else {
                // Draw video frame directly
                this.processingCtx!.drawImage(video, 0, 0, videoWidth, videoHeight)
              }
            }

            // Draw cursor if enabled with better design
            if (cursorRenderer && currentCursor) {
              this.processingCtx!.save()

              // Enhanced macOS-style cursor
              const scale = 1.2
              const x = currentCursor.mouseX
              const y = currentCursor.mouseY

              // Shadow for depth
              this.processingCtx!.shadowColor = 'rgba(0, 0, 0, 0.3)'
              this.processingCtx!.shadowBlur = 3
              this.processingCtx!.shadowOffsetX = 0
              this.processingCtx!.shadowOffsetY = 2

              // White outline for visibility
              this.processingCtx!.fillStyle = '#ffffff'
              this.processingCtx!.strokeStyle = '#ffffff'
              this.processingCtx!.lineWidth = 2
              this.processingCtx!.beginPath()
              this.processingCtx!.moveTo(x, y)
              this.processingCtx!.lineTo(x, y + 18 * scale)
              this.processingCtx!.lineTo(x + 5 * scale, y + 14 * scale)
              this.processingCtx!.lineTo(x + 8 * scale, y + 21 * scale)
              this.processingCtx!.lineTo(x + 11 * scale, y + 20 * scale)
              this.processingCtx!.lineTo(x + 8 * scale, y + 13 * scale)
              this.processingCtx!.lineTo(x + 13 * scale, y + 13 * scale)
              this.processingCtx!.closePath()
              this.processingCtx!.fill()

              // Main cursor body
              this.processingCtx!.shadowBlur = 0
              this.processingCtx!.fillStyle = '#000000'
              this.processingCtx!.beginPath()
              this.processingCtx!.moveTo(x + 2, y + 2)
              this.processingCtx!.lineTo(x + 2, y + 16 * scale)
              this.processingCtx!.lineTo(x + 5 * scale, y + 13 * scale)
              this.processingCtx!.lineTo(x + 7.5 * scale, y + 19 * scale)
              this.processingCtx!.lineTo(x + 9.5 * scale, y + 18.5 * scale)
              this.processingCtx!.lineTo(x + 7.5 * scale, y + 12 * scale)
              this.processingCtx!.lineTo(x + 11.5 * scale, y + 12 * scale)
              this.processingCtx!.closePath()
              this.processingCtx!.fill()

              // Click animation - ripple effect
              if (currentCursor.eventType === 'click') {
                // Multiple concentric circles for ripple
                for (let i = 0; i < 2; i++) {
                  this.processingCtx!.strokeStyle = '#007AFF'
                  this.processingCtx!.lineWidth = 2 - i * 0.5
                  this.processingCtx!.globalAlpha = 0.6 - i * 0.2
                  this.processingCtx!.beginPath()
                  this.processingCtx!.arc(x + 5, y + 5, 15 + i * 8, 0, Math.PI * 2)
                  this.processingCtx!.stroke()
                }
              }

              this.processingCtx!.restore()
            }

            // Cache the rendered frame
            this.lastRenderedFrame = {
              zoom: currentZoom,
              cursor: currentCursor,
              frameData: this.processingCtx!.getImageData(0, 0, videoWidth, videoHeight)
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

            // Adaptive frame processing speed
            const processingDelay = consecutiveUnchangedFrames > 0 ?
              Math.max(1, 1000 / framerate / 2) : // Faster for static content
              1000 / framerate // Normal speed for changing content

            // Process next frame
            setTimeout(() => {
              processFrame().then(resolve)
            }, processingDelay)
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

      // Create WebM blob first
      const webmBlob = new Blob(this.chunks, { type: mimeType })

      let finalBlob = webmBlob

      // Convert to MP4/MOV/GIF if needed
      if (format === 'mp4' || format === 'mov' || format === 'gif') {
        onProgress?.({
          progress: 90,
          phase: 'encoding',
          message: `Converting to ${format.toUpperCase()}...`
        })

        const converter = new FFmpegConverter()

        if (format === 'mp4') {
          finalBlob = await converter.convertWebMToMP4(webmBlob, (ffmpegProgress) => {
            onProgress?.({
              progress: 90 + (ffmpegProgress * 0.1),
              phase: 'encoding',
              message: `Converting to MP4: ${Math.round(ffmpegProgress * 100)}%`
            })
          })
        } else if (format === 'mov') {
          finalBlob = await converter.convertWebMToMOV(webmBlob, (ffmpegProgress) => {
            onProgress?.({
              progress: 90 + (ffmpegProgress * 0.1),
              phase: 'encoding',
              message: `Converting to MOV: ${Math.round(ffmpegProgress * 100)}%`
            })
          })
        } else if (format === 'gif') {
          finalBlob = await converter.convertToGIF(webmBlob, {
            width: resolution?.width || 480,
            height: resolution?.height || 360,
            fps: framerate || 15
          }, (ffmpegProgress) => {
            onProgress?.({
              progress: 90 + (ffmpegProgress * 0.1),
              phase: 'encoding',
              message: `Converting to GIF: ${Math.round(ffmpegProgress * 100)}%`
            })
          })
        }
      }

      // Cleanup
      URL.revokeObjectURL(video.src)
      if (cursorRenderer) cursorRenderer.dispose()
      if (backgroundRenderer) backgroundRenderer.dispose()
      this.frameCache.clear()
      this.lastRenderedFrame = null

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
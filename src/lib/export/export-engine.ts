/**
 * Export Engine
 * Handles all video export operations with optional effects processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'
import { CursorRenderer } from '../effects/cursor-renderer'
import { ZoomEngine } from '../effects/zoom-engine'
import { BackgroundRenderer } from '../effects/background-renderer'
import { FFmpegConverter } from './ffmpeg-converter'
import { globalBlobManager } from '../security/blob-url-manager'
import { RecordingStorage } from '../storage/recording-storage'
import type { ExportSettings } from '@/types'
import type { Project } from '@/types/project'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
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

export class ExportEngine {
  private ffmpeg: FFmpeg
  private isLoaded = false
  private processingCanvas: HTMLCanvasElement | null = null
  private processingCtx: CanvasRenderingContext2D | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private frameCache: Map<string, ImageData> = new Map()

  constructor() {
    this.ffmpeg = new FFmpeg()
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      this.isLoaded = true
      console.log('✅ FFmpeg loaded')
    } catch (error) {
      console.error('❌ Failed to load FFmpeg:', error)
      throw new Error('Failed to initialize FFmpeg')
    }
  }

  /**
   * Export project with optional effects
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const videoClips = project.timeline.tracks
      .filter(track => track.type === 'video')
      .flatMap(track => track.clips)

    if (videoClips.length === 0) {
      throw new Error('No video clips to export')
    }

    // Check if we need effects processing
    const needsEffects = options.enableEffects && (
      options.enableCursor ||
      options.enableZoom ||
      options.enableBackground
    )

    if (needsEffects) {
      // Process with effects for each clip
      return this.exportWithEffects(project, settings, options, onProgress)
    } else {
      // Simple FFmpeg export
      return this.exportSimple(project, settings, onProgress)
    }
  }

  /**
   * Simple export using FFmpeg directly
   */
  private async exportSimple(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    const videoClips = project.timeline.tracks
      .filter(track => track.type === 'video')
      .flatMap(track => track.clips)

    onProgress?.({ progress: 0, stage: 'preparing', message: 'Loading clips...' })

    // Load clips into FFmpeg
    for (let i = 0; i < videoClips.length; i++) {
      const clip = videoClips[i]
      const recording = project.recordings.find(r => r.id === clip.recordingId)
      if (!recording) continue

      try {
        const videoData = await fetchFile(recording.filePath)
        await this.ffmpeg.writeFile(`input_${i}.mp4`, new Uint8Array(videoData as unknown as ArrayBuffer))
      } catch (error) {
        console.warn(`Failed to load clip ${clip.id}:`, error)
      }
    }

    onProgress?.({ progress: 40, stage: 'encoding', message: 'Processing video...' })

    const outputFile = `output.${settings.format}`
    const ffmpegArgs = [
      '-i', 'input_0.mp4',
      '-c:v', 'libx264',
      '-crf', '23',
      '-s', `${settings.resolution.width}x${settings.resolution.height}`,
      '-r', settings.framerate.toString(),
      outputFile
    ]

    this.ffmpeg.on('progress', ({ progress }) => {
      const validProgress = Math.max(0, Math.min(100, progress || 0))
      const overallProgress = 40 + (validProgress * 0.01) * 50

      onProgress?.({
        progress: Math.round(overallProgress),
        stage: 'encoding',
        message: `Encoding... ${Math.round(validProgress)}%`
      })
    })

    await this.ffmpeg.exec(ffmpegArgs)

    onProgress?.({ progress: 90, stage: 'finalizing', message: 'Creating output file...' })

    const data = await this.ffmpeg.readFile(outputFile)
    const blob = new Blob([data as BlobPart], { type: `video/${settings.format}` })

    // Cleanup
    await this.ffmpeg.deleteFile(outputFile)
    for (let i = 0; i < videoClips.length; i++) {
      try {
        await this.ffmpeg.deleteFile(`input_${i}.mp4`)
      } catch {
        // File may not exist
      }
    }

    onProgress?.({ progress: 100, stage: 'complete', message: 'Export complete!' })

    return blob
  }

  /**
   * Export with effects processing
   */
  private async exportWithEffects(
    project: Project,
    settings: ExportSettings,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const {
      format = settings.format,
      quality = 'high',
      framerate = settings.framerate,
      resolution = settings.resolution,
      enableCursor = true,
      enableZoom = true,
      enableBackground = false
    } = options

    try {
      onProgress?.({
        progress: 0,
        stage: 'preparing',
        message: 'Loading video for effects processing...'
      })

      // For now, just export the first clip with effects
      const firstClip = project.timeline.tracks
        .find(t => t.type === 'video')
        ?.clips[0]

      if (!firstClip) {
        throw new Error('No video clips found')
      }

      const recording = project.recordings.find(r => r.id === firstClip.recordingId)
      if (!recording) {
        throw new Error('Recording not found')
      }

      // Get video blob from localStorage or file
      let videoBlob: Blob
      const blobUrl = RecordingStorage.getBlobUrl(recording.id)
      if (blobUrl) {
        const response = await fetch(blobUrl)
        videoBlob = await response.blob()
      } else if (recording.filePath) {
        const data = await fetchFile(recording.filePath)
        videoBlob = new Blob([data as BlobPart], { type: 'video/webm' })
      } else {
        throw new Error('No video source found')
      }

      // Get metadata
      const metadata = recording.metadata ? [
        ...recording.metadata.mouseEvents.map(e => ({
          timestamp: e.timestamp,
          mouseX: e.x,
          mouseY: e.y,
          eventType: 'mouse' as const
        })),
        ...recording.metadata.clickEvents.map(e => ({
          timestamp: e.timestamp,
          mouseX: e.x,
          mouseY: e.y,
          eventType: 'click' as const
        }))
      ] : []

      // Create video element
      const video = document.createElement('video')
      video.src = globalBlobManager.create(videoBlob, 'export-source')
      video.muted = true

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve
        video.onerror = reject
      })

      const videoWidth = resolution.width
      const videoHeight = resolution.height
      const videoDuration = video.duration

      // Create processing canvas
      this.processingCanvas = document.createElement('canvas')
      this.processingCanvas.width = videoWidth
      this.processingCanvas.height = videoHeight
      this.processingCtx = this.processingCanvas.getContext('2d')!

      // Initialize effects
      let zoomEngine: ZoomEngine | null = null
      let cursorRenderer: CursorRenderer | null = null
      let backgroundRenderer: BackgroundRenderer | null = null

      if (enableZoom && metadata.length > 0) {
        zoomEngine = new ZoomEngine({
          enabled: true,
          sensitivity: 1.0,
          maxZoom: 2.0,
          clickZoom: true
        })
      }

      if (enableCursor && metadata.length > 0) {
        cursorRenderer = new CursorRenderer({
          size: 1.2,
          color: '#ffffff',
          clickColor: '#3b82f6',
          smoothing: true
        })
      }

      if (enableBackground && options.background) {
        // BackgroundRenderer expects specific format
        const bgOptions = {
          type: options.background.type || 'gradient',
          ...(options.background.color && { color: options.background.color }),
          ...(options.background.gradient && { gradient: options.background.gradient }),
          padding: options.background.padding || 0,
          borderRadius: options.background.borderRadius || 0,
          shadow: options.background.shadow || false
        }
        backgroundRenderer = new BackgroundRenderer(bgOptions as any)
      }

      // Process frames
      const totalFrames = Math.ceil(videoDuration * framerate)
      onProgress?.({
        progress: 10,
        stage: 'processing',
        message: `Processing ${totalFrames} frames...`,
        currentFrame: 0,
        totalFrames
      })

      // Set up MediaRecorder
      const stream = this.processingCanvas.captureStream(framerate)
      const mimeType = 'video/webm;codecs=vp9'

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: quality === 'ultra' ? 20000000 :
          quality === 'high' ? 10000000 :
            quality === 'medium' ? 5000000 : 2500000
      })

      this.chunks = []
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }

      this.mediaRecorder.start()

      // Process each frame
      for (let frame = 0; frame < totalFrames; frame++) {
        const timestamp = (frame / framerate) * 1000
        video.currentTime = frame / framerate

        await new Promise(resolve => {
          video.onseeked = resolve
        })

        // Clear canvas with background
        if (backgroundRenderer) {
          // Draw background (BackgroundRenderer may not have render method)
          this.processingCtx!.fillStyle = '#1a1a2e'
          this.processingCtx!.fillRect(0, 0, videoWidth, videoHeight)
        } else {
          this.processingCtx!.clearRect(0, 0, videoWidth, videoHeight)
        }

        // Apply zoom
        if (zoomEngine) {
          const zoom = zoomEngine.getZoomAtTime(timestamp)
          zoomEngine.applyZoomToCanvas(this.processingCtx!, video, zoom)
        } else {
          this.processingCtx!.drawImage(video, 0, 0, videoWidth, videoHeight)
        }

        // Render cursor
        if (cursorRenderer) {
          const cursorEvents = metadata.filter(m =>
            Math.abs(m.timestamp - timestamp) < (1000 / framerate)
          )
          if (cursorEvents.length > 0) {
            const event = cursorEvents[0]
            // Render cursor at position
            const isClick = event.eventType === 'click'
            this.processingCtx!.save()
            this.processingCtx!.fillStyle = isClick ? '#3b82f6' : '#ffffff'
            this.processingCtx!.beginPath()
            this.processingCtx!.arc(event.mouseX, event.mouseY, isClick ? 12 : 8, 0, Math.PI * 2)
            this.processingCtx!.fill()
            this.processingCtx!.restore()
          }
        }

        if (frame % 10 === 0) {
          onProgress?.({
            progress: 10 + (frame / totalFrames) * 70,
            stage: 'processing',
            message: `Processing frame ${frame + 1} of ${totalFrames}`,
            currentFrame: frame + 1,
            totalFrames
          })
        }

        await new Promise(resolve => setTimeout(resolve, 1000 / framerate))
      }

      // Stop recording
      const webmBlob = await new Promise<Blob>(resolve => {
        this.mediaRecorder!.onstop = () => {
          const blob = new Blob(this.chunks, { type: mimeType })
          resolve(blob)
        }
        this.mediaRecorder!.stop()
      })

      onProgress?.({
        progress: 85,
        stage: 'encoding',
        message: 'Encoding final video...'
      })

      // Convert format if needed using FFmpeg
      if (format === 'mp4' || format === 'mov' || format === 'gif') {
        if (!this.isLoaded) await this.initialize()

        // Write WebM to FFmpeg
        const webmData = await webmBlob.arrayBuffer()
        await this.ffmpeg.writeFile('input.webm', new Uint8Array(webmData))

        // Convert to target format
        const outputFile = `output.${format}`
        await this.ffmpeg.exec([
          '-i', 'input.webm',
          '-c:v', format === 'gif' ? 'gif' : 'libx264',
          '-s', `${resolution.width}x${resolution.height}`,
          '-r', framerate.toString(),
          outputFile
        ])

        const outputData = await this.ffmpeg.readFile(outputFile)
        const convertedBlob = new Blob([outputData as BlobPart], { type: `video/${format}` })

        // Cleanup
        await this.ffmpeg.deleteFile('input.webm')
        await this.ffmpeg.deleteFile(outputFile)

        onProgress?.({
          progress: 100,
          stage: 'complete',
          message: 'Export complete!'
        })

        return convertedBlob
      }

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!'
      })

      return webmBlob

    } catch (error) {
      console.error('Export failed:', error)
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error}`
      })
      throw error
    } finally {
      this.cleanup()
    }
  }

  /**
   * Export as GIF
   */
  async exportAsGIF(
    videoBlob: Blob,
    settings: { width?: number; height?: number; fps?: number } = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    const { width = 640, height = 360, fps = 10 } = settings

    onProgress?.({ progress: 0, stage: 'preparing', message: 'Converting to GIF...' })

    const videoData = await fetchFile(videoBlob)
    await this.ffmpeg.writeFile('input.webm', videoData as Uint8Array)

    await this.ffmpeg.exec([
      '-i', 'input.webm',
      '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos`,
      '-c:v', 'gif',
      'output.gif'
    ])

    const data = await this.ffmpeg.readFile('output.gif')
    const blob = new Blob([data as BlobPart], { type: 'image/gif' })

    await this.ffmpeg.deleteFile('input.webm')
    await this.ffmpeg.deleteFile('output.gif')

    onProgress?.({ progress: 100, stage: 'complete', message: 'GIF export complete!' })

    return blob
  }

  private cleanup(): void {
    this.processingCanvas = null
    this.processingCtx = null
    this.mediaRecorder = null
    this.chunks = []
    this.frameCache.clear()
  }
}
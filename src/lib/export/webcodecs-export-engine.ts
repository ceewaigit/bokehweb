/**
 * WebCodecs-based Export Engine
 * Handles multi-clip exports with effects using native browser APIs
 * Replaces FFmpeg.wasm for better performance and reliability
 */

import type {
  ExportSettings,
  Project,
  Recording,
  RecordingMetadata,
  Clip,
  Effect
} from '@/types'
import { ExportFormat, EffectType } from '@/types'
import { WebCodecsEncoder } from './webcodecs-encoder'
import { VideoFrameExtractor } from './video-frame-extractor'
import { canvasCompositor } from './canvas-compositor'
import { logger } from '@/lib/utils/logger'
import type { ExportProgress } from './export-engine'
import type { TimelineSegment } from './timeline-processor'

interface FrameData {
  timestamp: number  // in milliseconds
  clipId: string
  sourceTime: number  // time in source video
  playbackRate: number
  effects: Effect[]
}

export class WebCodecsExportEngine {
  private encoder: WebCodecsEncoder | null = null
  private frameExtractor: VideoFrameExtractor | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private frameRate = 30
  private frameDuration = 1000 / 30  // milliseconds per frame
  private abortSignal: AbortSignal | null = null

  constructor() {
    // Initialize canvas for effects processing
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true
    })
  }

  /**
   * Export video using WebCodecs with frame-by-frame processing
   */
  async export(
    segments: TimelineSegment[],
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<Blob> {
    this.abortSignal = abortSignal || null
    this.frameRate = settings.framerate || 30
    this.frameDuration = 1000 / this.frameRate

    try {
      // Initialize encoder
      this.encoder = new WebCodecsEncoder()
      await this.encoder.initialize(settings, (frameCount) => {
        // Progress callback from encoder
        const progress = Math.min(95, (frameCount / (this.frameRate * 10)) * 100)
        onProgress?.({
          progress,
          stage: 'encoding',
          message: `Encoding frame ${frameCount}...`,
          currentFrame: frameCount
        })
      })

      // Initialize frame extractor
      this.frameExtractor = new VideoFrameExtractor(
        settings.resolution.width,
        settings.resolution.height,
        this.frameRate
      )

      // Setup canvas for target resolution
      if (this.canvas && this.ctx) {
        this.canvas.width = settings.resolution.width
        this.canvas.height = settings.resolution.height
      }

      onProgress?.({
        progress: 5,
        stage: 'preparing',
        message: 'Preparing video segments...'
      })

      // Calculate total frames needed
      const totalDuration = this.calculateTotalDuration(segments)
      const totalFrames = Math.ceil((totalDuration / 1000) * this.frameRate)

      logger.info(`WebCodecs export: ${totalFrames} frames at ${this.frameRate}fps`)

      // Process all segments
      let currentFrame = 0
      for (const segment of segments) {
        if (this.abortSignal?.aborted) {
          throw new Error('Export cancelled')
        }

        if (segment.clips.length === 0) {
          logger.debug(`Skipping empty segment ${segment.id}`)
          continue
        }

        // Process this segment frame by frame
        const segmentFrames = await this.processSegment(
          segment,
          recordings,
          metadata,
          settings,
          currentFrame,
          totalFrames,
          onProgress
        )

        currentFrame += segmentFrames
      }

      onProgress?.({
        progress: 90,
        stage: 'finalizing',
        message: 'Finalizing video...'
      })

      // Finish encoding and get final blob
      const blob = await this.encoder.finish()

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!',
        currentFrame: totalFrames,
        totalFrames
      })

      return blob
    } catch (error) {
      logger.error('WebCodecs export failed:', error)
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    } finally {
      this.cleanup()
    }
  }

  /**
   * Process a single segment frame by frame with optimized extraction
   */
  private async processSegment(
    segment: TimelineSegment,
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    startFrame: number,
    totalFrames: number,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<number> {
    if (!this.frameExtractor || !this.encoder) {
      throw new Error('Frame extractor or encoder not initialized')
    }

    const segmentDuration = segment.endTime - segment.startTime
    const frameCount = Math.ceil((segmentDuration / 1000) * this.frameRate)
    
    logger.info(`Processing segment ${segment.id}: ${frameCount} frames, ${segment.clips.length} clips`)

    // Pre-load all videos for this segment
    const videoMap = new Map<string, HTMLVideoElement>()
    for (const clipData of segment.clips) {
      const videoUrl = await this.getVideoUrl(clipData.recording)
      const video = await this.frameExtractor.loadVideo(clipData.recording.id, videoUrl)
      videoMap.set(clipData.clip.id, video)
    }

    let processedFrames = 0

    // Process clips sequentially for better performance
    for (const clipData of segment.clips) {
      const clip = clipData.clip
      const video = videoMap.get(clip.id)
      if (!video) continue

      // Calculate clip boundaries within this segment
      const clipStartInSegment = Math.max(clip.startTime, segment.startTime)
      const clipEndInSegment = Math.min(clip.startTime + clip.duration, segment.endTime)
      
      if (clipStartInSegment >= clipEndInSegment) continue

      // Check if this is a typing speed clip
      const isTypingSpeedClip = (clip as any).typingSpeedApplied === true
      
      logger.debug(`Processing ${isTypingSpeedClip ? 'typing-speed' : 'normal'} clip ${clip.id} from ${clipStartInSegment}ms to ${clipEndInSegment}ms`)

      // Extract frames with proper timing
      await this.frameExtractor.extractClipFramesWithTypingSpeed(
        clip,
        video,
        clipStartInSegment,
        clipEndInSegment,
        async (frame) => {
          // Apply effects to the frame
          const processedFrame = await this.applyEffects(
            frame.imageData,
            frame.timestamp,
            segment.effects,
            clipData.recording,
            metadata.get(clipData.recording.id)
          )

          // Encode the frame
          await this.encoder!.encodeFrame(processedFrame, frame.timestamp)
          processedFrames++

          // Update progress
          if (processedFrames % 10 === 0 && onProgress) {
            const globalFrame = startFrame + processedFrames
            const progress = Math.min(85, (globalFrame / totalFrames) * 85)
            onProgress({
              progress,
              stage: 'encoding',
              message: `Processing frame ${globalFrame} of ${totalFrames}...`,
              currentFrame: globalFrame,
              totalFrames
            })
          }
        }
      )
    }

    // Handle gaps - fill with black frames if needed
    if (processedFrames < frameCount) {
      const remainingFrames = frameCount - processedFrames
      logger.debug(`Filling ${remainingFrames} black frames for gaps`)
      
      for (let i = 0; i < remainingFrames; i++) {
        const timestamp = segment.startTime + ((processedFrames + i) * this.frameDuration)
        const blackFrame = this.frameExtractor.createBlackFrame(timestamp)
        await this.encoder!.encodeFrame(blackFrame.imageData, timestamp)
      }
      processedFrames = frameCount
    }

    return processedFrames
  }

  /**
   * Apply effects to a frame
   */
  private async applyEffects(
    imageData: ImageData,
    timestamp: number,
    effects: Effect[],
    recording: Recording,
    metadata?: RecordingMetadata
  ): Promise<ImageData> {
    if (!this.ctx || !this.canvas) {
      return imageData  // Return unmodified if canvas not available
    }

    // Put the original frame on canvas
    this.ctx.putImageData(imageData, 0, 0)

    // Apply effects if any
    const activeEffects = effects.filter(e => 
      e.enabled && timestamp >= e.startTime && timestamp <= e.endTime
    )

    if (activeEffects.length > 0) {
      this.ctx.save()

      // Apply zoom effect
      const zoomEffect = activeEffects.find(e => e.type === EffectType.Zoom)
      if (zoomEffect) {
        const zoomData = zoomEffect.data as any
        const scale = zoomData.scale || 2
        const centerX = this.canvas.width / 2
        const centerY = this.canvas.height / 2

        // Create a temporary canvas for zoom
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = this.canvas.width
        tempCanvas.height = this.canvas.height
        const tempCtx = tempCanvas.getContext('2d')!
        
        // Copy current frame to temp canvas
        tempCtx.drawImage(this.canvas, 0, 0)
        
        // Clear and apply zoom
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.ctx.translate(centerX, centerY)
        this.ctx.scale(scale, scale)
        this.ctx.translate(-centerX, -centerY)
        this.ctx.drawImage(tempCanvas, 0, 0)
        
        tempCanvas.remove()
      }

      // Apply cursor overlay if available
      if (metadata?.mouseEvents) {
        // Find mouse position at this timestamp
        const mouseEvent = this.findMouseEventAtTime(metadata.mouseEvents, timestamp)
        if (mouseEvent) {
          // Draw cursor indicator
          this.ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'
          this.ctx.beginPath()
          this.ctx.arc(mouseEvent.mouseX, mouseEvent.mouseY, 10, 0, Math.PI * 2)
          this.ctx.fill()
        }
      }

      this.ctx.restore()
    }

    // Get the processed frame
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * Find mouse event at specific timestamp
   */
  private findMouseEventAtTime(
    mouseEvents: any[],
    timestamp: number
  ): any {
    if (!mouseEvents || mouseEvents.length === 0) return null
    
    // Find the closest mouse event
    let closest = mouseEvents[0]
    let minDiff = Math.abs(mouseEvents[0].timestamp - timestamp)
    
    for (const event of mouseEvents) {
      const diff = Math.abs(event.timestamp - timestamp)
      if (diff < minDiff) {
        minDiff = diff
        closest = event
      }
    }
    
    // Only return if within reasonable range (100ms)
    return minDiff < 100 ? closest : null
  }

  /**
   * Get video URL for a recording
   */
  private async getVideoUrl(recording: Recording): Promise<string> {
    // Try to get from blob storage first
    const { RecordingStorage } = await import('../storage/recording-storage')
    const blobUrl = RecordingStorage.getBlobUrl(recording.id)
    
    if (blobUrl) {
      return blobUrl
    }

    // Fall back to file path
    const { globalBlobManager } = await import('../security/blob-url-manager')
    const url = await globalBlobManager.ensureVideoLoaded(recording.id, recording.filePath)
    
    if (!url) {
      throw new Error(`Failed to load video for recording ${recording.id}`)
    }

    return url
  }

  /**
   * Calculate total duration of all segments
   */
  private calculateTotalDuration(segments: TimelineSegment[]): number {
    if (segments.length === 0) return 0
    
    // Get the actual range of content
    const firstSegment = segments[0]
    const lastSegment = segments[segments.length - 1]
    
    return lastSegment.endTime - firstSegment.startTime
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.encoder) {
      this.encoder.reset()
      this.encoder = null
    }

    if (this.frameExtractor) {
      this.frameExtractor.dispose()
      this.frameExtractor = null
    }

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }
}
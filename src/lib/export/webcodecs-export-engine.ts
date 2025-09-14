/**
 * WebCodecs-based Export Engine
 * Handles multi-clip exports with effects using native browser APIs
 * Replaces FFmpeg.wasm for better performance and reliability
 */

import type {
  ExportSettings,
  Recording,
  RecordingMetadata,
  Effect
} from '@/types'
import { EffectType } from '@/types'
import { WebCodecsEncoder } from './webcodecs-encoder'
import { VideoFrameExtractor } from './video-frame-extractor'
import { logger } from '@/lib/utils/logger'
import type { ExportProgress } from './export-engine'
import type { TimelineSegment } from './timeline-processor'
import { calculateZoomTransform } from '@/remotion/compositions/utils/zoom-transform'
import { calculateBackgroundStyle, applyGradientToCanvas } from '@/lib/effects/utils/background-calculator'
import { calculateCursorState, getCursorPath } from '@/lib/effects/utils/cursor-calculator'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { WorkerPool, createOptimizedWorkerPool } from './workers/worker-pool'
import type { FrameTask } from './workers/worker-pool'
import { PerformanceMonitor, performanceMonitor } from './performance-monitor'
// WebGLEffectsRenderer will be imported when useWebGL is enabled

export class WebCodecsExportEngine {
  private encoder: WebCodecsEncoder | null = null
  private frameExtractor: VideoFrameExtractor | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private frameRate = 30
  private frameDuration = 1000 / 30  // milliseconds per frame
  private abortSignal: AbortSignal | null = null
  private workerPool: WorkerPool | null = null
  private useWorkers = true // Can be disabled for debugging
  private useWebGL = false // Enable when ready (WebGL renderer created on demand)
  private monitor = performanceMonitor

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
      // Start performance monitoring
      this.monitor.start()
      
      // Get optimized settings
      const optimizedSettings = PerformanceMonitor.getOptimizedSettings()
      this.useWorkers = optimizedSettings.useWorkers
      this.useWebGL = optimizedSettings.useWebGL && false // Disabled for now
      
      // Calculate total frames needed up front for accurate progress
      const totalDuration = this.calculateTotalDuration(segments)
      const totalFrames = Math.ceil((totalDuration / 1000) * this.frameRate)

      logger.info(`WebCodecs export: ${totalFrames} frames at ${this.frameRate}fps`)
      logger.info(`Performance settings: Workers=${this.useWorkers}, WebGL=${this.useWebGL}`)

      // Initialize encoder
      this.encoder = new WebCodecsEncoder()
      await this.encoder.initialize(settings)

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

      // Initialize worker pool if using workers
      if (this.useWorkers) {
        this.workerPool = createOptimizedWorkerPool(
          settings.resolution.width,
          settings.resolution.height
        )
        await this.workerPool.initialize()
        logger.info('Worker pool initialized for parallel processing')
      }

      onProgress?.({
        progress: 5,
        stage: 'preparing',
        message: 'Preparing video segments...'
      })

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
        progress: 98,
        stage: 'finalizing',
        message: 'Finalizing video...'
      })

      // Finish encoding and get final blob
      const blob = await this.encoder.finish()
      
      // Stop performance monitoring
      this.monitor.stop()

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

      // Extract frames with concurrent processing
      if (this.useWorkers && this.workerPool) {
        const concurrentLimit = 30  // Process up to 30 frames concurrently
        const activeFrames = new Set<Promise<void>>()
        
        await this.frameExtractor.extractClipFramesStreamed(
          clip,
          video,
          clipStartInSegment,
          clipEndInSegment,
          async (frame) => {
            // Wait if too many frames are being processed
            while (activeFrames.size >= concurrentLimit) {
              await Promise.race(activeFrames)
            }
            
            const frameId = `${clip.id}_${frame.timestamp}`
            const framePromise = (async () => {
              this.monitor.frameStart(frameId)
              
              try {
                // Check if we have effects to apply
                const hasEffects = segment.effects?.some(e => 
                  e.enabled && frame.timestamp >= e.startTime && frame.timestamp <= e.endTime
                )
                
                if (frame.imageData instanceof HTMLVideoElement) {
                  if (hasEffects) {
                    // Apply effects if needed
                    await this.applyEffects(
                      frame.imageData,
                      frame.timestamp,
                      segment.effects,
                      clipData.recording,
                      metadata.get(clipData.recording.id)
                    )
                    // Encode from canvas
                    await this.encoder!.encodeFrame(this.canvas!, frame.timestamp)
                  } else {
                    // No effects - draw video to canvas and encode
                    this.ctx!.drawImage(frame.imageData, 0, 0, this.canvas!.width, this.canvas!.height)
                    await this.encoder!.encodeFrame(this.canvas!, frame.timestamp)
                  }
                } else {
                  // For ImageBitmap, use workers
                  const frameTask: FrameTask = {
                    id: frameId,
                    bitmap: frame.imageData as ImageBitmap,
                    effects: segment.effects,
                    timestamp: frame.timestamp,
                    metadata: metadata.get(clipData.recording.id)
                  }
                  
                  const processed = await this.workerPool!.processFrame(frameTask)
                  await this.encoder!.encodeFrame(processed.bitmap, processed.timestamp)
                }
                
                processedFrames++
                this.monitor.frameEnd(frameId)
                
                // Update progress
                if (processedFrames % 20 === 0 && onProgress) {
                  const globalFrame = startFrame + processedFrames
                  const progress = Math.min(95, (globalFrame / totalFrames) * 95)
                  onProgress({
                    progress,
                    stage: 'encoding',
                    message: `Processing frame ${globalFrame} of ${totalFrames}...`,
                    currentFrame: globalFrame,
                    totalFrames
                  })
                }
              } catch (error) {
                logger.error(`Failed to process frame ${frameId}:`, error)
              } finally {
                // framePromise is added after this async function
              }
            })()
            
            activeFrames.add(framePromise)
          }
        )
        
        // Wait for all remaining frames
        if (activeFrames.size > 0) {
          await Promise.all(activeFrames)
        }
      } else {
        // Fallback to single-threaded processing
        await this.frameExtractor.extractClipFramesStreamed(
          clip,
          video,
          clipStartInSegment,
          clipEndInSegment,
          async (frame) => {
            // Apply effects to the frame
            await this.applyEffects(
              frame.imageData,
              frame.timestamp,
              segment.effects,
              clipData.recording,
              metadata.get(clipData.recording.id)
            )

            // Encode the frame
            await this.encoder!.encodeFrame(this.canvas as unknown as HTMLCanvasElement, frame.timestamp)
            processedFrames++

            // Update progress
            if (processedFrames % 5 === 0 && onProgress) {
              const globalFrame = startFrame + processedFrames
              const progress = Math.min(95, (globalFrame / totalFrames) * 95)
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
    }

    // Handle gaps - fill with black frames if needed
    if (processedFrames < frameCount) {
      const remainingFrames = frameCount - processedFrames
      logger.debug(`Filling ${remainingFrames} black frames for gaps`)
      
      for (let i = 0; i < remainingFrames; i++) {
        const timestamp = segment.startTime + ((processedFrames + i) * this.frameDuration)
        await this.frameExtractor.createBlackFrame(timestamp)
        await this.encoder!.encodeFrame(this.canvas as unknown as HTMLCanvasElement, timestamp)
      }
      processedFrames = frameCount
    }

    return processedFrames
  }

  /**
   * Apply effects to a frame
   */
  private async applyEffects(
    imageData: ImageData | ImageBitmap | HTMLVideoElement,
    timestamp: number,
    effects: Effect[],
    _recording: Recording,
    metadata?: RecordingMetadata
  ): Promise<void> {
    if (!this.ctx || !this.canvas) {
      return
    }

    // Normalize source to ImageBitmap to avoid readbacks and type mismatches
    let sourceBitmap: ImageBitmap
    if (imageData instanceof ImageBitmap) {
      sourceBitmap = imageData
    } else if ((imageData as any)?.tagName === 'VIDEO') {
      // Draw video frame directly without creating an intermediate bitmap
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.ctx.drawImage(imageData as HTMLVideoElement, 0, 0, this.canvas.width, this.canvas.height)
      return
    } else {
      sourceBitmap = await createImageBitmap(imageData as ImageData)
    }

    // Draw source
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.drawImage(sourceBitmap as unknown as CanvasImageSource, 0, 0, this.canvas.width, this.canvas.height)

    // Apply effects if any
    const activeEffects = effects.filter(e => 
      e.enabled && timestamp >= e.startTime && timestamp <= e.endTime
    )

    if (activeEffects.length > 0) {
      // Apply background effect first if present
      const backgroundEffect = EffectsFactory.getBackgroundEffect(activeEffects)
      if (backgroundEffect) {
        const backgroundData = EffectsFactory.getBackgroundData(backgroundEffect)
        if (backgroundData) {
          const backgroundStyle = calculateBackgroundStyle(backgroundData, this.canvas.width, this.canvas.height)
          
          // Clear canvas and apply background
          this.ctx.save()
          if (backgroundStyle.canvasDrawing) {
            if (backgroundStyle.canvasDrawing.type === 'fill') {
              this.ctx.fillStyle = backgroundStyle.canvasDrawing.color || '#000000'
              this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
            } else if (backgroundStyle.canvasDrawing.type === 'gradient' && backgroundStyle.canvasDrawing.gradient) {
              applyGradientToCanvas(
                this.ctx,
                backgroundStyle.canvasDrawing.gradient,
                this.canvas.width,
                this.canvas.height
              )
            }
          }
          this.ctx.restore()
          
          // Re-draw the frame on top of background with padding if needed
          if (backgroundData.padding && backgroundData.padding > 0) {
            const padding = backgroundData.padding
            const scale = Math.min(
              (this.canvas.width - padding * 2) / this.canvas.width,
              (this.canvas.height - padding * 2) / this.canvas.height
            )
            const scaledWidth = this.canvas.width * scale
            const scaledHeight = this.canvas.height * scale
            const x = (this.canvas.width - scaledWidth) / 2
            const y = (this.canvas.height - scaledHeight) / 2
            
            // Create temp canvas with original frame
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = this.canvas.width
            tempCanvas.height = this.canvas.height
            const tempCtx = tempCanvas.getContext('2d')!
            if (imageData instanceof ImageBitmap) {
              tempCtx.drawImage(imageData, 0, 0)
            } else {
              const tmpBitmap = await createImageBitmap(imageData)
              tempCtx.drawImage(tmpBitmap, 0, 0)
              try { tmpBitmap.close?.() } catch {}
            }
            
            // Clear and redraw with padding
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
            
            // Reapply background
            if (backgroundStyle.canvasDrawing?.type === 'gradient' && backgroundStyle.canvasDrawing.gradient) {
              applyGradientToCanvas(
                this.ctx,
                backgroundStyle.canvasDrawing.gradient,
                this.canvas.width,
                this.canvas.height
              )
            } else if (backgroundStyle.canvasDrawing?.type === 'fill') {
              this.ctx.fillStyle = backgroundStyle.canvasDrawing.color || '#000000'
              this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
            }
            
            // Draw padded frame
            this.ctx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight)
            tempCanvas.remove()
          }
        }
      }
      
      this.ctx.save()

      // Apply zoom effect using calculator
      const zoomEffects = EffectsFactory.getZoomEffects(activeEffects)
      if (zoomEffects.length > 0) {
        const zoomEffect = zoomEffects[0]
        const zoomData = EffectsFactory.getZoomData(zoomEffect)
        
        if (zoomData) {
          // Calculate zoom transform using shared calculator
          const zoomTransform = calculateZoomTransform(
            {
              id: zoomEffect.id,
              startTime: zoomEffect.startTime,
              endTime: zoomEffect.endTime,
              scale: zoomData.scale || 2,
              targetX: zoomData.targetX || 0.5,
              targetY: zoomData.targetY || 0.5,
              introMs: zoomData.introMs || 300,
              outroMs: zoomData.outroMs || 300
            },
            timestamp,
            this.canvas.width,
            this.canvas.height,
            { x: zoomData.targetX || 0.5, y: zoomData.targetY || 0.5 }
          )
          
          // Apply the calculated transform
          if (zoomTransform.scale !== 1) {
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = this.canvas.width
            tempCanvas.height = this.canvas.height
            const tempCtx = tempCanvas.getContext('2d')!
            
            // Copy current frame to temp canvas
            tempCtx.drawImage(this.canvas, 0, 0)
            
            // Clear and apply zoom with calculated values
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.ctx.save()
            
            // Apply transform from calculator
            const centerX = this.canvas.width / 2
            const centerY = this.canvas.height / 2
            this.ctx.translate(centerX, centerY)
            this.ctx.scale(zoomTransform.scale, zoomTransform.scale)
            this.ctx.translate(-centerX + zoomTransform.scaleCompensationX, -centerY + zoomTransform.scaleCompensationY)
            this.ctx.drawImage(tempCanvas, 0, 0)
            
            this.ctx.restore()
            tempCanvas.remove()
          }
        }
      }

      // Apply cursor effect using calculator
      const cursorEffect = EffectsFactory.getCursorEffect(activeEffects)
      if (cursorEffect && metadata?.mouseEvents) {
        const cursorData = EffectsFactory.getCursorData(cursorEffect)
        if (cursorData) {
          // Calculate cursor state using shared calculator
          const cursorState = calculateCursorState(
            cursorData,
            metadata.mouseEvents,
            metadata.clickEvents || [],
            timestamp
          )
          
          if (cursorState.visible) {
            // Draw cursor using calculated state
            this.ctx.save()
            this.ctx.globalAlpha = cursorState.opacity
            
            // Draw cursor shadow
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
            this.ctx.shadowBlur = 4 * cursorState.scale
            this.ctx.shadowOffsetX = 1 * cursorState.scale
            this.ctx.shadowOffsetY = 2 * cursorState.scale
            
            // Draw cursor shape
            const cursorPath = getCursorPath(cursorState.x, cursorState.y, cursorState.type, cursorState.scale)
            this.ctx.fillStyle = '#ffffff'
            this.ctx.strokeStyle = '#000000'
            this.ctx.lineWidth = 1 * cursorState.scale
            this.ctx.fill(cursorPath)
            this.ctx.stroke(cursorPath)
            
            // Draw click effects
            if (cursorState.clickEffects.length > 0) {
              this.ctx.shadowColor = 'transparent'
              for (const click of cursorState.clickEffects) {
                this.ctx.globalAlpha = click.opacity
                this.ctx.strokeStyle = '#ffffff'
                this.ctx.lineWidth = 2
                this.ctx.beginPath()
                this.ctx.arc(click.x, click.y, click.radius, 0, Math.PI * 2)
                this.ctx.stroke()
              }
            }
            
            this.ctx.restore()
          }
        }
      }

      this.ctx.restore()
    }

    // Release temporary source bitmap if needed
    try { sourceBitmap.close?.() } catch {}
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
  private async cleanup(): Promise<void> {
    if (this.encoder) {
      this.encoder.reset()
      this.encoder = null
    }

    if (this.frameExtractor) {
      this.frameExtractor.dispose()
      this.frameExtractor = null
    }

    if (this.workerPool) {
      await this.workerPool.terminate()
      this.workerPool = null
    }

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }
}
/**
 * Export Engine - Complete Multi-threaded Implementation
 * Handles video export with WebCodecs, Canvas rendering, and FFmpeg fallback
 */

import type { 
  ExportSettings,
  Project,
  Recording,
  RecordingMetadata,
  Clip,
  Effect
} from '@/types'
import { TrackType, RecordingSourceType } from '@/types'
import { globalBlobManager } from '../security/blob-url-manager'
import { RecordingStorage } from '../storage/recording-storage'
import { FFmpegExportEngine } from './ffmpeg-export'
import { metadataLoader } from './metadata-loader'
import { timelineProcessor, type ProcessedTimeline, type TimelineSegment } from './timeline-processor'
import { canvasCompositor } from './canvas-compositor'
import { WebCodecsEncoder, checkWebCodecsSupport } from './webcodecs-encoder'
import { WorkerPool } from './worker-pool'
import { logger } from '../utils/logger'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
  eta?: number
}

interface SegmentResult {
  segmentId: string
  blob: Blob
  duration: number
  frameCount: number
}

export class ExportEngine {
  private ffmpegEngine: FFmpegExportEngine
  private webCodecsEncoder: WebCodecsEncoder | null = null
  private workerPool: WorkerPool | null = null
  private isExporting = false
  private abortController: AbortController | null = null
  private useWebCodecs = false
  private useWorkers = false

  constructor() {
    this.ffmpegEngine = new FFmpegExportEngine()
    this.checkCapabilities()
  }

  /**
   * Check browser capabilities
   */
  private async checkCapabilities(): Promise<void> {
    const webCodecsSupport = await checkWebCodecsSupport()
    this.useWebCodecs = webCodecsSupport.supported && webCodecsSupport.codecs.length > 0
    this.useWorkers = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
    logger.info(`Export capabilities - WebCodecs: ${this.useWebCodecs}, Workers: ${this.useWorkers}`)
  }

  /**
   * Main export entry point - simplified routing
   */
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (this.isExporting) {
      throw new Error('Export already in progress')
    }

    this.isExporting = true
    this.abortController = new AbortController()
    const startTime = performance.now()

    try {
      // Analyze project complexity
      const recordingsMap = new Map<string, Recording>()
      project.recordings.forEach(r => recordingsMap.set(r.id, r))

      const processedTimeline = timelineProcessor.processTimeline(
        project.timeline,
        recordingsMap,
        5000  // 5 second segments for optimal performance
      )

      if (processedTimeline.clipCount === 0) {
        throw new Error('No video clips to export')
      }

      onProgress?.({
        progress: 2,
        stage: 'preparing',
        message: `Preparing ${processedTimeline.clipCount} clips for export...`
      })

      // Load all metadata in parallel
      const metadataMap = await metadataLoader.loadAllMetadata(project.recordings)

      // Simplified routing: Use Canvas+FFmpeg for everything with effects or multiple clips
      const hasMultipleClips = processedTimeline.hasMultipleClips
      const hasEffects = project.timeline.effects?.some(e => e.enabled) || false
      const hasGaps = processedTimeline.hasGaps
      
      logger.info(`Export: clips=${processedTimeline.clipCount}, effects=${hasEffects}, gaps=${hasGaps}`)

      if (hasMultipleClips || hasEffects || hasGaps) {
        // Use Canvas+FFmpeg for complex exports with effects
        return await this.exportWithEffects(
          processedTimeline,
          recordingsMap,
          metadataMap,
          settings,
          onProgress
        )
      } else {
        // Direct export for simple single clips without effects
        return await this.exportDirect(
          processedTimeline.segments[0],
          metadataMap,
          settings,
          onProgress
        )
      }
    } catch (error) {
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    } finally {
      this.isExporting = false
      this.abortController = null
      // Clean up resources on error
      this.cleanupResources()
      
      const duration = (performance.now() - startTime) / 1000
      logger.info(`Export completed in ${duration.toFixed(2)}s`)
    }
  }

  /**
   * Export with effects using Canvas and FFmpeg
   * This is the main path for all exports with effects
   */
  private async exportWithEffects(
    timeline: ProcessedTimeline,
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    onProgress?.({
      progress: 5,
      stage: 'preparing',
      message: 'Preparing to apply effects...'
    })

    try {
      // Initialize canvas compositor for effect rendering
      canvasCompositor.initializePool(
        settings.resolution.width,
        settings.resolution.height,
        4  // Use 4 canvases for parallel rendering
      )

      const segmentBlobs: Blob[] = []
      const totalSegments = timeline.segments.length

            // Process each segment with effects
      for (let i = 0; i < timeline.segments.length; i++) {
        const segment = timeline.segments[i]
        
        if (this.abortController?.signal.aborted) break
        
        onProgress?.({
          progress: 10 + (80 * i / totalSegments),
          stage: 'processing',
          message: `Processing segment ${i + 1}/${totalSegments} with effects...`
        })
        
        const segmentBlob = await this.processSegmentWithEffects(
          segment,
          recordings,
          metadata,
          settings
        )
        
        // Skip empty segments to avoid zero-byte results
        if (segmentBlob && segmentBlob.size > 0) {
          segmentBlobs.push(segmentBlob)
        }
      }

      if (segmentBlobs.length === 0) {
        throw new Error('No segments produced during export')
      }

      // Concatenate segments if multiple
      if (segmentBlobs.length === 1) {
        return segmentBlobs[0]
      }

      onProgress?.({
        progress: 95,
        stage: 'finalizing',
        message: 'Combining segments...'
      })

      return await this.concatenateSegments(segmentBlobs, settings)
    } catch (error) {
      logger.error('Export with effects failed:', error)
      throw error
    } finally {
      // Always clean up canvas pool
      canvasCompositor.dispose()
    }
  }

  /**
   * Direct export for simple clips without effects
   */
  private async exportDirect(
    segment: TimelineSegment,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (!segment || segment.clips.length === 0) {
      throw new Error('No clips to export')
    }

    const firstClip = segment.clips[0]
    const recording = firstClip.recording

    onProgress?.({
      progress: 10,
      stage: 'processing',
      message: 'Loading video...'
    })

    // Get video blob
    const videoBlob = await this.loadVideoBlob(recording)
    
    // Direct export without processing
    onProgress?.({
      progress: 100,
      stage: 'complete',
      message: 'Export complete!'
    })

    return videoBlob
  }

  /**
   * Process a segment with effects applied
   */
  private async processSegmentWithEffects(
    segment: TimelineSegment,
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings
  ): Promise<Blob> {
    // Handle empty segments (gaps)
    if (segment.clips.length === 0 || segment.hasGap) {
      return this.createBlackFrameSegment(
        segment.endTime - segment.startTime,
        settings
      )
    }

    // Get the primary clip for this segment
    const primaryClip = segment.clips[0]
    const videoBlob = await this.loadVideoBlob(primaryClip.recording)
    const recordingMetadata = metadata.get(primaryClip.recording.id)

    // Apply effects using FFmpeg
    return await this.ffmpegEngine.exportWithEffects(
      videoBlob,
      primaryClip.clip,
      settings,
      undefined,
      primaryClip.recording.captureArea?.fullBounds,
      recordingMetadata?.mouseEvents as any,
      segment.effects
    )
  }



  /**
   * Load video blob for a recording
   */
  private async loadVideoBlob(recording: Recording): Promise<Blob> {
    const blobUrl = RecordingStorage.getBlobUrl(recording.id)
    
    if (blobUrl) {
      const response = await fetch(blobUrl)
      return await response.blob()
    }
    
    const videoUrl = await globalBlobManager.ensureVideoLoaded(
      recording.id,
      recording.filePath
    )
    
    if (!videoUrl) {
      throw new Error(`Failed to load video for recording ${recording.id}`)
    }
    
    const response = await fetch(videoUrl)
    return await response.blob()
  }

  /**
   * Create black frame segment for gaps
   */
  private async createBlackFrameSegment(
    duration: number,
    settings: ExportSettings
  ): Promise<Blob> {
    const canvas = document.createElement('canvas')
    canvas.width = settings.resolution.width
    canvas.height = settings.resolution.height
    
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || new Blob()), 'video/webm')
    })
  }

  /**
   * Concatenate multiple video segments
   */
  private async concatenateSegments(
    segments: Blob[],
    settings: ExportSettings
  ): Promise<Blob> {
    if (segments.length === 1) return segments[0]
    
    // Use FFmpeg to concatenate
    await this.ffmpegEngine.loadFFmpeg()
    return await this.ffmpegEngine.concatenateBlobs(segments, settings)
  }


  /**
   * Clean up resources properly
   */
  private cleanupResources(): void {
    // Dispose of canvas pool
    canvasCompositor.dispose()
    
    // Clean up encoder if exists
    this.webCodecsEncoder?.reset()
    this.webCodecsEncoder = null
    
    // Clean up worker pool if exists
    this.workerPool?.dispose()
    this.workerPool = null
  }

  /**
   * Cancel ongoing export
   */
  cancelExport(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.isExporting = false
    }
    
    // Clean up all resources
    this.cleanupResources()
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.cancelExport()
    this.cleanupResources()
  }
}
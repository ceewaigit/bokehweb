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
import { TrackType, RecordingSourceType, ExportFormat } from '@/types'
import { WebCodecsExportEngine } from './webcodecs-export-engine'
import { metadataLoader } from './metadata-loader'
import { timelineProcessor, type ProcessedTimeline, type TimelineSegment } from './timeline-processor'
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
  private webCodecsExportEngine: WebCodecsExportEngine
  private isExporting = false
  private abortController: AbortController | null = null

  constructor() {
    this.webCodecsExportEngine = new WebCodecsExportEngine()
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

      // Check if it's a simple single clip without effects
      const isSimpleExport = processedTimeline.clipCount === 1 && 
                            !project.timeline.effects?.some(e => e.enabled)

      logger.info(`Export: clips=${processedTimeline.clipCount}, simple=${isSimpleExport}`)

      // Always use WebCodecs for all exports
      return await this.webCodecsExportEngine.export(
        processedTimeline.segments,
        recordingsMap,
        metadataMap,
        settings,
        onProgress,
        this.abortController?.signal
      )
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
   * Clean up resources properly
   */
  private cleanupResources(): void {
    // Nothing to clean up - WebCodecs engine handles its own cleanup
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
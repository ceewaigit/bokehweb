/**
 * Export Engine - Unified high-performance video export
 * Uses WebCodecs with WebWorker pool and GPU acceleration
 */

import type { ExportSettings, Project, Recording } from '@/types'
import { ExportFormat } from '@/types'
import { WebCodecsExportEngine } from './webcodecs-export-engine'
import { metadataLoader } from './metadata-loader'
import { timelineProcessor } from './timeline-processor'
import { logger } from '../utils/logger'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
  currentFrame?: number
  totalFrames?: number
  eta?: number
}

export class ExportEngine {
  private webCodecsEngine: WebCodecsExportEngine
  private isExporting = false
  private abortController: AbortController | null = null

  constructor() {
    this.webCodecsEngine = new WebCodecsExportEngine()
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
      // Prefer WebCodecs; fallback to WEBM when MP4/MOV codec is unavailable
      try {
        return await this.webCodecsEngine.export(
          processedTimeline.segments,
          recordingsMap,
          metadataMap,
          settings,
          onProgress,
          this.abortController?.signal
        )
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const isMp4OrMov = settings.format === ExportFormat.MP4 || settings.format === ExportFormat.MOV
        const shouldFallbackToWebM =
          isMp4OrMov && /No supported codec found|WebCodecs not supported|configure|encoder|mvhd|muxer/i.test(errorMessage)

        if (shouldFallbackToWebM) {
          logger.warn(`WebCodecs H.264 not available; falling back to WebM. Reason: ${errorMessage}`)
          onProgress?.({
            progress: 1,
            stage: 'preparing',
            message: 'MP4/H.264 not supported in this environment. Falling back to WebM (VP9/VP8)...'
          })
          const fallbackSettings: ExportSettings = { ...settings, format: ExportFormat.WEBM }
          return await this.webCodecsEngine.export(
            processedTimeline.segments,
            recordingsMap,
            metadataMap,
            fallbackSettings,
            onProgress,
            this.abortController?.signal
          )
        }

        throw err
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
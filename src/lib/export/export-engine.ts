/**
 * Export Engine - Simplified with Remotion only
 * No fallbacks, no complexity, just Remotion's battle-tested export
 */

import type { ExportSettings, Project, Recording } from '@/types'
import { RemotionExportService } from './remotion-export-service'
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
  private remotionEngine: RemotionExportService
  private isExporting = false
  private abortController: AbortController | null = null

  constructor() {
    this.remotionEngine = new RemotionExportService()
  }

  /**
   * Export project using Remotion
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
      // Prepare recordings map
      const recordingsMap = new Map<string, Recording>()
      project.recordings.forEach(r => recordingsMap.set(r.id, r))

      // Process timeline into segments  
      // Note: Chunking duration doesn't matter here since actual chunking happens in export-handler.ts
      const processedTimeline = timelineProcessor.processTimeline(
        project.timeline,
        recordingsMap,
        5000 // Arbitrary value, not used in actual export
      )

      if (processedTimeline.clipCount === 0) {
        throw new Error('No video clips to export')
      }

      // All exports go through the same path - chunking is handled in export-handler.ts
      logger.info(`Export: ${processedTimeline.clipCount} clips, duration: ${processedTimeline.totalDuration}ms`);
      
      // Extract project folder from project file path
      let projectFolder: string | undefined;
      if (project.filePath) {
        // Project file path is like: /path/to/recordings/ProjectFolder/project.ssproj
        // We want: /path/to/recordings/ProjectFolder
        const pathParts = project.filePath.split('/');
        pathParts.pop(); // Remove the filename
        projectFolder = pathParts.join('/');
        logger.info(`Project folder: ${projectFolder}`);
      }
      
      onProgress?.({
        progress: 2,
        stage: 'preparing',
        message: `Preparing ${processedTimeline.clipCount} clips for export...`
      })

      // Load metadata
      const metadataMap = await metadataLoader.loadAllMetadata(project.recordings)

      // Map progress from Remotion format
      const progressAdapter = (remotionProgress: any) => {
        onProgress?.({
          progress: remotionProgress.progress,
          stage: remotionProgress.stage === 'bundling' ? 'preparing' : 
                 remotionProgress.stage === 'rendering' ? 'processing' :
                 remotionProgress.stage === 'encoding' ? 'encoding' : 
                 remotionProgress.stage,
          message: remotionProgress.message,
          currentFrame: remotionProgress.currentFrame,
          totalFrames: remotionProgress.totalFrames
        })
      }
      
      // Export using Remotion - all chunking/optimization handled in export-handler.ts
      // Pass project folder as additional parameter
      return await this.remotionEngine.export(
        processedTimeline.segments,
        recordingsMap,
        metadataMap,
        settings,
        progressAdapter,
        this.abortController?.signal,
        projectFolder
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

      const duration = (performance.now() - startTime) / 1000
      logger.info(`Export completed in ${duration.toFixed(2)}s`)
    }
  }

  /**
   * Cancel ongoing export
   */
  cancelExport(): void {
    if (this.abortController) {
      this.abortController.abort()
      logger.info('Export cancelled by user')
    }
  }

  /**
   * Check if export is in progress
   */
  isExportInProgress(): boolean {
    return this.isExporting
  }
}
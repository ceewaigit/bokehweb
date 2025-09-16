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
  
  // Maximum duration per chunk (5 seconds)
  private readonly CHUNK_DURATION_MS = 5000;
  private readonly MAX_FRAMES_PER_CHUNK = 300; // 5 seconds at 60fps

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
      const processedTimeline = timelineProcessor.processTimeline(
        project.timeline,
        recordingsMap,
        this.CHUNK_DURATION_MS
      )

      if (processedTimeline.clipCount === 0) {
        throw new Error('No video clips to export')
      }

      // Calculate total frames to determine if chunking is needed
      const fps = settings.framerate || 60;
      const totalFrames = Math.ceil((processedTimeline.totalDuration / 1000) * fps);
      const needsChunking = totalFrames > this.MAX_FRAMES_PER_CHUNK;

      logger.info(`Export: ${totalFrames} frames, chunking: ${needsChunking}`);

      if (needsChunking) {
        // LARGE EXPORT - Use chunked approach
        return await this.exportChunked(
          project,
          processedTimeline,
          recordingsMap,
          settings,
          onProgress
        );
      } else {
        // SMALL EXPORT - Send all at once
        onProgress?.({
          progress: 2,
          stage: 'preparing',
          message: `Preparing ${processedTimeline.clipCount} clips for export...`
        })

        // Load metadata
        const metadataMap = await metadataLoader.loadAllMetadata(project.recordings)

        logger.info(`Small export: ${processedTimeline.clipCount} clips`)

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
        
        // Export using Remotion
        return await this.remotionEngine.export(
          processedTimeline.segments,
          recordingsMap,
          metadataMap,
          settings,
          progressAdapter,
          this.abortController?.signal
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

      const duration = (performance.now() - startTime) / 1000
      logger.info(`Export completed in ${duration.toFixed(2)}s`)
    }
  }

  /**
   * Export large projects in chunks to avoid IPC/memory overload
   */
  private async exportChunked(
    project: Project,
    processedTimeline: any,
    recordingsMap: Map<string, Recording>,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const chunks: Blob[] = [];
    const totalDuration = processedTimeline.totalDuration;
    const chunkCount = Math.ceil(totalDuration / this.CHUNK_DURATION_MS);
    
    logger.info(`Splitting export into ${chunkCount} chunks of ${this.CHUNK_DURATION_MS}ms each`);
    
    for (let i = 0; i < chunkCount; i++) {
      const startTime = i * this.CHUNK_DURATION_MS;
      const endTime = Math.min((i + 1) * this.CHUNK_DURATION_MS, totalDuration);
      
      // Filter segments for this time range
      const chunkSegments = processedTimeline.segments.filter((seg: any) => 
        seg.startTime < endTime && seg.endTime > startTime
      ).map((seg: any) => ({
        ...seg,
        startTime: Math.max(seg.startTime, startTime) - startTime,
        endTime: Math.min(seg.endTime, endTime) - startTime
      }));
      
      if (chunkSegments.length === 0) continue;
      
      onProgress?.({
        progress: (i / chunkCount) * 90,
        stage: 'processing',
        message: `Exporting chunk ${i + 1} of ${chunkCount}...`
      });
      
      // Load metadata only for recordings in this chunk
      const chunkRecordingIds = new Set(
        chunkSegments.flatMap((s: any) => s.clips.map((c: any) => c.recording.id))
      );
      const chunkRecordings = project.recordings.filter(r => chunkRecordingIds.has(r.id));
      const metadataMap = await metadataLoader.loadAllMetadata(chunkRecordings);
      
      // Export this chunk
      const chunkBlob = await this.remotionEngine.export(
        chunkSegments,
        recordingsMap,
        metadataMap,
        { ...settings, isChunk: true } as any,
        undefined,
        this.abortController?.signal
      );
      
      chunks.push(chunkBlob);
      
      // Clean up memory between chunks
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    }
    
    onProgress?.({
      progress: 95,
      stage: 'finalizing',
      message: 'Combining chunks...'
    });
    
    // Combine chunks into single blob
    return new Blob(chunks, { type: chunks[0]?.type || 'video/mp4' });
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
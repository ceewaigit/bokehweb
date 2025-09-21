/**
 * Remotion Export Service - Renderer Process
 * Communicates with Electron main process for actual export
 */

import type { ExportSettings, Recording, RecordingMetadata } from '@/types';
import type { TimelineSegment } from './timeline-processor';
import { logger } from '@/lib/utils/logger';

export interface RemotionExportProgress {
  progress: number;
  stage: 'bundling' | 'rendering' | 'encoding' | 'complete' | 'error';
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

export class RemotionExportService {
  private abortSignal: AbortSignal | null = null;
  private isAborting: boolean = false;

  /**
   * Export video using Remotion via IPC
   */
  async export(
    segments: TimelineSegment[],
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: RemotionExportProgress) => void,
    abortSignal?: AbortSignal,
    projectFolder?: string
  ): Promise<Blob> {
    this.abortSignal = abortSignal || null;
    this.isAborting = false;
    
    // Set up abort handler - use direct invoke instead of ipcRenderer property
    if (this.abortSignal) {
      this.abortSignal.addEventListener('abort', () => {
        this.isAborting = true;
        logger.info('Export aborted by user');
        
        // Cancel export in main process - use direct invoke method if available
        if (window.electronAPI?.ipcRenderer?.invoke) {
          window.electronAPI.ipcRenderer.invoke('export-cancel').catch(() => {});
        }
      });
    }

    try {
      // Check if we're in Electron
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('Export requires Electron environment');
      }

      // Log what's available for debugging
      logger.info('Available electronAPI methods:', Object.keys(window.electronAPI));
      
      // Deep check for nested properties
      const hasIpcRenderer = window.electronAPI.ipcRenderer && 
                             typeof window.electronAPI.ipcRenderer.invoke === 'function' &&
                             typeof window.electronAPI.ipcRenderer.on === 'function' &&
                             typeof window.electronAPI.ipcRenderer.removeListener === 'function';

      if (!hasIpcRenderer) {
        // Log detailed debugging info
        logger.error('IPC renderer check failed. Available properties:', {
          hasIpcRenderer: !!window.electronAPI.ipcRenderer,
          ipcRendererType: typeof window.electronAPI.ipcRenderer,
          ipcRendererKeys: window.electronAPI.ipcRenderer ? Object.keys(window.electronAPI.ipcRenderer) : 'undefined',
          electronAPIKeys: Object.keys(window.electronAPI)
        });
        
        throw new Error('IPC renderer not properly initialized. Export cannot proceed.');
      }
      
      logger.info('IPC renderer verified and ready')

      const totalDuration = this.calculateTotalDuration(segments);
      const fps = settings.framerate || 30;
      const totalFrames = Math.ceil((totalDuration / 1000) * fps);

      logger.info(`Remotion export: ${totalFrames} frames at ${fps}fps`);

      onProgress?.({
        progress: 5,
        stage: 'bundling',
        message: 'Preparing export...'
      });

      // Convert Maps to plain objects for IPC
      const exportData = {
        segments,
        recordings: Array.from(recordings.entries()),
        metadata: Array.from(metadata.entries()),
        settings,
        projectFolder
      };

      // Listen for progress updates
      const progressHandler = (_event: any, data: any) => {
        if (this.abortSignal?.aborted || this.isAborting) {
          window.electronAPI!.ipcRenderer.removeListener('export-progress', progressHandler);
          return;
        }

        const chunkIndex = typeof data.chunkIndex === 'number' ? data.chunkIndex : null;
        const chunkCount = typeof data.chunkCount === 'number' ? data.chunkCount : null;
        const chunkRendered = typeof data.chunkRenderedFrames === 'number' ? data.chunkRenderedFrames : null;
        const chunkTotal = typeof data.chunkTotalFrames === 'number' ? data.chunkTotalFrames : null;

        // Don't try to display frame numbers since they're not provided
        // to avoid flickering with multiple workers
        const message = data.message || `Rendering ${Math.round(data.progress)}% complete`;

        onProgress?.({
          progress: data.progress,
          stage: 'encoding',
          message
          // Don't pass currentFrame/totalFrames as they're undefined
        });
      };

      window.electronAPI!.ipcRenderer.on('export-progress', progressHandler);

      // Check if already aborted
      if (this.abortSignal?.aborted || this.isAborting) {
        window.electronAPI!.ipcRenderer.removeListener('export-progress', progressHandler);
        throw new Error('Export aborted');
      }

      // Call main process to handle export
      const result = await window.electronAPI!.ipcRenderer.invoke('export-video', exportData);

      // Clean up listener
      window.electronAPI!.ipcRenderer.removeListener('export-progress', progressHandler);

      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      let blob: Blob;
      
      if (result.isStream) {
        // Handle streaming for large files
        logger.info(`Streaming large file: ${result.fileSize} bytes`);
        
        const chunks: Uint8Array[] = [];
        const chunkSize = 5 * 1024 * 1024; // 5MB chunks
        let offset = 0;
        
        while (offset < result.fileSize) {
          // Check for abort
          if (this.abortSignal?.aborted || this.isAborting) {
            // Clean up temp file
            await window.electronAPI!.ipcRenderer.invoke('export-cleanup', {
              filePath: result.filePath
            }).catch(() => {});
            throw new Error('Export aborted during streaming');
          }
          
          const length = Math.min(chunkSize, result.fileSize - offset);
          
          const chunkResult = await window.electronAPI!.ipcRenderer.invoke('export-stream-chunk', {
            filePath: result.filePath,
            offset,
            length
          });
          
          if (!chunkResult.success) {
            throw new Error('Failed to stream file chunk');
          }
          
          // Decode chunk
          const binaryString = atob(chunkResult.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          chunks.push(bytes);
          
          offset += length;
          
          // Update progress
          const streamProgress = 95 + (offset / result.fileSize) * 5;
          onProgress?.({
            progress: streamProgress,
            stage: 'encoding',
            message: `Processing: ${Math.round(offset / 1024 / 1024)}MB / ${Math.round(result.fileSize / 1024 / 1024)}MB`
          });
        }
        
        // Combine chunks into blob
        blob = new Blob(chunks as BlobPart[], {
          type: settings.format === 'webm' ? 'video/webm' : 'video/mp4'
        });
        
        // Clean up temp file
        await window.electronAPI!.ipcRenderer.invoke('export-cleanup', {
          filePath: result.filePath
        });
      } else {
        // Small file - use base64 directly
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        blob = new Blob([bytes], {
          type: settings.format === 'webm' ? 'video/webm' : 'video/mp4'
        });
      }

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!'
        // Don't include frame numbers
      });

      return blob;

    } catch (error) {
      logger.error('Remotion export failed:', error);
      
      // Check if it was an abort
      const isAbort = this.isAborting || this.abortSignal?.aborted || 
                      (error instanceof Error && error.message.includes('abort'));
      
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: isAbort ? 'Export canceled' : `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      throw error;
    } finally {
      // Clean up
      this.abortSignal = null;
      this.isAborting = false;
    }
  }

  /**
   * Calculate total duration of all segments
   */
  private calculateTotalDuration(segments: TimelineSegment[]): number {
    if (segments.length === 0) return 0;
    
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    
    return lastSegment.endTime - firstSegment.startTime;
  }
}

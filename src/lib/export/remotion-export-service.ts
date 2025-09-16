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

  /**
   * Export video using Remotion via IPC
   */
  async export(
    segments: TimelineSegment[],
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings,
    onProgress?: (progress: RemotionExportProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<Blob> {
    this.abortSignal = abortSignal || null;

    try {
      // Check if we're in Electron
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('Export requires Electron environment');
      }

      // Log what's available for debugging
      console.log('Available electronAPI methods:', Object.keys(window.electronAPI));

      // Check if ipcRenderer is available
      if (!window.electronAPI.ipcRenderer) {
        console.error('IPC renderer not found. Available methods:', Object.keys(window.electronAPI));
        throw new Error('IPC renderer not available. Export cannot proceed.');
      }

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
        settings
      };

      // Listen for progress updates
      const progressHandler = (_event: any, data: any) => {
        if (this.abortSignal?.aborted) {
          window.electronAPI!.ipcRenderer.removeListener('export-progress', progressHandler);
          return;
        }

        onProgress?.({
          progress: data.progress,
          stage: 'encoding',
          message: `Rendering frame ${data.currentFrame} of ${data.totalFrames}...`,
          currentFrame: data.currentFrame,
          totalFrames: data.totalFrames
        });
      };

      window.electronAPI!.ipcRenderer.on('export-progress', progressHandler);

      // Call main process to handle export
      const result = await window.electronAPI!.ipcRenderer.invoke('export-video', exportData);

      // Clean up listener
      window.electronAPI!.ipcRenderer.removeListener('export-progress', progressHandler);

      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      // Convert base64 back to Blob
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], {
        type: settings.format === 'webm' ? 'video/webm' : 'video/mp4'
      });

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete!',
        currentFrame: totalFrames,
        totalFrames
      });

      return blob;

    } catch (error) {
      logger.error('Remotion export failed:', error);
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
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
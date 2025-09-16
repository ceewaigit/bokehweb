/**
 * Simplified export service using Remotion's built-in renderMedia
 * Replaces complex WebCodecs implementation with battle-tested Remotion renderer
 */

import type { ExportSettings, Recording, RecordingMetadata } from '@/types';
import type { TimelineSegment } from './timeline-processor';
import { logger } from '@/lib/utils/logger';

// Dynamic imports for Electron environment
let renderMedia: any;
let selectComposition: any;
let bundle: any;
let path: any;
let fs: any;

// Load Node modules dynamically in Electron
if (typeof window !== 'undefined' && window.require) {
  // Electron renderer process
  path = window.require('path');
  fs = window.require('fs').promises;
  
  // Load Remotion modules
  const remotionRenderer = window.require('@remotion/renderer');
  renderMedia = remotionRenderer.renderMedia;
  selectComposition = remotionRenderer.selectComposition;
  
  const remotionBundler = window.require('@remotion/bundler');
  bundle = remotionBundler.bundle;
} else if (typeof require !== 'undefined') {
  // Electron main process or Node.js
  path = require('path');
  fs = require('fs').promises;
  
  const remotionRenderer = require('@remotion/renderer');
  renderMedia = remotionRenderer.renderMedia;
  selectComposition = remotionRenderer.selectComposition;
  
  const remotionBundler = require('@remotion/bundler');
  bundle = remotionBundler.bundle;
}

export interface RemotionExportProgress {
  progress: number;
  stage: 'bundling' | 'rendering' | 'encoding' | 'complete' | 'error';
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

export class RemotionExportService {
  private bundleLocation: string | null = null;
  private abortSignal: AbortSignal | null = null;

  /**
   * Export video using Remotion's renderMedia with all effects
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
      // Calculate total duration
      const totalDuration = this.calculateTotalDuration(segments);
      const fps = settings.framerate || 30;
      const totalFrames = Math.ceil((totalDuration / 1000) * fps);
      
      logger.info(`Remotion export: ${totalFrames} frames at ${fps}fps`);
      
      // Step 1: Bundle the Remotion project
      onProgress?.({
        progress: 5,
        stage: 'bundling',
        message: 'Preparing Remotion bundle...'
      });
      
      const entryPoint = path.join(process.cwd(), 'src/remotion/index.ts');
      this.bundleLocation = await bundle({
        entryPoint,
        webpackOverride: (config: any) => {
          const resolvedPath = path.resolve(process.cwd(), 'src');
          return {
            ...config,
            resolve: {
              ...config.resolve,
              alias: {
                ...config.resolve?.alias,
                '@': resolvedPath,
                '@/types': path.join(resolvedPath, 'types'),
                '@/lib': path.join(resolvedPath, 'lib'),
                '@/remotion': path.join(resolvedPath, 'remotion'),
              },
              extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
            },
          };
        },
      });
      
      // Step 2: Prepare composition props
      const inputProps = this.prepareCompositionProps(
        segments,
        recordings,
        metadata,
        settings
      );
      
      // Step 3: Get composition details
      const composition = await selectComposition({
        serveUrl: this.bundleLocation,
        id: 'MainComposition',
        inputProps,
      });
      
      // Step 4: Render the video
      onProgress?.({
        progress: 10,
        stage: 'rendering',
        message: 'Starting video render...',
        totalFrames
      });
      
      const outputPath = path.join(
        process.cwd(),
        'temp',
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      // Ensure temp directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      await renderMedia({
        composition,
        serveUrl: this.bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        onProgress: (info: any) => {
          if (this.abortSignal?.aborted) {
            throw new Error('Export cancelled');
          }
          
          const progress = Math.min(95, 10 + (info.progress * 85));
          onProgress?.({
            progress,
            stage: 'encoding',
            message: `Rendering frame ${info.renderedFrames} of ${totalFrames}...`,
            currentFrame: info.renderedFrames,
            totalFrames
          });
        },
        // Performance optimizations
        concurrency: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
        imageFormat: 'jpeg',
        jpegQuality: settings.quality === 'high' ? 95 : 85,
        scale: 1,
        videoBitrate: this.getVideoBitrate(settings),
        audioBitrate: '128k',
        everyNthFrame: 1,
        numberOfGifLoops: null,
        cancelSignal: this.abortSignal || undefined,
      });
      
      // Step 5: Read the output file as blob
      onProgress?.({
        progress: 98,
        stage: 'encoding',
        message: 'Finalizing export...'
      });
      
      const buffer = await fs.readFile(outputPath);
      const blob = new Blob([buffer], { 
        type: settings.format === 'webm' ? 'video/webm' : 'video/mp4' 
      });
      
      // Clean up temp file
      await fs.unlink(outputPath).catch(() => {});
      
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
    } finally {
      await this.cleanup();
    }
  }
  
  /**
   * Prepare props for Remotion composition
   */
  private prepareCompositionProps(
    segments: TimelineSegment[],
    recordings: Map<string, Recording>,
    metadata: Map<string, RecordingMetadata>,
    settings: ExportSettings
  ) {
    // Get first recording for main video
    const firstSegment = segments[0];
    const firstClip = firstSegment?.clips[0];
    const recording = firstClip ? recordings.get(firstClip.recording.id) : null;
    const recordingMeta = recording ? metadata.get(recording.id) : null;
    
    // Convert segments to Remotion-compatible format
    const timelineClips = segments.flatMap(segment => 
      segment.clips.map(clipData => ({
        ...clipData.clip,
        effects: segment.effects || [],
        recordingId: clipData.recording.id,
      }))
    );
    
    return {
      // Main video URL (will be handled by Remotion)
      videoUrl: recording?.filePath || '',
      
      // Timeline data
      clips: timelineClips,
      effects: segments.flatMap(s => s.effects || []),
      
      // Metadata for effects
      cursorEvents: recordingMeta?.mouseEvents || [],
      clickEvents: recordingMeta?.clickEvents || [],
      keystrokeEvents: (recordingMeta as any)?.keystrokeEvents || [],
      
      // Resolution
      videoWidth: settings.resolution.width,
      videoHeight: settings.resolution.height,
      
      // Export settings
      fps: settings.framerate || 30,
      quality: settings.quality || 'high',
    };
  }
  
  /**
   * Get video bitrate based on quality settings
   */
  private getVideoBitrate(settings: ExportSettings): string {
    const { width, height } = settings.resolution;
    const pixels = width * height;
    
    // Base bitrate calculation
    let bitrate = 5000000; // 5 Mbps base
    
    // Adjust for resolution
    if (pixels > 1920 * 1080) {
      bitrate = 12000000; // 12 Mbps for 4K
    } else if (pixels > 1280 * 720) {
      bitrate = 8000000; // 8 Mbps for 1080p
    }
    
    // Adjust for quality
    if (settings.quality === 'low') {
      bitrate *= 0.5;
    } else if (settings.quality === 'medium') {
      bitrate *= 0.75;
    }
    
    // Convert to K or M format as required by Remotion
    if (bitrate >= 1000000) {
      return `${Math.floor(bitrate / 1000000)}M`;
    } else {
      return `${Math.floor(bitrate / 1000)}K`;
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
  
  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Clean up bundle location if it exists
    if (this.bundleLocation) {
      try {
        await fs.rm(this.bundleLocation, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to clean up bundle:', error);
      }
      this.bundleLocation = null;
    }
  }
}
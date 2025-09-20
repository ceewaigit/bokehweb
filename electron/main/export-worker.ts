/**
 * Export Worker Process with MessagePort IPC
 * Handles video export with supervision and error recovery
 * Optimized for memory efficiency using Remotion best practices
 */

import { BaseWorker } from './utils/base-worker';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { tmpdir } from 'os';

interface ExportJob {
  bundleLocation: string;
  compositionMetadata: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    id: string;
    defaultProps: any;
  };
  inputProps: any;
  outputPath: string;
  settings: {
    format?: string;
    framerate?: number;
    quality?: string;
    resolution?: { width: number; height: number };
  };
  offthreadVideoCacheSizeInBytes: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: string;
  useGPU: boolean;
  ffmpegPath: string;
  compositorDir: string | null;
}

class ExportWorker extends BaseWorker {
  private currentExport: {
    isActive: boolean;
    tempFiles: string[];
  } | null = null;

  protected onInit(): void {
    console.log('[ExportWorker] Initialized with MessagePort IPC');
  }

  protected async onRequest(method: string, data: any): Promise<any> {
    switch (method) {
      case 'export':
        return this.performExport(data);
      
      case 'status':
        return this.getStatus();
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  protected async onMessage(method: string, data: any): Promise<void> {
    switch (method) {
      case 'cancel':
        await this.cancelExport();
        break;
      
      default:
        console.warn(`[ExportWorker] Unknown message: ${method}`);
    }
  }

  protected async onShutdown(): Promise<void> {
    await this.cleanup();
  }

  private async performExport(job: ExportJob): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Initialize export state
      this.currentExport = {
        isActive: true,
        tempFiles: []
      };

      // Send progress updates
      this.send('progress', {
        progress: 5,
        stage: 'preparing',
        message: 'Initializing export...'
      });

      // Lazy load Remotion modules
      const { renderMedia } = await import('@remotion/renderer');
      
      // Use pre-selected composition metadata from main process
      if (!job.compositionMetadata) {
        throw new Error('Composition metadata is required');
      }
      
      const composition = {
        ...job.compositionMetadata,
        props: job.inputProps
      };
      
      console.log('[ExportWorker] Using pre-selected composition metadata');

      const fps = job.settings.framerate || composition.fps;
      const totalFrames = composition.durationInFrames;
      const durationInSeconds = totalFrames / fps;
      
      console.log(`[ExportWorker] Starting export: ${totalFrames} frames at ${fps}fps (${durationInSeconds.toFixed(1)}s)`);

      // Determine if we need chunked rendering
      const CHUNK_SIZE_FRAMES = 2000; // ~1 minute at 30fps, ~33s at 60fps
      const needsChunking = totalFrames > CHUNK_SIZE_FRAMES;

      if (needsChunking) {
        console.log(`[ExportWorker] Using chunked rendering for ${totalFrames} frames`);
        return await this.performChunkedExport(job, composition, totalFrames, CHUNK_SIZE_FRAMES, startTime);
      } else {
        console.log(`[ExportWorker] Using single-pass rendering for ${totalFrames} frames`);
        return await this.performSingleExport(job, composition, totalFrames, startTime);
      }

    } catch (error) {
      console.error('[ExportWorker] Export failed:', error);
      await this.cleanup();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async performSingleExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    startTime: number = Date.now()
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    
    const { renderMedia } = await import('@remotion/renderer');
    
    // Send progress updates
    this.send('progress', {
      progress: 10,
      stage: 'rendering',
      message: 'Starting render engine...'
    });

    let lastReportedFrame = 0;
    let lastProgressUpdate = Date.now();

    // Use renderMedia for memory-efficient single-pass rendering
    await renderMedia({
      serveUrl: job.bundleLocation,
      composition,
      inputProps: job.inputProps,
      outputLocation: job.outputPath,
      codec: 'h264',
      videoBitrate: job.videoBitrate,
      jpegQuality: job.jpegQuality,
      imageFormat: 'jpeg',
      concurrency: 1, // Keep low for memory stability
      offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
      chromiumOptions: {
        gl: process.platform === 'darwin' ? 'angle' : 'swangle', // Use angle on macOS, swangle on Linux/Windows
        enableMultiProcessOnLinux: true,
      },
      binariesDirectory: job.compositorDir,
      disallowParallelEncoding: true, // Trade speed for memory stability
      logLevel: 'verbose',
      onStart: ({ resolvedConcurrency, parallelEncoding }) => {
        console.log(`[ExportWorker] Rendering with concurrency=${resolvedConcurrency}, parallelEncoding=${parallelEncoding}`);
      },
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const now = Date.now();
        
        // Update progress at most every 500ms
        if (now - lastProgressUpdate > 500 || renderedFrames === totalFrames) {
          lastProgressUpdate = now;
          lastReportedFrame = renderedFrames;
          
          const progressPercent = 10 + Math.round((renderedFrames / totalFrames) * 85);
          
          this.send('progress', {
            progress: progressPercent,
            currentFrame: renderedFrames,
            totalFrames,
            stage: 'rendering',
            message: `Rendering frame ${renderedFrames} of ${totalFrames}`
          });
        }
      }
    });

    // Finalize
    this.send('progress', {
      progress: 95,
      stage: 'finalizing',
      message: 'Finalizing video...'
    });

    // Get file size
    const stats = await fs.stat(job.outputPath);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`[ExportWorker] Export complete in ${duration.toFixed(1)}s`);

    await this.cleanup();

    return {
      success: true,
      outputPath: job.outputPath
    };
  }

  private async performChunkedExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    chunkSize: number,
    startTime: number = Date.now()
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    
    const { renderMedia } = await import('@remotion/renderer');
    
    const chunks: string[] = [];
    const numChunks = Math.ceil(totalFrames / chunkSize);
    
    console.log(`[ExportWorker] Rendering ${numChunks} chunks of ${chunkSize} frames each`);

    try {
      for (let i = 0; i < numChunks; i++) {
        const startFrame = i * chunkSize;
        const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1);
        const chunkFrames = endFrame - startFrame + 1;
        
        // Create temp file for this chunk
        const chunkPath = path.join(tmpdir(), `remotion-chunk-${i}-${Date.now()}.mp4`);
        chunks.push(chunkPath);
        this.currentExport?.tempFiles.push(chunkPath);
        
        console.log(`[ExportWorker] Rendering chunk ${i + 1}/${numChunks}: frames ${startFrame}-${endFrame}`);
        
        // Calculate time range for this chunk
        const fps = job.settings.framerate || composition.fps || 30;
        const chunkStartTimeMs = (startFrame / fps) * 1000;
        const chunkEndTimeMs = (endFrame / fps) * 1000;
        
        // Filter segments for this chunk's time range
        let chunkInputProps = { ...job.inputProps };
        if (job.inputProps.segments && Array.isArray(job.inputProps.segments)) {
          const allSegments = job.inputProps.segments;
          const chunkSegments = allSegments.filter((segment: any) => {
            // Include segment if it overlaps with this chunk's time range
            const segmentStartMs = segment.startTime;
            const segmentEndMs = segment.endTime;
            return segmentEndMs >= chunkStartTimeMs && segmentStartMs <= chunkEndTimeMs;
          });
          
          // Extract only the recording IDs used in this chunk
          const recordingIds = new Set<string>();
          chunkSegments.forEach((segment: any) => {
            if (segment.clips && Array.isArray(segment.clips)) {
              segment.clips.forEach((clipData: any) => {
                if (clipData.recording?.id) {
                  recordingIds.add(clipData.recording.id);
                }
              });
            }
          });
          
          console.log(`[ExportWorker] Chunk ${i + 1}: Using ${recordingIds.size} recordings`);
          
          // Create minimal segments with adjusted times
          const minimalSegments = chunkSegments.map((segment: any) => ({
            id: segment.id,
            startTime: Math.max(0, segment.startTime - chunkStartTimeMs),
            endTime: segment.endTime - chunkStartTimeMs,
            clips: segment.clips?.map((clipData: any) => ({
              clip: {
                recordingId: clipData.clip?.recordingId,
                startTime: clipData.clip?.startTime,
                endTime: clipData.clip?.endTime
              },
              recording: {
                id: clipData.recording?.id,
                filePath: clipData.recording?.filePath
              },
              segmentStartTime: clipData.segmentStartTime,
              segmentEndTime: clipData.segmentEndTime
            })) || [],
            effects: segment.effects || []
          }));
          
          // Filter data to only what's needed for this chunk
          chunkInputProps = {
            segments: minimalSegments,
            recordings: Object.fromEntries(
              Object.entries(job.inputProps.recordings || {})
                .filter(([id]) => recordingIds.has(id))
            ),
            metadata: Object.fromEntries(
              Object.entries(job.inputProps.metadata || {})
                .filter(([id]) => recordingIds.has(id))
            ),
            videoUrls: Object.fromEntries(
              Object.entries(job.inputProps.videoUrls || {})
                .filter(([id]) => recordingIds.has(id))
            ),
            framerate: job.inputProps.framerate,
            resolution: job.inputProps.resolution,
            quality: job.inputProps.quality
          };
          
          console.log(`[ExportWorker] Chunk ${i + 1}: Filtered to ${chunkSegments.length} segments from ${allSegments.length} total`);
        }
        
        // Update progress
        const baseProgress = (i / numChunks) * 80;
        this.send('progress', {
          progress: 10 + Math.round(baseProgress),
          stage: 'rendering',
          message: `Rendering chunk ${i + 1} of ${numChunks}...`,
          currentFrame: startFrame,
          totalFrames
        });

        // Render this chunk with filtered segments
        await renderMedia({
          serveUrl: job.bundleLocation,
          composition,
          inputProps: chunkInputProps,
          outputLocation: chunkPath,
          codec: 'h264',
          videoBitrate: job.videoBitrate,
          jpegQuality: job.jpegQuality,
          imageFormat: 'jpeg',
          frameRange: [startFrame, endFrame],
          concurrency: 1,
          offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
          chromiumOptions: {
            gl: process.platform === 'darwin' ? 'angle' : 'swangle',
            enableMultiProcessOnLinux: true,
          },
          binariesDirectory: job.compositorDir,
          disallowParallelEncoding: true,
          logLevel: 'info',
          onProgress: ({ renderedFrames }) => {
            const chunkProgress = renderedFrames / chunkFrames;
            const totalProgress = 10 + ((i + chunkProgress) / numChunks) * 80;
            
            this.send('progress', {
              progress: Math.round(totalProgress),
              currentFrame: startFrame + renderedFrames,
              totalFrames,
              stage: 'rendering',
              message: `Rendering chunk ${i + 1}/${numChunks}: frame ${renderedFrames}/${chunkFrames}`
            });
          }
        });

        // Force garbage collection between chunks if available
        if (global.gc) {
          global.gc();
        }
      }

      // Combine chunks
      this.send('progress', {
        progress: 90,
        stage: 'finalizing',
        message: 'Combining video chunks...'
      });

      console.log(`[ExportWorker] Combining ${chunks.length} chunks into final video`);
      
      // Use FFmpeg directly to concatenate videos
      const concatListPath = path.join(tmpdir(), `concat-${Date.now()}.txt`);
      this.currentExport?.tempFiles.push(concatListPath);
      
      // Create concat file
      const concatContent = chunks.map(chunk => `file '${chunk}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);
      
      // Run FFmpeg concat
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        job.outputPath
      ];
      
      const ffmpegProcess = spawn(job.ffmpegPath, ffmpegArgs);
      
      await new Promise<void>((resolve, reject) => {
        ffmpegProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg concat failed with code ${code}`));
          }
        });
        ffmpegProcess.on('error', reject);
      });

      // Clean up chunk files
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => {});
      }

      this.send('progress', {
        progress: 95,
        stage: 'finalizing',
        message: 'Finalizing video...'
      });

      await this.cleanup();

      return {
        success: true,
        outputPath: job.outputPath
      };

    } catch (error) {
      // Clean up chunk files on error
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => {});
      }
      throw error;
    }
  }

  private async cancelExport(): Promise<void> {
    console.log('[ExportWorker] Cancelling export...');
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (!this.currentExport) return;

    // Clean up any temp files
    for (const tempFile of this.currentExport.tempFiles) {
      await fs.unlink(tempFile).catch(() => {});
    }

    this.currentExport = null;
  }

  private getStatus(): { isExporting: boolean } {
    return {
      isExporting: this.currentExport?.isActive || false
    };
  }
}

// Create and start the worker
const worker = new ExportWorker();
console.log('[ExportWorker] Worker process started');
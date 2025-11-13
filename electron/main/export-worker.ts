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

interface ChunkAssignment {
  index: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
}

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
  concurrency?: number;
  ffmpegPath: string;
  compositorDir: string | null;
  chunkSizeFrames?: number;
  assignedChunks?: ChunkAssignment[];
  totalChunks?: number;
  totalFrames?: number;
  combineChunksInWorker?: boolean;
  preFilteredMetadata?: Record<number, Record<string, any>> | Map<number, Map<string, any>>; // Pre-filtered metadata by chunk
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

      const exportStartTime = Date.now();
      console.log(`[ExportWorker] Starting export: ${totalFrames} frames at ${fps}fps (${durationInSeconds.toFixed(1)}s)`);

      // Determine if we need chunked rendering
      const chunkAssignments = Array.isArray(job.assignedChunks) && job.assignedChunks.length > 0
        ? job.assignedChunks
        : null;

      const chunkSize = job.chunkSizeFrames ?? 2000;
      const needsChunking = totalFrames > chunkSize || !!chunkAssignments;

      if (needsChunking) {
        console.log(`[ExportWorker] Using chunked rendering for ${totalFrames} frames`);
        return await this.performChunkedExport(
          job,
          composition,
          totalFrames,
          chunkSize,
          startTime,
          chunkAssignments || undefined,
          job.combineChunksInWorker !== false
        );
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
    // CRITICAL FIX: Use ?? instead of || to properly handle 0 and 1 values
    // The || operator treats 0 as falsy, but ?? only treats null/undefined as nullish
    const renderConcurrency = Math.max(1, job.concurrency ?? 1);

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
      // OPTIMIZED: Lower JPEG quality for better performance (70 is sweet spot)
      jpegQuality: Math.min(job.jpegQuality || 70, 75), // Cap at 75 max
      imageFormat: 'jpeg',
      concurrency: renderConcurrency,
      enforceAudioTrack: false, // Don't require audio track
      offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
      // Enable aggressive caching and preloading
      numberOfGifLoops: null,
      everyNthFrame: 1, // Process every frame
      preferLossless: false, // Prefer speed over lossless
      chromiumOptions: {
        // OPTIMIZED: Enable GPU acceleration for hardware video decoding
        gl: job.useGPU ? 'angle' : 'swangle', // Use ANGLE for GPU, swangle for software
        headless: true,
        enableMultiProcessOnLinux: true,
        disableWebSecurity: false,
        ignoreCertificateErrors: false,
        // Add explicit GPU acceleration flags for video decoding
        ...(job.useGPU ? {
          // Enable hardware video decoding on macOS/Windows/Linux
          enableAcceleratedVideoDecode: true,
          // Use native GL instead of SwiftShader for better performance
          ignoreGpuBlocklist: true,
        } : {}),
        // PERFORMANCE: Enable OffscreenCanvas for faster canvas operations
        // OffscreenCanvas allows rendering to happen off the main thread
        userAgent: undefined, // Keep default
        ...({ chromiumSandbox: true, enableFakeUserMedia: false } as any), // Cast to bypass type check
      },
      binariesDirectory: job.compositorDir,
      // CRITICAL FIX: Force single-threaded rendering when concurrency=1
      // Remotion may override concurrency setting, so explicitly disable parallel encoding
      disallowParallelEncoding: renderConcurrency === 1,
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
    const framesPerSecond = totalFrames / duration;

    console.log(`[ExportWorker] ✅ Export complete in ${duration.toFixed(1)}s (${framesPerSecond.toFixed(1)} fps, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

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
    startTime: number = Date.now(),
    providedChunks?: ChunkAssignment[],
    combineChunksInWorker: boolean = true
  ): Promise<{ success: boolean; outputPath?: string; error?: string; chunkResults?: Array<{ index: number; path: string }> }> {

    const { renderMedia } = await import('@remotion/renderer');

    const chunks: string[] = [];
    const preservedChunkResults: Array<{ index: number; path: string }> = [];
    // CRITICAL FIX: Use ?? instead of || to properly handle 0 and 1 values
    const renderConcurrency = Math.max(1, job.concurrency ?? 1);

    const chunkPlan: ChunkAssignment[] = providedChunks && providedChunks.length > 0
      ? [...providedChunks].sort((a, b) => a.index - b.index)
      : this.buildChunkPlan(totalFrames, chunkSize, job.settings.framerate || composition.fps || 30);

    const totalChunkCount = job.totalChunks ?? chunkPlan.length;
    const fps = job.settings.framerate || composition.fps || 30;
    const numChunks = chunkPlan.length;

    console.log(`[ExportWorker] Rendering ${numChunks} chunks of ${chunkSize} frames each (combine=${combineChunksInWorker})`);

    try {
      for (let i = 0; i < numChunks; i++) {
        const chunkInfo = chunkPlan[i];
        const startFrame = chunkInfo.startFrame;
        const endFrame = chunkInfo.endFrame;
        const chunkFrames = endFrame - startFrame + 1;

        if (chunkFrames <= 0) {
          console.warn(`[ExportWorker] Skipping empty chunk ${chunkInfo.index + 1}/${totalChunkCount}`);
          continue;
        }

        // Create temp file for this chunk
        const chunkPath = path.join(tmpdir(), `remotion-chunk-${i}-${Date.now()}.mp4`);
        chunks.push(chunkPath);
        if (combineChunksInWorker) {
          this.currentExport?.tempFiles.push(chunkPath);
        }

        const chunkStartTime = Date.now();
        console.log(`[ExportWorker] Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frames ${startFrame}-${endFrame}`);

        // Calculate time range for this chunk
        const chunkStartTimeMs = chunkInfo.startTimeMs;
        const chunkEndTimeMs = chunkInfo.endTimeMs;

        // Use pre-filtered metadata if available, otherwise filter on demand
        let chunkInputProps = { ...job.inputProps };
        let filteredMetadata: any = {};
        let usingPreFiltered = false;

        // Check if we have pre-filtered metadata for this chunk
        if (job.preFilteredMetadata) {
          // Handle both Map and plain object formats
          let chunkMetadata: any;
          if (job.preFilteredMetadata instanceof Map) {
            chunkMetadata = job.preFilteredMetadata.get(chunkInfo.index);
            if (chunkMetadata instanceof Map) {
              filteredMetadata = Object.fromEntries(chunkMetadata);
              usingPreFiltered = true;
            } else if (chunkMetadata) {
              filteredMetadata = chunkMetadata;
              usingPreFiltered = true;
            }
          } else {
            // Plain object format from IPC
            chunkMetadata = job.preFilteredMetadata[chunkInfo.index];
            if (chunkMetadata && typeof chunkMetadata === 'object') {
              filteredMetadata = chunkMetadata;
              usingPreFiltered = true;
            }
          }

          if (usingPreFiltered && Object.keys(filteredMetadata).length > 0) {
            console.log(`[ExportWorker] ✓ Using pre-filtered metadata for chunk ${chunkInfo.index + 1} (${Object.keys(filteredMetadata).length} recordings)`);
          } else if (job.preFilteredMetadata) {
            console.log(`[ExportWorker] ⚠️ Pre-filtered metadata provided but empty for chunk ${chunkInfo.index + 1}, will filter on-demand`);
          }
        }

        // MainComposition doesn't need segment filtering - pass props through directly
        // Remotion's chunking handles memory management, we just render the full composition
        chunkInputProps = {
          ...job.inputProps,
          // Keep the full metadata (already filtered by export-handler if needed)
          metadata: usingPreFiltered ? filteredMetadata : job.inputProps.metadata,
          frameOffset: startFrame
        };

        // Update progress
        const baseProgress = (chunkInfo.index / Math.max(1, totalChunkCount)) * 80;
        this.send('progress', {
          progress: 10 + Math.round(baseProgress),
          stage: 'rendering',
          message: `Rendering chunk ${chunkInfo.index + 1} of ${totalChunkCount}...`,
          currentFrame: startFrame,
          totalFrames,
          chunkIndex: chunkInfo.index,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: 0,
          chunkTotalFrames: chunkFrames,
          chunkStartFrame: startFrame,
          chunkEndFrame: endFrame
        });

        // Render this chunk with filtered segments
        const chunkComposition = {
          ...composition,
          // Keep full duration so frameRange maps to absolute frames
          durationInFrames: composition.durationInFrames,
          props: chunkInputProps,
        };

        const chunkFrameRange: [number, number] = [startFrame, endFrame];

        await renderMedia({
          serveUrl: job.bundleLocation,
          composition: chunkComposition,
          inputProps: chunkInputProps,
          outputLocation: chunkPath,
          codec: 'h264',
          videoBitrate: job.videoBitrate,
          // OPTIMIZED: Lower JPEG quality for better performance (70 is sweet spot)
          jpegQuality: Math.min(job.jpegQuality || 70, 75), // Cap at 75 max
          imageFormat: 'jpeg',
          frameRange: chunkFrameRange,
          concurrency: renderConcurrency,
          enforceAudioTrack: false, // Don't require audio track
          offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
          // Enable aggressive caching
          numberOfGifLoops: null,
          everyNthFrame: 1,
          preferLossless: false, // Prefer speed
          chromiumOptions: {
            // OPTIMIZED: Enable GPU acceleration for hardware video decoding
            gl: job.useGPU ? 'angle' : 'swangle', // Use ANGLE for GPU, swangle for software
            headless: true,
            enableMultiProcessOnLinux: true,
            disableWebSecurity: false,
            ignoreCertificateErrors: false,
            // Add explicit GPU acceleration flags for video decoding
            ...(job.useGPU ? {
              enableAcceleratedVideoDecode: true,
              ignoreGpuBlocklist: true,
            } : {}),
            // PERFORMANCE: Enable optimizations
            userAgent: undefined,
            ...({ chromiumSandbox: true, enableFakeUserMedia: false } as any),
          },
          binariesDirectory: job.compositorDir,
          // CRITICAL FIX: Force single-threaded rendering when concurrency=1
          disallowParallelEncoding: renderConcurrency === 1,
          logLevel: 'info',
          onProgress: ({ renderedFrames }) => {
            const chunkProgress = renderedFrames / chunkFrames;
            const totalProgress = 10 + ((chunkInfo.index + chunkProgress) / Math.max(1, totalChunkCount)) * 80;

            this.send('progress', {
              progress: Math.round(totalProgress),
              currentFrame: startFrame + renderedFrames,
              totalFrames,
              stage: 'rendering',
              message: `Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frame ${renderedFrames}/${chunkFrames}`,
              chunkIndex: chunkInfo.index,
              chunkCount: totalChunkCount,
              chunkRenderedFrames: renderedFrames,
              chunkTotalFrames: chunkFrames,
              chunkStartFrame: startFrame,
              chunkEndFrame: endFrame
            });
          }
        });

        const chunkDuration = (Date.now() - chunkStartTime) / 1000;
        const chunkFps = chunkFrames / chunkDuration;
        console.log(`[ExportWorker] ✓ Chunk ${chunkInfo.index + 1} complete in ${chunkDuration.toFixed(1)}s (${chunkFps.toFixed(1)} fps)`);

        // Force garbage collection between chunks if available
        if (global.gc) {
          global.gc();
        }
      }

      if (!combineChunksInWorker) {
        preservedChunkResults.push(...chunks.map((chunkPath, idx) => ({
          index: chunkPlan[idx].index,
          path: chunkPath
        })));

        const lastChunk = chunkPlan[chunkPlan.length - 1];
        const lastChunkFrames = lastChunk ? lastChunk.endFrame - lastChunk.startFrame + 1 : 0;

        this.send('progress', {
          progress: Math.min(90, 10 + Math.round(((lastChunk?.index ?? 0) + 1) / Math.max(1, totalChunkCount) * 80)),
          stage: 'rendering',
          message: 'Chunk rendering complete',
          chunkIndex: lastChunk?.index ?? 0,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: lastChunkFrames,
          chunkTotalFrames: lastChunkFrames,
          chunkStartFrame: lastChunk?.startFrame ?? 0,
          chunkEndFrame: lastChunk?.endFrame ?? 0
        });

        await this.cleanup();

        return {
          success: true,
          chunkResults: preservedChunkResults.sort((a, b) => a.index - b.index)
        };
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

      // Verify all chunk files exist before concat
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = chunks[i];
        const exists = fsSync.existsSync(chunkPath);
        if (!exists) {
          throw new Error(`Chunk file ${i + 1}/${chunks.length} not found at: ${chunkPath}`);
        }
        const stats = await fs.stat(chunkPath);
        console.log(`[ExportWorker] Chunk ${i + 1}: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
      }

      // Create concat file
      const concatContent = chunks.map(chunk => `file '${chunk}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);
      console.log(`[ExportWorker] Concat list:\n${concatContent}`);

      // Run FFmpeg concat
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y', // Overwrite output file if exists
        job.outputPath
      ];

      console.log(`[ExportWorker] Running FFmpeg: ${job.ffmpegPath} ${ffmpegArgs.join(' ')}`);

      // CRITICAL FIX: Set DYLD_LIBRARY_PATH so FFmpeg can find its dynamic libraries
      // FFmpeg binary needs libavdevice.dylib, libavcodec.dylib, etc. from same directory
      const ffmpegDir = path.dirname(job.ffmpegPath);
      const env = {
        ...process.env,
        DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
      };

      const ffmpegProcess = spawn(job.ffmpegPath, ffmpegArgs, { env });

      let ffmpegStderr = '';
      let ffmpegStdout = '';

      ffmpegProcess.stderr?.on('data', (data) => {
        ffmpegStderr += data.toString();
      });

      ffmpegProcess.stdout?.on('data', (data) => {
        ffmpegStdout += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        ffmpegProcess.on('exit', (code, signal) => {
          if (code === 0) {
            console.log(`[ExportWorker] FFmpeg concat successful`);
            resolve();
          } else {
            console.error(`[ExportWorker] FFmpeg concat failed with code ${code}, signal ${signal}`);
            console.error(`[ExportWorker] FFmpeg stderr:\n${ffmpegStderr}`);
            console.error(`[ExportWorker] FFmpeg stdout:\n${ffmpegStdout}`);
            reject(new Error(`FFmpeg concat failed with code ${code}, signal ${signal}\nStderr: ${ffmpegStderr.slice(-500)}`));
          }
        });
        ffmpegProcess.on('error', (err) => {
          console.error(`[ExportWorker] FFmpeg process error:`, err);
          reject(err);
        });
      });

      // Clean up chunk files
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => { });
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
        await fs.unlink(chunk).catch(() => { });
      }
      throw error;
    }
  }

  private buildChunkPlan(totalFrames: number, chunkSize: number, fps: number): ChunkAssignment[] {
    const numChunks = Math.ceil(totalFrames / chunkSize);
    const plan: ChunkAssignment[] = [];

    for (let index = 0; index < numChunks; index++) {
      const startFrame = index * chunkSize;
      const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1);
      const startTimeMs = (startFrame / fps) * 1000;
      const endTimeMs = ((endFrame + 1) / fps) * 1000;

      plan.push({
        index,
        startFrame,
        endFrame,
        startTimeMs,
        endTimeMs
      });
    }

    return plan;
  }

  private async cancelExport(): Promise<void> {
    console.log('[ExportWorker] Cancelling export...');
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (!this.currentExport) return;

    // Clean up any temp files
    for (const tempFile of this.currentExport.tempFiles) {
      await fs.unlink(tempFile).catch(() => { });
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

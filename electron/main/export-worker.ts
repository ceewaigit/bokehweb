/**
 * Export Worker Process with MessagePort IPC
 * Handles video export with supervision and error recovery
 */

import { BaseWorker } from './utils/base-worker';
import { spawn } from 'child_process';
import { once } from 'events';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { tmpdir } from 'os';

interface ExportJob {
  bundleLocation: string;
  compositionId: string;
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
    ffmpegProcess: ReturnType<typeof spawn> | null;
    browser: any;
    audioPath: string | null;
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
        ffmpegProcess: null,
        browser: null,
        audioPath: null
      };

      // Send progress updates
      this.send('progress', {
        progress: 5,
        stage: 'preparing',
        message: 'Initializing export...'
      });

      // Lazy load Remotion modules
      const { selectComposition, renderMedia, renderFrames, openBrowser } = await import('@remotion/renderer');
      
      // Select composition
      const composition = await selectComposition({
        serveUrl: job.bundleLocation,
        id: job.compositionId,
        inputProps: job.inputProps
      });

      const fps = job.settings.framerate || composition.fps;
      const totalFrames = composition.durationInFrames;
      
      console.log(`[ExportWorker] Starting export: ${totalFrames} frames at ${fps}fps`);

      // Step 1: Render audio
      this.send('progress', {
        progress: 10,
        stage: 'audio',
        message: 'Rendering audio track...'
      });

      const audioPath = path.join(tmpdir(), `remotion-audio-${Date.now()}.aac`);
      this.currentExport.audioPath = audioPath;
      
      await renderMedia({
        serveUrl: job.bundleLocation,
        composition,
        inputProps: job.inputProps,
        outputLocation: audioPath,
        codec: 'aac',
        audioCodec: 'aac',
        imageFormat: 'none',
        logLevel: 'info',
        offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
        binariesDirectory: job.compositorDir,
      });

      // Step 2: Setup FFmpeg
      this.send('progress', {
        progress: 20,
        stage: 'encoding',
        message: 'Starting video encoder...'
      });

      const imageFormat = job.jpegQuality ? 'jpeg' : 'png';
      
      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'image2pipe',
        '-framerate', String(fps),
        '-i', 'pipe:0',
        '-i', audioPath,
        '-c:v', 'libx264',
        '-preset', job.x264Preset || 'veryfast',
        '-crf', job.settings.quality === 'ultra' ? '16' : job.settings.quality === 'high' ? '18' : '23',
        '-pix_fmt', 'yuv420p',
        ...(job.videoBitrate ? ['-b:v', job.videoBitrate] : []),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        job.outputPath
      ];

      const ffmpegProcess = spawn(job.ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.currentExport.ffmpegProcess = ffmpegProcess;

      let ffmpegError = '';
      ffmpegProcess.stderr?.on('data', (data) => {
        ffmpegError += data.toString();
      });

      ffmpegProcess.on('error', (err) => {
        throw new Error(`FFmpeg failed: ${err.message}`);
      });

      // Step 3: Open browser
      this.send('progress', {
        progress: 25,
        stage: 'rendering',
        message: 'Starting render engine...'
      });

      const browser = await openBrowser('chrome', {
        shouldDumpIo: false,
      });
      this.currentExport.browser = browser;

      // Step 4: Stream frames
      let framesRendered = 0;
      let lastProgressUpdate = Date.now();

      await renderFrames({
        serveUrl: job.bundleLocation,
        composition,
        inputProps: job.inputProps,
        outputDir: null,
        imageFormat,
        jpegQuality: job.jpegQuality || 80,
        concurrency: 1,
        offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
        puppeteerInstance: browser,
        chromiumOptions: {
          gl: job.useGPU ? 'angle' : 'swangle',
          enableMultiProcessOnLinux: true,
        },
        binariesDirectory: job.compositorDir,
        onStart: ({ resolvedConcurrency }) => {
          console.log(`[ExportWorker] Rendering with concurrency=${resolvedConcurrency}`);
        },
        onFrameUpdate: (frame) => {
          framesRendered = frame;
          
          const now = Date.now();
          if (now - lastProgressUpdate > 500) {
            lastProgressUpdate = now;
            const progress = 25 + Math.round((frame / totalFrames) * 70);
            
            this.send('progress', {
              progress,
              currentFrame: frame,
              totalFrames,
              stage: 'rendering',
              message: `Rendering frame ${frame} of ${totalFrames}`
            });
          }
        },
        onFrameBuffer: async (frameBuffer: Buffer) => {
          if (!ffmpegProcess || !ffmpegProcess.stdin) {
            throw new Error('FFmpeg process not available');
          }
          
          const canWrite = ffmpegProcess.stdin.write(frameBuffer);
          if (!canWrite) {
            await once(ffmpegProcess.stdin, 'drain');
          }
        },
        logLevel: 'info',
      });

      // Step 5: Finalize
      this.send('progress', {
        progress: 95,
        stage: 'finalizing',
        message: 'Finalizing video...'
      });

      if (ffmpegProcess && ffmpegProcess.stdin) {
        ffmpegProcess.stdin.end();
      }

      const [exitCode] = await once(ffmpegProcess!, 'exit') as [number];
      
      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}: ${ffmpegError}`);
      }

      // Cleanup
      await this.cleanup();

      // Get file size
      const stats = await fs.stat(job.outputPath);
      const duration = (Date.now() - startTime) / 1000;
      
      console.log(`[ExportWorker] Export complete in ${duration.toFixed(1)}s`);

      return {
        success: true,
        outputPath: job.outputPath
      };

    } catch (error) {
      console.error('[ExportWorker] Export failed:', error);
      await this.cleanup();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async cancelExport(): Promise<void> {
    console.log('[ExportWorker] Cancelling export...');
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (!this.currentExport) return;

    // Kill FFmpeg
    if (this.currentExport.ffmpegProcess) {
      this.currentExport.ffmpegProcess.kill('SIGKILL');
    }

    // Close browser
    if (this.currentExport.browser) {
      await this.currentExport.browser.close().catch(() => {});
    }

    // Clean up audio file
    if (this.currentExport.audioPath) {
      await fs.unlink(this.currentExport.audioPath).catch(() => {});
    }

    this.currentExport = null;
  }

  private getStatus(): { isExporting: boolean } {
    return {
      isExporting: this.currentExport !== null
    };
  }
}

// Create and start the worker
const worker = new ExportWorker();
console.log('[ExportWorker] Worker process started');
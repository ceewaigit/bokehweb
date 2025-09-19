/**
 * Export Worker Process
 * Runs in separate Node.js process for memory isolation
 * Uses true frame-by-frame streaming to prevent OOM crashes
 */

import { spawn } from 'child_process';
import { once } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { bundle } from '@remotion/bundler';
import {
  renderFrames,
  renderMedia,
  selectComposition,
  openBrowser
} from '@remotion/renderer';

// Types
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
  // Memory settings from parent
  offthreadVideoCacheSizeInBytes: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: string;
  useGPU: boolean;
}

interface ProgressMessage {
  type: 'progress';
  data: {
    progress: number;
    currentFrame?: number;
    totalFrames?: number;
    message?: string;
    stage?: string;
  };
}

interface CompleteMessage {
  type: 'complete';
  outputPath: string;
  fileSize?: number;
}

interface ErrorMessage {
  type: 'error';
  error: string;
}

// Helper to send IPC messages back to parent
const sendMessage = (msg: ProgressMessage | CompleteMessage | ErrorMessage) => {
  if (process.send) {
    process.send(msg);
  }
};

// Main export function
async function performStreamingExport(job: ExportJob) {
  const startTime = Date.now();
  let ffmpegProcess: ReturnType<typeof spawn> | null = null;
  let browser: any = null;
  let audioPath: string | null = null;

  try {
    sendMessage({
      type: 'progress',
      data: {
        progress: 5,
        stage: 'preparing',
        message: 'Initializing streaming export...'
      }
    });

    // Select composition
    const composition = await selectComposition({
      serveUrl: job.bundleLocation,
      id: job.compositionId,
      inputProps: job.inputProps
    });

    const fps = job.settings.framerate || composition.fps;
    const totalFrames = composition.durationInFrames;
    
    console.log(`[Export Worker] Starting streaming export: ${totalFrames} frames at ${fps}fps`);
    console.log(`[Export Worker] Memory limit: ${job.offthreadVideoCacheSizeInBytes / (1024 * 1024)}MB`);

    // Step 1: Render audio-only first (keeps Remotion's audio mixing)
    sendMessage({
      type: 'progress',
      data: {
        progress: 10,
        stage: 'audio',
        message: 'Rendering audio track...'
      }
    });

    audioPath = path.join(tmpdir(), `remotion-audio-${Date.now()}.aac`);
    
    await renderMedia({
      serveUrl: job.bundleLocation,
      composition,
      inputProps: job.inputProps,
      outputLocation: audioPath,
      codec: 'aac',
      audioCodec: 'aac',
      imageFormat: 'none', // Audio-only render
      logLevel: 'info',
      offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
    });

    console.log(`[Export Worker] Audio rendered to: ${audioPath}`);

    // Step 2: Prepare FFmpeg process for streaming video frames
    sendMessage({
      type: 'progress',
      data: {
        progress: 20,
        stage: 'encoding',
        message: 'Starting video encoder...'
      }
    });

    const imageFormat = job.jpegQuality ? 'jpeg' : 'png';
    
    // FFmpeg arguments for streaming pipeline
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      
      // Video input from stdin (image pipe)
      '-f', 'image2pipe',
      '-framerate', String(fps),
      '-i', 'pipe:0',
      
      // Audio input from file
      '-i', audioPath,
      
      // Video encoding settings
      '-c:v', 'libx264',
      '-preset', job.x264Preset || 'veryfast',
      '-crf', job.settings.quality === 'ultra' ? '16' : job.settings.quality === 'high' ? '18' : '23',
      '-pix_fmt', 'yuv420p',
      
      // Set video bitrate if specified
      ...(job.videoBitrate ? ['-b:v', job.videoBitrate] : []),
      
      // Audio settings
      '-c:a', 'aac',
      '-b:a', '192k',
      
      // Output settings
      '-shortest', // Match shortest stream
      '-movflags', '+faststart', // Web-friendly MP4
      
      // Output file
      job.outputPath
    ];

    console.log(`[Export Worker] Starting FFmpeg with args:`, ffmpegArgs.join(' '));

    ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
    });

    // Capture FFmpeg errors
    let ffmpegError = '';
    ffmpegProcess.stderr?.on('data', (data) => {
      ffmpegError += data.toString();
    });

    ffmpegProcess.on('error', (err) => {
      console.error('[Export Worker] FFmpeg spawn error:', err);
      throw new Error(`FFmpeg failed to start: ${err.message}`);
    });

    // Step 3: Open browser for rendering (reuse for all frames)
    sendMessage({
      type: 'progress',
      data: {
        progress: 25,
        stage: 'rendering',
        message: 'Starting render engine...'
      }
    });

    browser = await openBrowser('chrome', {
      shouldDumpIo: false,
    });

    // Step 4: Stream frames one-by-one to FFmpeg
    let framesRendered = 0;
    let lastProgressUpdate = Date.now();

    await renderFrames({
      serveUrl: job.bundleLocation,
      composition,
      inputProps: job.inputProps,
      
      // Streaming settings - THIS IS THE KEY CHANGE
      outputDir: null, // Don't write frames to disk
      imageFormat,
      jpegQuality: job.jpegQuality || 80,
      
      // Memory settings - CRITICAL FOR STABILITY
      concurrency: 1, // Render exactly ONE frame at a time
      offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
      
      // Browser settings
      puppeteerInstance: browser,
      chromiumOptions: {
        gl: job.useGPU ? 'angle' : 'swangle',
        enableMultiProcessOnLinux: true,
      },
      
      // Required callback
      onStart: ({ parallelEncoding, resolvedConcurrency }) => {
        console.log(`[Export Worker] Render started with concurrency=${resolvedConcurrency}, parallel=${parallelEncoding}`);
      },
      
      // Progress tracking
      onFrameUpdate: (frame) => {
        framesRendered = frame;
        
        // Update progress every 500ms to avoid IPC spam
        const now = Date.now();
        if (now - lastProgressUpdate > 500) {
          lastProgressUpdate = now;
          const progress = 25 + Math.round((frame / totalFrames) * 70);
          
          sendMessage({
            type: 'progress',
            data: {
              progress,
              currentFrame: frame,
              totalFrames,
              stage: 'rendering',
              message: `Rendering frame ${frame} of ${totalFrames}`
            }
          });
          
          // Log memory usage periodically
          if (frame % 100 === 0) {
            const memUsage = process.memoryUsage();
            console.log(`[Export Worker] Frame ${frame} - Memory: RSS=${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
          }
        }
      },
      
      // CRITICAL: Stream each frame directly to FFmpeg
      onFrameBuffer: async (frameBuffer: Buffer, frame: number) => {
        if (!ffmpegProcess || !ffmpegProcess.stdin) {
          throw new Error('FFmpeg process not available');
        }
        
        // Write frame to FFmpeg with backpressure handling
        const canWrite = ffmpegProcess.stdin.write(frameBuffer);
        
        if (!canWrite) {
          // FFmpeg is slower than frame generation, wait for drain
          await once(ffmpegProcess.stdin, 'drain');
        }
        
        // Immediate memory cleanup (let GC know buffer can be freed)
        frameBuffer = null as any;
      },
      
      logLevel: 'info',
    });

    console.log(`[Export Worker] All frames rendered, closing FFmpeg stdin`);

    // Step 5: Close FFmpeg stdin and wait for encoding to complete
    sendMessage({
      type: 'progress',
      data: {
        progress: 95,
        stage: 'finalizing',
        message: 'Finalizing video...'
      }
    });

    if (ffmpegProcess && ffmpegProcess.stdin) {
      ffmpegProcess.stdin.end();
    }

    // Wait for FFmpeg to finish
    const [exitCode] = await once(ffmpegProcess!, 'exit') as [number];
    
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}: ${ffmpegError}`);
    }

    // Clean up audio file
    if (audioPath) {
      await fs.unlink(audioPath).catch(() => {});
    }

    // Close browser
    if (browser) {
      await browser.close().catch(() => {});
    }

    // Get final file size
    const stats = await fs.stat(job.outputPath);
    const fileSize = stats.size;
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`[Export Worker] Export complete in ${duration.toFixed(1)}s, file size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    // Send completion message
    sendMessage({
      type: 'complete',
      outputPath: job.outputPath,
      fileSize
    });

  } catch (error) {
    console.error('[Export Worker] Export failed:', error);
    
    // Clean up on error
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGKILL');
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (audioPath) {
      await fs.unlink(audioPath).catch(() => {});
    }
    
    sendMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
    
    process.exit(1);
  }
}

// Listen for job from parent process
process.on('message', async (msg: any) => {
  if (msg.type === 'start' && msg.job) {
    console.log('[Export Worker] Received export job');
    try {
      await performStreamingExport(msg.job);
      process.exit(0);
    } catch (error) {
      console.error('[Export Worker] Fatal error:', error);
      process.exit(1);
    }
  }
  
  if (msg.type === 'cancel') {
    console.log('[Export Worker] Export cancelled');
    process.exit(0);
  }
});

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error('[Export Worker] Uncaught exception:', error);
  sendMessage({
    type: 'error',
    error: `Unexpected error: ${error.message}`
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Export Worker] Unhandled rejection:', reason);
  sendMessage({
    type: 'error',
    error: `Unhandled rejection: ${reason}`
  });
  process.exit(1);
});

// Log that worker is ready
console.log('[Export Worker] Worker process started, waiting for job...');
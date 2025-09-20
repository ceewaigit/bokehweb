/**
 * Export Worker Process
 * Runs in separate Node.js process for memory isolation
 * Uses true frame-by-frame streaming to prevent OOM crashes
 */

import { spawn } from 'child_process';
import { once } from 'events';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { tmpdir } from 'os';
import {
  renderFrames,
  renderMedia,
  selectComposition,
  openBrowser
} from '@remotion/renderer';

// Resolve Remotion compositor directory for binariesDirectory option
const resolveCompositorDir = (job: ExportJob): string | null => {
  // In development, let Remotion auto-detect from node_modules
  if (!job.isPackaged) {
    console.log('[Export Worker] Development mode - using auto-detection');
    return null;
  }
  
  // In production, point to unpacked binaries
  const platform = process.platform;
  const arch = process.arch;
  
  let compositorName = '';
  if (platform === 'darwin') {
    compositorName = arch === 'arm64' ? 
      '@remotion/compositor-darwin-arm64' : 
      '@remotion/compositor-darwin-x64';
  } else if (platform === 'win32') {
    compositorName = '@remotion/compositor-win32-x64';
  } else if (platform === 'linux') {
    compositorName = arch === 'arm64' ?
      '@remotion/compositor-linux-arm64' :
      '@remotion/compositor-linux-x64';
  }
  
  const compositorPath = path.join(
    job.resourcesPath!,
    'app.asar.unpacked',
    'node_modules',
    compositorName
  );
  
  console.log(`[Export Worker] Production mode - using compositor at: ${compositorPath}`);
  
  if (!fsSync.existsSync(compositorPath)) {
    console.error(`[Export Worker] Compositor directory not found at: ${compositorPath}`);
    return null;
  }
  
  return compositorPath;
};

// Get FFmpeg path from Remotion's bundled binaries with ASAR support
const getFFmpegPath = (job: ExportJob): string | null => {
  const platform = process.platform;
  const arch = process.arch;
  
  // Determine the correct compositor package for this platform
  const candidates = [];
  
  if (platform === 'darwin') {
    candidates.push(
      arch === 'arm64' ? '@remotion/compositor-darwin-arm64' : '@remotion/compositor-darwin-x64'
    );
  } else if (platform === 'win32') {
    candidates.push('@remotion/compositor-win32-x64');
  } else if (platform === 'linux') {
    candidates.push(
      arch === 'arm64' ? '@remotion/compositor-linux-arm64' : '@remotion/compositor-linux-x64'
    );
  }
  
  const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // Try multiple possible locations
  for (const packageName of candidates) {
    const possiblePaths = [
      // Production: unpacked from ASAR
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', packageName, ffmpegName),
      // Development or regular node_modules
      path.join(process.cwd(), 'node_modules', packageName, ffmpegName),
      // Alternative: resolve from require
      (() => {
        try {
          const pkgJson = require.resolve(`${packageName}/package.json`);
          const dir = path.dirname(pkgJson).replace('app.asar', 'app.asar.unpacked');
          return path.join(dir, ffmpegName);
        } catch {
          return null;
        }
      })()
    ].filter(Boolean) as string[];
    
    for (const ffmpegPath of possiblePaths) {
      if (ffmpegPath) {
        console.log(`[Export Worker] Checking FFmpeg at: ${ffmpegPath}`);
        if (fsSync.existsSync(ffmpegPath)) {
          console.log(`[Export Worker] FFmpeg found at: ${ffmpegPath}`);
          return ffmpegPath;
        }
      }
    }
  }
  
  console.error('[Export Worker] FFmpeg not found in any expected location');
  return null;
};

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
  // Path information for binary resolution
  projectRoot: string;
  resourcesPath?: string;
  isPackaged: boolean;
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

// Helper to send IPC messages back to parent (using utilityProcess)
const sendMessage = (msg: ProgressMessage | CompleteMessage | ErrorMessage) => {
  try {
    // Use parentPort for utilityProcess communication
    if (process.parentPort) {
      process.parentPort.postMessage(msg);
    } else if (process.send && typeof process.send === 'function') {
      // Fallback to process.send for regular fork
      process.send(msg);
    } else {
      console.log('[Export Worker] IPC message:', JSON.stringify(msg));
    }
  } catch (error) {
    // Ignore EPIPE errors when parent disconnects
    if ((error as any)?.code !== 'EPIPE') {
      console.error('[Export Worker] Failed to send IPC message:', error);
    }
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

    // Resolve binaries directory for Remotion
    const binariesDirectory = resolveCompositorDir(job);
    console.log(`[Export Worker] Using binaries directory: ${binariesDirectory || 'auto-detect'}`);
    
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
      binariesDirectory,
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

    // Get FFmpeg path from compositor directory or auto-detect
    let ffmpegPath: string;
    if (binariesDirectory) {
      // Use FFmpeg from unpacked compositor directory
      ffmpegPath = path.join(binariesDirectory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    } else {
      // Let Remotion handle it in development
      const detectedPath = getFFmpegPath(job);
      if (!detectedPath) {
        throw new Error('FFmpeg not found. Please ensure Remotion dependencies are installed.');
      }
      ffmpegPath = detectedPath;
    }
    
    console.log(`[Export Worker] Using FFmpeg at: ${ffmpegPath}`);
    
    // Check if FFmpeg exists and is executable
    try {
      await fs.access(ffmpegPath, fsSync.constants.X_OK);
    } catch (error) {
      throw new Error(`FFmpeg found but not executable at ${ffmpegPath}`);
    }
    
    console.log(`[Export Worker] Starting FFmpeg from: ${ffmpegPath}`);
    console.log(`[Export Worker] FFmpeg args:`, ffmpegArgs.join(' '));

    ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
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
      
      // Use the same binaries directory
      binariesDirectory,
      
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

// Listen for job from parent process (utilityProcess or fork)
const messageHandler = async (msg: any) => {
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
};

// Set up message listener for both utilityProcess and regular fork
if (process.parentPort) {
  // utilityProcess communication
  process.parentPort.on('message', (e: any) => messageHandler(e.data));
} else {
  // Regular fork communication
  process.on('message', messageHandler);
}

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

// Handle parent disconnect
process.on('disconnect', () => {
  console.log('[Export Worker] Parent process disconnected, exiting...');
  process.exit(0);
});

// Log that worker is ready
console.log('[Export Worker] Worker process started, waiting for job...');
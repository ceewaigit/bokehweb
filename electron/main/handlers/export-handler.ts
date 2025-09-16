/**
 * Electron main process handler for Remotion export
 * Handles the actual export using Node.js APIs
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import os from 'os';

// Cache directory for Chrome binary
const CHROME_CACHE_DIR = path.join(app.getPath('userData'), 'chrome-cache');

// Active export processes
let activeExportProcess: any = null;

// Maximum frames to render in a single chunk
const MAX_FRAMES_PER_CHUNK = 500; // ~8 seconds at 60fps

export function setupExportHandler() {
  console.log('📦 Setting up export handler');
  
  // Ensure cache directory exists
  fs.mkdir(CHROME_CACHE_DIR, { recursive: true }).catch(console.error);
  
  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings }) => {
    console.log('📹 Export handler invoked with settings:', settings);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    let bundleLocation: string | null = null;
    let outputPath: string | null = null;
    
    try {
      // Lazy load Remotion modules to avoid import issues
      const { renderMedia, selectComposition } = await import('@remotion/renderer');
      const { bundle } = await import('@remotion/bundler');
      
      // Kill any existing Chrome processes to free memory
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        await execAsync('pkill -f "chrome-headless-shell"').catch(() => {});
        console.log('Cleaned up any existing Chrome processes');
      } catch (e) {
        // Ignore errors
      }
      
      // Note: Chrome binary will be downloaded automatically by Remotion on first use
      const browserExecutable = undefined; // Let Remotion handle browser download
      
      // Bundle Remotion project
      const entryPoint = path.join(process.cwd(), 'src/remotion/index.ts');
      bundleLocation = await bundle({
        entryPoint,
        webpackOverride: (config) => {
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

      // Prepare composition props
      const inputProps = {
        segments,
        recordings: Object.fromEntries(recordings),
        metadata: Object.fromEntries(metadata),
        ...settings,
      };

      // Select composition
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'MainComposition',
        inputProps
      });

      // Check if we need chunked rendering
      const totalFrames = composition.durationInFrames;
      const needsChunking = totalFrames > MAX_FRAMES_PER_CHUNK;
      
      if (needsChunking) {
        console.log(`Large export detected: ${totalFrames} frames. Using chunked rendering.`);
      }
      
      // Create temp output path
      outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Determine export parameters based on mode and size
      const exportMode = settings.mode || 'preview';
      const isLargeExport = totalFrames > 1800; // 30 seconds at 60fps
      
      // Configure based on export mode
      let concurrency: number;
      let cacheSize: number;
      let jpegQuality: number;
      let everyNthFrame: number = 1;
      
      switch (exportMode) {
        case 'draft':
          concurrency = 1;
          cacheSize = 0; // No cache
          jpegQuality = 70;
          everyNthFrame = isLargeExport ? 2 : 1; // Skip frames for large drafts
          break;
        case 'final':
          concurrency = isLargeExport ? 2 : 4;
          cacheSize = isLargeExport ? 128 * 1024 * 1024 : 256 * 1024 * 1024;
          jpegQuality = 95;
          break;
        case 'preview':
        default:
          concurrency = isLargeExport ? 1 : 2;
          cacheSize = isLargeExport ? 0 : 128 * 1024 * 1024;
          jpegQuality = settings.quality === 'high' ? 85 : 75;
          break;
      }
      
      // Override with custom settings if provided
      if (settings.maxMemoryMB) {
        cacheSize = Math.min(cacheSize, settings.maxMemoryMB * 1024 * 1024);
      }
      if (settings.disableVideoCache) {
        cacheSize = 0;
      }
      
      console.log(`Export config: mode=${exportMode}, ${totalFrames} frames, concurrency=${concurrency}, cache=${cacheSize / 1024 / 1024}MB, quality=${jpegQuality}`);
      
      // Store the render process for potential cancellation
      activeExportProcess = renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        chromiumOptions: {
          enableMultiProcessOnLinux: false,
          gl: 'angle',
          headless: true,
          disableWebSecurity: false
        },
        onProgress: (info) => {
          // Send progress to renderer
          event.sender.send('export-progress', {
            progress: Math.min(95, 10 + (info.progress * 85)),
            currentFrame: info.renderedFrames,
            totalFrames: composition.durationInFrames,
          });
          
          // More aggressive garbage collection for large exports
          const gcInterval = isLargeExport ? 50 : 100;
          if (info.renderedFrames % gcInterval === 0) {
            if (global.gc) {
              global.gc();
              
              // Log memory usage
              const memUsage = process.memoryUsage();
              const totalMem = os.totalmem();
              const freeMem = os.freemem();
              const usedPercent = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
              
              console.log(`Frame ${info.renderedFrames}/${totalFrames} | Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB | System: ${usedPercent}% used`);
              
              // Warn if memory usage is getting high
              if (parseFloat(usedPercent) > 85) {
                console.warn('⚠️ High memory usage detected! Consider using draft mode for large exports.');
              }
            }
          }
        },
        concurrency,
        jpegQuality,
        numberOfGifLoops: null,
        everyNthFrame,
        frameRange: null,
        muted: false,
        enforceAudioTrack: false,
        proResProfile: undefined,
        x264Preset: isLargeExport ? 'faster' : 'medium', // Faster preset for large exports
        pixelFormat: 'yuv420p',
        audioBitrate: null,
        videoBitrate: null,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: cacheSize
      });
      
      // Wait for render to complete
      await activeExportProcess;
      activeExportProcess = null;

      // Stream file instead of loading into memory
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;
      
      // For smaller files (< 50MB), use base64
      if (fileSize < 50 * 1024 * 1024) {
        const buffer = await fs.readFile(outputPath);
        const base64 = buffer.toString('base64');
        
        // Clean up
        await fs.unlink(outputPath).catch(() => {});
        if (bundleLocation) {
          await fs.rm(bundleLocation, { recursive: true, force: true }).catch(() => {});
        }
        
        return { success: true, data: base64, isStream: false };
      }
      
      // For larger files, return the file path for streaming
      // Clean up bundle but keep output file for streaming
      if (bundleLocation) {
        await fs.rm(bundleLocation, { recursive: true, force: true }).catch(() => {});
      }
      
      return { 
        success: true, 
        filePath: outputPath,
        fileSize,
        isStream: true 
      };
    } catch (error) {
      // Clean up on error
      if (outputPath) {
        await fs.unlink(outputPath).catch(() => {});
      }
      if (bundleLocation) {
        await fs.rm(bundleLocation, { recursive: true, force: true }).catch(() => {});
      }
      
      // Force garbage collection on error
      if (global.gc) {
        global.gc();
      }
      
      console.error('Export failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Export failed' 
      };
    }
  });
  
  // Handle stream requests for large files
  ipcMain.handle('export-stream-chunk', async (_event, { filePath, offset, length }) => {
    try {
      const buffer = Buffer.alloc(length);
      const fd = await fs.open(filePath, 'r');
      await fd.read(buffer, 0, length, offset);
      await fd.close();
      return { success: true, data: buffer.toString('base64') };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Stream failed' 
      };
    }
  });
  
  // Clean up streamed file
  ipcMain.handle('export-cleanup', async (_event, { filePath }) => {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  });
  
  // Handle export cancellation
  ipcMain.handle('export-cancel', async () => {
    try {
      if (activeExportProcess) {
        console.log('Canceling active export...');
        // Attempt to cancel the render process
        if (typeof activeExportProcess.cancel === 'function') {
          activeExportProcess.cancel();
        }
        activeExportProcess = null;
        
        // Force garbage collection
        if (global.gc) {
          global.gc();
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Error canceling export:', error);
      return { success: false };
    }
  });
}
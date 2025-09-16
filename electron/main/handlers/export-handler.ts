/**
 * Electron main process handler for Remotion export
 * Handles the actual export using Node.js APIs
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

// Cache directory for Chrome binary
const CHROME_CACHE_DIR = path.join(app.getPath('userData'), 'chrome-cache');

// Active export processes
let activeExportProcess: any = null;

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
      
      // Note: Chrome binary will be downloaded automatically by Remotion on first use
      // We'll use the progress callback in selectComposition to track it
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

      // Create temp output path
      outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

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
          headless: true
        },
        onProgress: (info) => {
          // Send progress to renderer
          event.sender.send('export-progress', {
            progress: Math.min(95, 10 + (info.progress * 85)),
            currentFrame: info.renderedFrames,
            totalFrames: composition.durationInFrames,
          });
          
          // Periodic garbage collection
          if (info.renderedFrames % 100 === 0 && global.gc) {
            global.gc();
          }
        },
        concurrency: 2, // Reduced from 4 to save memory
        jpegQuality: settings.quality === 'high' ? 90 : 80, // Slightly reduced quality
        numberOfGifLoops: null,
        everyNthFrame: 1,
        frameRange: null,
        muted: false,
        enforceAudioTrack: false,
        proResProfile: undefined,
        x264Preset: 'medium',
        pixelFormat: 'yuv420p',
        audioBitrate: null,
        videoBitrate: null,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024 // 256MB cache limit
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
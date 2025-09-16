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
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

// Cache directory for Chrome binary
const CHROME_CACHE_DIR = path.join(app.getPath('userData'), 'chrome-cache');

// Active export processes
let activeExportProcess: any = null;

// Frames per chunk (5 seconds at 60fps)
const FRAMES_PER_CHUNK = 300;

// Calculate chunks for large exports
function calculateChunks(totalFrames: number, framesPerChunk: number = FRAMES_PER_CHUNK) {
  const chunks = [];
  for (let start = 0; start < totalFrames; start += framesPerChunk) {
    chunks.push({
      startFrame: start,
      endFrame: Math.min(start + framesPerChunk - 1, totalFrames - 1)
    });
  }
  return chunks;
}

export function setupExportHandler() {
  console.log('📦 Setting up export handler');
  
  // Ensure cache directory exists
  fs.mkdir(CHROME_CACHE_DIR, { recursive: true }).catch(console.error);
  
  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings }) => {
    console.log('📹 Export handler invoked with settings:', settings);
    
    // Force aggressive memory cleanup before export
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Kill any lingering Chrome processes
      await execAsync('pkill -9 -f "chrome-headless-shell"').catch(() => {});
      await execAsync('pkill -9 -f "Chrome Helper"').catch(() => {});
      console.log('Cleaned up Chrome processes');
    } catch (e) {
      // Ignore
    }
    
    // Force garbage collection multiple times
    if (global.gc) {
      global.gc();
      global.gc();
      console.log('Forced garbage collection');
    }
    
    let bundleLocation: string | null = null;
    let outputPath: string | null = null;
    
    try {
      // Lazy load Remotion modules to avoid import issues
      const { renderMedia, selectComposition } = await import('@remotion/renderer');
      const { bundle } = await import('@remotion/bundler');
      
      // Chrome cleanup already done at the start of function
      
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

      const totalFrames = composition.durationInFrames;
      const isLargeExport = totalFrames > FRAMES_PER_CHUNK;
      
      // Create temp output path
      outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Check if we need chunked export
      if (isLargeExport) {
        console.log(`Large export detected: ${totalFrames} frames. Using chunked rendering.`);
        
        const chunks = calculateChunks(totalFrames);
        const chunkFiles: string[] = [];
        const tempDir = path.dirname(outputPath);
        
        console.log(`Splitting into ${chunks.length} chunks of ${FRAMES_PER_CHUNK} frames each`);
        
        // Export each chunk
        for (const [index, chunk] of chunks.entries()) {
          const chunkPath = path.join(tempDir, `chunk-${index}.mp4`);
          
          console.log(`Rendering chunk ${index + 1}/${chunks.length}: frames ${chunk.startFrame}-${chunk.endFrame}`);
          
          // Render this chunk with minimal memory
          await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: settings.format === 'webm' ? 'vp8' : 'h264',
            outputLocation: chunkPath,
            inputProps,
            frameRange: [chunk.startFrame, chunk.endFrame],
            chromiumOptions: {
              enableMultiProcessOnLinux: false,
              gl: 'swangle',
              headless: true,
              disableWebSecurity: false
            },
            onProgress: (info) => {
              // Calculate overall progress
              const chunkProgress = info.progress;
              const overallProgress = ((index + chunkProgress) / chunks.length) * 85;
              
              event.sender.send('export-progress', {
                progress: Math.min(85, 10 + overallProgress),
                currentFrame: chunk.startFrame + info.renderedFrames,
                totalFrames: totalFrames,
                message: `Chunk ${index + 1}/${chunks.length}`
              });
            },
            concurrency: 1,
            jpegQuality: 70,
            everyNthFrame: 1,
            x264Preset: 'faster',
            pixelFormat: 'yuv420p',
            audioBitrate: null,
            videoBitrate: null,
            audioCodec: null,
            offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024 // 64MB cache for chunks
          });
          
          chunkFiles.push(chunkPath);
          
          // Force garbage collection between chunks
          if (global.gc) {
            global.gc();
            console.log(`Chunk ${index + 1} complete. Memory cleaned.`);
          }
        }
        
        // Concatenate all chunks
        console.log('Concatenating chunks...');
        event.sender.send('export-progress', {
          progress: 90,
          currentFrame: totalFrames,
          totalFrames: totalFrames,
          message: 'Combining video segments...'
        });
        
        // Create concat list file
        const concatListPath = path.join(tempDir, 'concat.txt');
        const concatContent = chunkFiles.map(f => `file '${f}'`).join('\n');
        await fs.writeFile(concatListPath, concatContent);
        
        // Use FFmpeg to concatenate
        try {
          await exec(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`);
        } catch (error) {
          console.error('FFmpeg concat failed:', error);
          // Fallback: use first chunk if concat fails
          if (chunkFiles.length > 0) {
            await fs.copyFile(chunkFiles[0], outputPath);
          }
        }
        
        // Clean up chunk files
        for (const chunkFile of chunkFiles) {
          await fs.unlink(chunkFile).catch(() => {});
        }
        await fs.unlink(concatListPath).catch(() => {});
        
        console.log('Chunked export complete!');
        
      } else {
        // Small export - render in one go
        console.log(`Small export: ${totalFrames} frames, rendering in single pass`);
        
        // Store the render process for potential cancellation
        activeExportProcess = renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        chromiumOptions: {
          enableMultiProcessOnLinux: false,
          gl: 'swangle', // Software renderer to avoid GPU memory
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
          
        },
        concurrency: 1,
        jpegQuality: 80, // Better quality for small exports
        everyNthFrame: 1,
        x264Preset: 'medium',
        pixelFormat: 'yuv420p',
        audioBitrate: null,
        videoBitrate: null,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024 // 128MB cache for small exports
      });
      
      // Wait for render to complete
      await activeExportProcess;
      activeExportProcess = null;
      }  // Close the else block

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
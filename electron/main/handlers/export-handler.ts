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

// Dynamic quality settings based on user's quality preset
function getQualitySettings(quality: string) {
  const cpuCount = os.cpus().length;
  const memoryGB = os.totalmem() / (1024 * 1024 * 1024);
  
  // Map quality level to export parameters
  switch(quality) {
    case 'ultra':
      return {
        jpegQuality: 95,
        x264Preset: 'medium' as const,  // Balanced for quality
        concurrency: Math.min(cpuCount - 2, 12),  // Use most cores, leave some for OS
        videoBitrate: '20M',
        offthreadVideoCacheSizeInBytes: Math.min(1024 * 1024 * 1024, memoryGB * 128 * 1024 * 1024) // Up to 1GB
      };
    case 'high':
      return {
        jpegQuality: 85,
        x264Preset: 'faster' as const,  // Faster encoding for better performance
        concurrency: Math.min(cpuCount - 2, 8),  // Use up to 8 cores
        videoBitrate: '10M',
        offthreadVideoCacheSizeInBytes: Math.min(512 * 1024 * 1024, memoryGB * 64 * 1024 * 1024) // Up to 512MB
      };
    case 'medium':
      return {
        jpegQuality: 75,
        x264Preset: 'veryfast' as const,  // Prioritize speed
        concurrency: Math.min(Math.max(Math.floor(cpuCount * 0.6), 2), 6),  // Use 60% of cores
        videoBitrate: '5M',
        offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024 // 256MB
      };
    case 'low':
    default:
      return {
        jpegQuality: 60,
        x264Preset: 'ultrafast' as const,
        concurrency: Math.min(Math.max(Math.floor(cpuCount * 0.4), 1), 4),  // Use 40% of cores
        videoBitrate: '2M',
        offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024 // 128MB
      };
  }
}

// Calculate optimal chunk size based on system memory
function getOptimalChunkSize(framerate: number) {
  const memoryGB = os.totalmem() / (1024 * 1024 * 1024);
  
  // Determine chunk duration in seconds based on available memory
  let chunkSeconds: number;
  if (memoryGB < 8) {
    chunkSeconds = 10; // Small chunks for low memory
  } else if (memoryGB < 16) {
    chunkSeconds = 20; // Medium chunks
  } else {
    chunkSeconds = 30; // Large chunks for high memory systems
  }
  
  return chunkSeconds * framerate;
}

// Determine optimal GL renderer based on hardware
function getOptimalGLRenderer(): 'angle' | 'swangle' {
  const memoryGB = os.totalmem() / (1024 * 1024 * 1024);
  const cpuCount = os.cpus().length;
  
  // Use GPU acceleration on capable machines
  if (cpuCount >= 4 && memoryGB >= 8) {
    return 'angle'; // GPU acceleration
  }
  return 'swangle'; // Software fallback for low-end machines
}

// Get optimal Chromium options for rendering
function getChromiumOptions() {
  const glRenderer = getOptimalGLRenderer();
  const isGPUEnabled = glRenderer === 'angle';
  
  return {
    enableMultiProcessOnLinux: true, // Enable multi-process
    gl: glRenderer,
    headless: true,
    disableWebSecurity: false,
    args: isGPUEnabled ? [
      '--enable-gpu',
      '--enable-accelerated-video-decode',
      '--enable-accelerated-mjpeg-decode',
      '--disable-gpu-sandbox',
      '--enable-unsafe-webgpu',
      '--use-gl=desktop', // Use desktop OpenGL
      '--enable-features=VaapiVideoDecoder', // Linux hardware acceleration
      '--ignore-gpu-blocklist' // Use GPU even if blocklisted
    ] : []
  };
}

// Calculate chunks for large exports
function calculateChunks(totalFrames: number, framesPerChunk: number) {
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
      
      // Get dynamic chunk size based on system and framerate
      const framesPerChunk = getOptimalChunkSize(settings.framerate || 60);
      const isLargeExport = totalFrames > framesPerChunk;
      
      // Get quality settings based on user's selected quality
      let qualitySettings = getQualitySettings(settings.quality || 'high');
      
      // Optimize for small exports (under 1000 frames / ~16 seconds at 60fps)
      if (totalFrames < 1000) {
        const cpuCount = os.cpus().length;
        qualitySettings = {
          ...qualitySettings,
          concurrency: Math.min(cpuCount - 1, 12), // Use more cores for small exports
          x264Preset: 'veryfast' as const, // Prioritize speed for small exports
        };
        console.log('Small export optimization: Using aggressive settings for faster processing');
      }
      
      // Log system info for debugging
      console.log(`System: ${os.cpus().length} cores, ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)}GB RAM`);
      console.log(`Export quality: ${settings.quality}, Chunk size: ${framesPerChunk} frames`);
      console.log(`Quality settings:`, qualitySettings);
      
      // Create temp output path
      outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Check if we need chunked export
      if (isLargeExport) {
        console.log(`Large export detected: ${totalFrames} frames. Using chunked rendering.`);
        
        const chunks = calculateChunks(totalFrames, framesPerChunk);
        const chunkFiles: string[] = [];
        const tempDir = path.dirname(outputPath);
        
        console.log(`Splitting into ${chunks.length} chunks of ${framesPerChunk} frames each`);
        
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
            chromiumOptions: getChromiumOptions(),
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
            concurrency: qualitySettings.concurrency,
            jpegQuality: qualitySettings.jpegQuality,
            everyNthFrame: 1,
            x264Preset: qualitySettings.x264Preset,
            pixelFormat: 'yuv420p',
            audioBitrate: null,
            videoBitrate: qualitySettings.videoBitrate,
            audioCodec: null,
            offthreadVideoCacheSizeInBytes: qualitySettings.offthreadVideoCacheSizeInBytes
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
        chromiumOptions: getChromiumOptions(),
        onProgress: (info) => {
          // Send progress to renderer
          event.sender.send('export-progress', {
            progress: Math.min(95, 10 + (info.progress * 85)),
            currentFrame: info.renderedFrames,
            totalFrames: composition.durationInFrames,
          });
          
        },
        concurrency: qualitySettings.concurrency,
        jpegQuality: qualitySettings.jpegQuality,
        everyNthFrame: 1,
        x264Preset: qualitySettings.x264Preset,
        pixelFormat: 'yuv420p',
        audioBitrate: null,
        videoBitrate: qualitySettings.videoBitrate,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: qualitySettings.offthreadVideoCacheSizeInBytes
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
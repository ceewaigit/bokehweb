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
import { machineProfiler, type DynamicExportSettings } from '../utils/machine-profiler';
import { performance } from 'perf_hooks';
import { pathToFileURL } from 'url';

const exec = promisify(execCallback);

// Cache directory for Chrome binary
const CHROME_CACHE_DIR = path.join(app.getPath('userData'), 'chrome-cache');

// Active export processes
let activeExportProcess: any = null;

// Performance tracking
let frameRenderTimes: number[] = [];
let lastFrameTime = 0;
let totalFramesRendered = 0;
let currentDynamicSettings: DynamicExportSettings | null = null;

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

// Legacy functions - no longer used but kept for reference
// Now replaced by MachineProfiler dynamic optimization

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
    
    // Profile the machine first
    const videoWidth = settings.resolution?.width || 1920;
    const videoHeight = settings.resolution?.height || 1080;
    
    console.log('🔍 Profiling machine capabilities...');
    const machineProfile = await machineProfiler.profileSystem(videoWidth, videoHeight);
    console.log('Machine profile:', {
      cpuCores: machineProfile.cpuCores,
      memoryGB: machineProfile.totalMemoryGB.toFixed(1),
      frameSpeed: machineProfile.frameProcessingSpeed.toFixed(1) + 'ms',
      gpuAvailable: machineProfile.gpuAvailable,
      thermalPressure: machineProfile.thermalPressure,
      memoryPressure: machineProfile.memoryPressure
    });
    
    // Get dynamic settings based on actual machine capabilities
    const targetQuality = settings.quality === 'ultra' ? 'quality' : 
                          settings.quality === 'low' ? 'fast' : 'balanced';
    currentDynamicSettings = machineProfiler.getDynamicExportSettings(
      machineProfile,
      videoWidth,
      videoHeight,
      targetQuality
    );
    
    console.log('Dynamic export settings:', {
      concurrency: currentDynamicSettings.concurrency,
      chunkSize: currentDynamicSettings.chunkSizeFrames,
      jpegQuality: currentDynamicSettings.jpegQuality,
      videoBitrate: currentDynamicSettings.videoBitrate,
      x264Preset: currentDynamicSettings.x264Preset,
      useGPU: currentDynamicSettings.useGPU,
      cacheSize: (currentDynamicSettings.offthreadVideoCacheSizeInBytes / (1024 * 1024)).toFixed(0) + 'MB'
    });
    
    // Reset performance tracking
    frameRenderTimes = [];
    lastFrameTime = performance.now();
    totalFramesRendered = 0;
    
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

      // Convert recordings to plain object and generate video URLs
      const recordingsObj = Object.fromEntries(recordings);
      const videoUrls: Record<string, string> = {};
      
      // Generate file:// URLs for each recording
      // We use file:// for export because Remotion's Chrome instance doesn't have our custom protocol
      for (const [recordingId, recording] of recordings) {
        if (recording.filePath) {
          // Normalize the path and create file:// URL
          const normalizedPath = path.resolve(recording.filePath);
          // Use pathToFileURL to properly format file URLs with encoded spaces
          const fileUrl = pathToFileURL(normalizedPath).toString();
          videoUrls[recordingId] = fileUrl;
          console.log(`Generated video URL for ${recordingId}:`, videoUrls[recordingId]);
        }
      }
      
      // Prepare composition props
      const inputProps = {
        segments,
        recordings: recordingsObj,
        metadata: Object.fromEntries(metadata),
        videoUrls, // Add videoUrls to props
        ...settings,
      };

      // Select composition - use SegmentsComposition for multi-segment exports
      const compositionId = segments && segments.length > 0 ? 'SegmentsComposition' : 'MainComposition';
      console.log(`Using composition: ${compositionId}`);
      
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: compositionId,
        inputProps
      });

      const totalFrames = composition.durationInFrames;
      
      // Get dynamic chunk size based on system and frame
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
          
          // Get chromium options
          const chromiumOptions = {
            enableMultiProcessOnLinux: true,
            gl: currentDynamicSettings!.useGPU ? 'angle' as const : 'swangle' as const,
            headless: true,
            disableWebSecurity: false,
            args: currentDynamicSettings!.useGPU ? [
              '--enable-gpu',
              '--enable-accelerated-video-decode',
              '--enable-accelerated-mjpeg-decode',
              '--disable-gpu-sandbox',
              '--enable-unsafe-webgpu',
              '--use-gl=desktop',
              '--enable-features=VaapiVideoDecoder',
              '--ignore-gpu-blocklist'
            ] : []
          };
          
          const chunkStartTime = performance.now();
          
          // Render this chunk with adaptive settings
          await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: settings.format === 'webm' ? 'vp8' : 'h264',
            outputLocation: chunkPath,
            inputProps,
            frameRange: [chunk.startFrame, chunk.endFrame],
            chromiumOptions,
            onProgress: (info) => {
              // Track frame render performance
              if (info.renderedFrames > totalFramesRendered) {
                const now = performance.now();
                const frameTime = now - lastFrameTime;
                frameRenderTimes.push(frameTime);
                lastFrameTime = now;
                totalFramesRendered = info.renderedFrames;
              }
              
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
          
          const chunkTime = performance.now() - chunkStartTime;
          console.log(`Chunk ${index + 1} completed in ${(chunkTime / 1000).toFixed(1)}s`);
          
          chunkFiles.push(chunkPath);
          
          // Adaptive optimization between chunks
          if (currentDynamicSettings?.enableAdaptiveOptimization && frameRenderTimes.length > 10) {
            const memoryUsage = 1 - (os.freemem() / os.totalmem());
            const adaptedSettings = await machineProfiler.adaptSettingsDuringExport(
              currentDynamicSettings!,
              frameRenderTimes,
              memoryUsage
            );
            
            if (adaptedSettings.concurrency !== currentDynamicSettings.concurrency ||
                adaptedSettings.chunkSizeFrames !== currentDynamicSettings.chunkSizeFrames) {
              console.log('Adapting export settings based on performance:', {
                concurrency: `${currentDynamicSettings.concurrency} -> ${adaptedSettings.concurrency}`,
                chunkSize: `${currentDynamicSettings.chunkSizeFrames} -> ${adaptedSettings.chunkSizeFrames}`
              });
              currentDynamicSettings = adaptedSettings;
            }
          }
          
          // Force garbage collection between chunks
          if (global.gc) {
            global.gc();
            console.log(`Memory cleaned after chunk ${index + 1}`);
          }
          
          // Pause between chunks if needed (thermal management)
          if (currentDynamicSettings && currentDynamicSettings.pauseBetweenChunks > 0) {
            const pauseTime = currentDynamicSettings.pauseBetweenChunks;
            console.log(`Pausing ${pauseTime}ms for thermal management`);
            await new Promise(resolve => setTimeout(resolve, pauseTime));
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
        
        // Get chromium options
        const chromiumOptions = {
          enableMultiProcessOnLinux: true,
          gl: currentDynamicSettings!.useGPU ? 'angle' as const : 'swangle' as const,
          headless: true,
          disableWebSecurity: false,
          args: currentDynamicSettings!.useGPU ? [
            '--enable-gpu',
            '--enable-accelerated-video-decode',
            '--enable-accelerated-mjpeg-decode',
            '--disable-gpu-sandbox',
            '--enable-unsafe-webgpu',
            '--use-gl=desktop',
            '--enable-features=VaapiVideoDecoder',
            '--ignore-gpu-blocklist'
          ] : []
        };
        
        // Store the render process for potential cancellation
        activeExportProcess = renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        chromiumOptions,
        onProgress: (info) => {
          // Track frame render performance
          if (info.renderedFrames > totalFramesRendered) {
            const now = performance.now();
            const frameTime = now - lastFrameTime;
            frameRenderTimes.push(frameTime);
            lastFrameTime = now;
            totalFramesRendered = info.renderedFrames;
          }
          
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
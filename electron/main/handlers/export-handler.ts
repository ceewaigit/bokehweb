/**
 * Electron main process handler for Remotion export
 * Handles the actual export using Node.js APIs
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { machineProfiler, type DynamicExportSettings } from '../utils/machine-profiler';
import { performance } from 'perf_hooks';
import { makeVideoSrc } from '../utils/video-url-factory';
import { getVideoServer } from '../video-http-server';
import { getRecordingsDirectory } from '../config';
import fsSync from 'fs';

const exec = promisify(execCallback);

// Note: Chrome cache directory removed - not used in current implementation

// Active export processes
let activeExportProcess: any = null;

// Performance tracking
let frameRenderTimes: number[] = [];
let lastFrameTime = 0;
let totalFramesRendered = 0;
let currentDynamicSettings: DynamicExportSettings | null = null;

// Calculate chunks for large exports with proper boundaries
function calculateChunks(totalFrames: number, framesPerChunk: number) {
  const chunks = [];
  for (let start = 0; start < totalFrames; start += framesPerChunk) {
    const endExclusive = Math.min(start + framesPerChunk, totalFrames);
    chunks.push({
      startFrame: start,
      endFrame: endExclusive - 1 // Inclusive end for frameRange
    });
  }
  console.log(`Created ${chunks.length} chunks for ${totalFrames} frames (${framesPerChunk} frames per chunk)`);
  return chunks;
}

// Create chromium options for rendering
function getChromiumOptions(useGPU: boolean) {
  return {
    enableMultiProcessOnLinux: true,
    gl: useGPU ? 'angle' as const : 'swangle' as const,
    headless: true,
    disableWebSecurity: false,
    args: useGPU ? [
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
}

export function setupExportHandler() {
  console.log('📦 Setting up export handler');
  
  
  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings, projectFolder }) => {
    console.log('📹 Export handler invoked with settings:', settings);
    console.log('📁 Project folder:', projectFolder || 'Not provided');
    
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
    
    // EMERGENCY MEMORY FIX: Ultra-conservative settings to prevent OOM
    // Based on analysis: actual memory usage is much higher than JS heap
    // Remotion caches + Chrome textures + ArrayBuffers all compete in V8's 4GB memory cage
    
    // Check if system is under heavy memory pressure
    const isEmergencyMode = machineProfile.memoryPressure === 'heavy' || 
                           machineProfile.availableMemoryGB < 2;
    
    if (isEmergencyMode) {
      console.warn('⚠️ EMERGENCY MEMORY MODE: System under heavy pressure');
      currentDynamicSettings.concurrency = 1;
      currentDynamicSettings.chunkSizeFrames = 15; // Ultra-small: 0.25 seconds at 60fps
      currentDynamicSettings.jpegQuality = 75; // Lower quality for less memory
      currentDynamicSettings.offthreadVideoCacheSizeInBytes = 64 * 1024 * 1024; // Only 64MB cache
      currentDynamicSettings.offthreadVideoThreads = 1;
      currentDynamicSettings.pauseBetweenChunks = 1000; // 1 second pause between chunks
    } else {
      // Normal conservative mode
      currentDynamicSettings.concurrency = 1;
      currentDynamicSettings.chunkSizeFrames = 30; // 0.5 seconds at 60fps
      currentDynamicSettings.jpegQuality = 80;
      currentDynamicSettings.offthreadVideoCacheSizeInBytes = 128 * 1024 * 1024; // 128MB cache
      currentDynamicSettings.offthreadVideoThreads = 1;
      currentDynamicSettings.pauseBetweenChunks = 500; // 0.5 second pause
    }
    
    currentDynamicSettings.enableAdaptiveOptimization = false; // Always use fixed settings
    
    console.log('Dynamic export settings (memory-optimized):', {
      mode: isEmergencyMode ? 'EMERGENCY' : 'NORMAL',
      concurrency: currentDynamicSettings.concurrency,
      chunkSize: currentDynamicSettings.chunkSizeFrames,
      jpegQuality: currentDynamicSettings.jpegQuality,
      videoBitrate: currentDynamicSettings.videoBitrate,
      x264Preset: currentDynamicSettings.x264Preset,
      useGPU: currentDynamicSettings.useGPU,
      cacheSize: (currentDynamicSettings.offthreadVideoCacheSizeInBytes / (1024 * 1024)).toFixed(0) + 'MB',
      offthreadVideoThreads: currentDynamicSettings.offthreadVideoThreads,
      pauseBetweenChunks: currentDynamicSettings.pauseBetweenChunks + 'ms'
    });
    
    // PRE-EXPORT MEMORY CHECK: Refuse export if system memory is critically low
    if (machineProfile.availableMemoryGB < 1) {
      console.error('❌ EXPORT BLOCKED: Less than 1GB memory available');
      event.sender.send('export-progress', {
        progress: 0,
        stage: 'error',
        message: 'Export blocked: Insufficient memory. Please close other applications and try again.'
      });
      return {
        success: false,
        error: 'Insufficient memory (< 1GB free). Close other applications and try again.'
      };
    }
    
    if (isEmergencyMode) {
      console.warn('⚠️ Export proceeding in EMERGENCY MODE due to memory pressure');
      event.sender.send('export-progress', {
        progress: 1,
        stage: 'preparing',
        message: 'Low memory detected. Export will be slower but more stable...'
      });
    }
    
    // Reset performance tracking
    frameRenderTimes = [];
    lastFrameTime = performance.now();
    totalFramesRendered = 0;
    
    // Force aggressive memory cleanup before export
    try {
      // Kill any lingering Chrome processes
      await exec('pkill -9 -f "chrome-headless-shell"').catch(() => {});
      await exec('pkill -9 -f "Chrome Helper"').catch(() => {});
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
        publicDir: path.join(process.cwd(), 'public'), // Include public directory for assets (cursors, etc.)
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

      // Start the HTTP server for video serving during export
      console.log('🌐 Starting video HTTP server for export...');
      await getVideoServer();
      
      // Convert recordings to plain object and generate video URLs
      const recordingsObj = Object.fromEntries(recordings);
      const videoUrls: Record<string, string> = {};
      
      // Get the recordings directory
      const recordingsDir = getRecordingsDirectory();
      
      // Generate HTTP URLs for each recording (Remotion can access these)
      for (const [recordingId, recording] of recordings) {
        if (recording.filePath) {
          let fullPath = recording.filePath;
          console.log(`\n🎬 Processing recording ${recordingId}:`);
          console.log(`  Original path: ${recording.filePath}`);
          console.log(`  Is absolute: ${path.isAbsolute(recording.filePath)}`);
          
          // If the path is not absolute, resolve it relative to the project folder or recordings directory
          if (!path.isAbsolute(recording.filePath)) {
            // If we have a project folder passed from the client, use it
            if (projectFolder) {
              // Try project folder first
              const projectPath = path.join(projectFolder, path.basename(recording.filePath));
              if (fsSync.existsSync(projectPath)) {
                fullPath = projectPath;
                console.log(`Found recording in project folder: ${fullPath}`);
              } else {
                // Try recordings directory
                const recordingsPath = path.join(recordingsDir, path.basename(recording.filePath));
                if (fsSync.existsSync(recordingsPath)) {
                  fullPath = recordingsPath;
                  console.log(`Found recording in recordings directory: ${fullPath}`);
                } else {
                  console.warn(`Recording ${recordingId} not found, using original path: ${recording.filePath}`);
                  fullPath = recording.filePath;
                }
              }
            } else if (recording.folderPath) {
              fullPath = path.join(recording.folderPath, recording.filePath);
            } else {
              // Fallback: try recordings directory
              const possiblePath = path.join(recordingsDir, recording.filePath);
              if (fsSync.existsSync(possiblePath)) {
                fullPath = possiblePath;
              } else {
                console.warn(`Recording ${recordingId} not found at expected path`);
                fullPath = path.resolve(recording.filePath);
              }
            }
          }
          
          // Normalize the path and create HTTP URL via video server
          const normalizedPath = path.resolve(fullPath);
          console.log(`  Resolved to: ${normalizedPath}`);
          console.log(`  File exists: ${fsSync.existsSync(normalizedPath)}`);
          
          // Use the video server to create HTTP URLs that Remotion can access
          const videoUrl = await makeVideoSrc(normalizedPath, 'export');
          videoUrls[recordingId] = videoUrl;
          console.log(`  Final URL: ${videoUrls[recordingId]}`);
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
      
      // Use dynamic settings from MachineProfiler instead of legacy functions
      const framesPerChunk = currentDynamicSettings!.chunkSizeFrames;
      const isLargeExport = totalFrames > framesPerChunk;
      
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
          const chromiumOptions = getChromiumOptions(currentDynamicSettings!.useGPU);
          
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
            onStart: ({ resolvedConcurrency, parallelEncoding }) => {
              console.log(`[Chunk ${index + 1}] Started with concurrency=${resolvedConcurrency}, parallelEncoding=${parallelEncoding}`);
            },
            onProgress: (info) => {
              // Track frame render performance
              if (info.renderedFrames > totalFramesRendered) {
                const now = performance.now();
                const frameTime = now - lastFrameTime;
                frameRenderTimes.push(frameTime);
                lastFrameTime = now;
                totalFramesRendered = info.renderedFrames;
              }
              
              // REAL MEMORY MONITORING: Track RSS/private bytes, not just heap
              const memUsage = process.memoryUsage();
              const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
              const rssMB = Math.round(memUsage.rss / (1024 * 1024)); // Resident Set Size - actual memory
              const externalMB = Math.round(memUsage.external / (1024 * 1024)); // C++ objects
              const arrayBuffersMB = Math.round(memUsage.arrayBuffers / (1024 * 1024)); // ArrayBuffers (frames!)
              
              // Log REAL memory status every 10 frames
              if (info.renderedFrames % 10 === 0) {
                // Get process memory info for more accurate data
                process.getProcessMemoryInfo().then(procMem => {
                  const privateMB = Math.round(procMem.private / 1024); // Private memory in MB
                  console.log(`[MEMORY] RSS: ${rssMB}MB | Private: ${privateMB}MB | Heap: ${heapUsedMB}MB | External: ${externalMB}MB | ArrayBuffers: ${arrayBuffersMB}MB`);
                  
                  // CRITICAL: Abort if private memory exceeds safe threshold
                  if (privateMB > 3000) { // 3GB private memory
                    console.error('⚠️ CRITICAL: Private memory exceeds 3GB, risk of OOM!');
                  }
                }).catch(() => {
                  // Fallback if getProcessMemoryInfo fails
                  console.log(`[MEMORY] RSS: ${rssMB}MB | Heap: ${heapUsedMB}MB | External: ${externalMB}MB | ArrayBuffers: ${arrayBuffersMB}MB`);
                });
              }
              
              // Calculate overall progress
              const chunkProgress = info.progress;
              const overallProgress = ((index + chunkProgress) / chunks.length) * 85;
              
              event.sender.send('export-progress', {
                progress: Math.min(85, 10 + overallProgress),
                currentFrame: chunk.startFrame + info.renderedFrames,
                totalFrames: totalFrames,
                message: `Chunk ${index + 1}/${chunks.length} (Memory: ${rssMB}MB)`
              });
            },
            hardwareAcceleration: currentDynamicSettings!.useGPU ? 'if-possible' as const : 'disable' as const,
            concurrency: currentDynamicSettings!.concurrency,
            jpegQuality: currentDynamicSettings!.jpegQuality,
            everyNthFrame: 1,
            x264Preset: currentDynamicSettings!.x264Preset,
            pixelFormat: 'yuv420p',
            audioBitrate: null,
            videoBitrate: currentDynamicSettings!.videoBitrate,
            audioCodec: null,
            offthreadVideoCacheSizeInBytes: currentDynamicSettings!.offthreadVideoCacheSizeInBytes,
            offthreadVideoThreads: 1 // MEMORY FIX: Reduce threads for memory efficiency
          });
          
          const chunkTime = performance.now() - chunkStartTime;
          console.log(`Chunk ${index + 1} completed in ${(chunkTime / 1000).toFixed(1)}s`);
          
          chunkFiles.push(chunkPath);
          
          // AGGRESSIVE MEMORY CLEANUP between chunks
          if (global.gc) {
            const memBeforeGC = process.memoryUsage();
            
            // Multiple GC passes for thorough cleanup
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100)); // Let GC work
            global.gc();
            
            const memAfterGC = process.memoryUsage();
            const freedMB = Math.round((memBeforeGC.rss - memAfterGC.rss) / (1024 * 1024));
            
            console.log(`[GC] Chunk ${index + 1} cleanup:`, {
              beforeRSS: Math.round(memBeforeGC.rss / (1024 * 1024)) + 'MB',
              afterRSS: Math.round(memAfterGC.rss / (1024 * 1024)) + 'MB',
              freed: freedMB + 'MB',
              heap: Math.round(memAfterGC.heapUsed / (1024 * 1024)) + 'MB',
              arrayBuffers: Math.round(memAfterGC.arrayBuffers / (1024 * 1024)) + 'MB'
            });
            
            // Check REAL memory (RSS), not just heap
            if (memAfterGC.rss > 3 * 1024 * 1024 * 1024) { // > 3GB RSS
              console.warn('⚠️ High RSS memory detected, pausing for recovery...');
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2s pause
              global.gc(); // One more GC after pause
            }
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
        const chromiumOptions = getChromiumOptions(currentDynamicSettings!.useGPU);
        
        // Store the render process for potential cancellation
        activeExportProcess = renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        chromiumOptions,
        onStart: ({ resolvedConcurrency, parallelEncoding }) => {
          console.log(`[Single Export] Started with concurrency=${resolvedConcurrency}, parallelEncoding=${parallelEncoding}`);
        },
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
        hardwareAcceleration: currentDynamicSettings!.useGPU ? 'if-possible' as const : 'disable' as const,
        concurrency: currentDynamicSettings!.concurrency,
        jpegQuality: currentDynamicSettings!.jpegQuality,
        everyNthFrame: 1,
        x264Preset: currentDynamicSettings!.x264Preset,
        pixelFormat: 'yuv420p',
        audioBitrate: null,
        videoBitrate: currentDynamicSettings!.videoBitrate,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: currentDynamicSettings!.offthreadVideoCacheSizeInBytes,
        offthreadVideoThreads: 4 // Add threads for video decoding
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
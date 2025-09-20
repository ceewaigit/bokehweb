/**
 * Electron main process handler for Remotion export
 * Handles the actual export using Node.js APIs
 */

import { ipcMain, app, utilityProcess } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { machineProfiler, type DynamicExportSettings } from '../utils/machine-profiler';
import { makeVideoSrc } from '../utils/video-url-factory';
import { getVideoServer } from '../video-http-server';
import { getRecordingsDirectory } from '../config';
import fsSync from 'fs';

const exec = promisify(execCallback);

// Active export worker process
let activeExportWorker: any = null;

// Current export settings
let currentDynamicSettings: DynamicExportSettings | null = null;


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
    
    // STREAMING MEMORY FIX: Ultra-conservative settings for streaming pipeline
    // New architecture: separate process + frame-by-frame streaming
    // This completely eliminates the V8 memory cage competition
    
    // Check if system is under heavy memory pressure
    const isEmergencyMode = machineProfile.memoryPressure === 'heavy' || 
                           machineProfile.availableMemoryGB < 2;
    
    if (isEmergencyMode) {
      console.warn('⚠️ EMERGENCY MEMORY MODE: System under heavy pressure');
      currentDynamicSettings.concurrency = 1;
      currentDynamicSettings.jpegQuality = 70; // Lower quality for less memory
      currentDynamicSettings.offthreadVideoCacheSizeInBytes = 16 * 1024 * 1024; // Only 16MB cache
    } else {
      // Normal streaming mode
      currentDynamicSettings.concurrency = 1;
      currentDynamicSettings.jpegQuality = 80;
      currentDynamicSettings.offthreadVideoCacheSizeInBytes = 32 * 1024 * 1024; // 32MB cache for streaming
    }
    
    currentDynamicSettings.enableAdaptiveOptimization = false; // Always use fixed settings
    
    console.log('Dynamic export settings (memory-optimized):', {
      mode: isEmergencyMode ? 'EMERGENCY' : 'NORMAL',
      concurrency: currentDynamicSettings.concurrency,
      jpegQuality: currentDynamicSettings.jpegQuality,
      videoBitrate: currentDynamicSettings.videoBitrate,
      x264Preset: currentDynamicSettings.x264Preset,
      useGPU: currentDynamicSettings.useGPU,
      cacheSize: (currentDynamicSettings.offthreadVideoCacheSizeInBytes / (1024 * 1024)).toFixed(0) + 'MB'
    });
    
    // Memory warning but don't block - streaming architecture can handle low memory
    if (isEmergencyMode) {
      console.warn('⚠️ Export proceeding in EMERGENCY MODE due to memory pressure');
      console.warn(`Available memory: ${machineProfile.availableMemoryGB.toFixed(1)}GB, Pressure: ${machineProfile.memoryPressure}`);
      event.sender.send('export-progress', {
        progress: 1,
        stage: 'preparing',
        message: 'Low memory detected. Export will use streaming mode for stability...'
      });
      
      // Extra conservative settings for very low memory
      if (machineProfile.availableMemoryGB < 0.5) {
        currentDynamicSettings.offthreadVideoCacheSizeInBytes = 8 * 1024 * 1024; // Only 8MB cache
        currentDynamicSettings.jpegQuality = 65; // Even lower quality
        console.warn('⚠️ CRITICAL: Using ultra-minimal settings due to very low memory');
      }
    }
    
    // Force memory cleanup before export
    try {
      // Kill any lingering Chrome processes
      await exec('pkill -9 -f "chrome-headless-shell"').catch(() => {});
      await exec('pkill -9 -f "Chrome Helper"').catch(() => {});
      console.log('Cleaned up Chrome processes');
    } catch (e) {
      // Ignore
    }
    
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }
    
    let bundleLocation: string | null = null;
    let outputPath: string | null = null;
    let exportWorker: any = null;
    
    try {
      // Lazy load Remotion modules to avoid import issues
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
      
      // Create temp output path
      outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // STREAMING EXPORT: Use separate worker process for memory isolation
      console.log('🚀 Starting streaming export in isolated worker process');
      
      // Use TypeScript-compiled worker (not webpack bundled)
      const workerPath = path.join(__dirname, '..', 'export-worker.js');
      
      if (!fsSync.existsSync(workerPath)) {
        throw new Error(`Export worker not found at ${workerPath}. Run 'npm run build:electron'.`);
      }
      
      // Use utilityProcess for better Electron integration
      exportWorker = utilityProcess.fork(workerPath, [], {
        serviceName: 'Remotion Export Worker',
        execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      });
      
      // Store worker reference for cancellation
      activeExportWorker = exportWorker;
      
      // Set up worker event handlers
      exportWorker.on('message', (msg: any) => {
        if (msg.type === 'progress') {
          // Forward progress to renderer
          event.sender.send('export-progress', msg.data);
        } else if (msg.type === 'complete') {
          console.log('✅ Export completed successfully');
        } else if (msg.type === 'error') {
          console.error('❌ Export worker error:', msg.error);
        }
      });
      
      exportWorker.on('error', (error: Error) => {
        console.error('Worker process error:', error);
      });
      
      exportWorker.on('exit', (code: number, signal: string) => {
        if (code !== 0 && code !== null) {
          console.error(`Worker exited with code ${code}, signal ${signal}`);
        }
        activeExportWorker = null;
      });
      
      // Prepare job for worker
      const exportJob = {
        bundleLocation,
        compositionId,
        inputProps,
        outputPath,
        settings,
        // Pass memory settings
        offthreadVideoCacheSizeInBytes: currentDynamicSettings!.offthreadVideoCacheSizeInBytes,
        jpegQuality: currentDynamicSettings!.jpegQuality,
        videoBitrate: currentDynamicSettings!.videoBitrate,
        x264Preset: currentDynamicSettings!.x264Preset,
        useGPU: currentDynamicSettings!.useGPU,
      };
      
      // Send job to worker
      exportWorker.postMessage({ type: 'start', job: exportJob });
      
      // Wait for worker to complete
      await new Promise<void>((resolve, reject) => {
        exportWorker.once('message', (msg: any) => {
          if (msg.type === 'complete') {
            resolve();
          } else if (msg.type === 'error') {
            reject(new Error(msg.error));
          }
        });
        
        exportWorker.once('exit', (code: number) => {
          if (code !== 0) {
            reject(new Error(`Export worker exited with code ${code}`));
          }
        });
      });
      
      console.log('Export worker completed successfully');

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
      if (activeExportWorker) {
        console.log('Canceling active export worker...');
        // Send cancel message to worker
        activeExportWorker.postMessage({ type: 'cancel' });
        
        // Give worker time to clean up, then force kill if needed
        setTimeout(() => {
          if (activeExportWorker) {
            activeExportWorker.kill('SIGKILL');
            activeExportWorker = null;
          }
        }, 2000);
        
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
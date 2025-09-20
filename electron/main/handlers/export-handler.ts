/**
 * Export handler using supervised worker with MessagePort IPC
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { machineProfiler } from '../utils/machine-profiler';
import { makeVideoSrc } from '../utils/video-url-factory';
import { getVideoServer } from '../video-http-server';
import { getRecordingsDirectory } from '../config';
import { resolveFfmpegPath, getCompositorDirectory } from '../utils/ffmpeg-resolver';
import { workerPool, SupervisedWorker } from '../utils/worker-manager';
import fsSync from 'fs';

let exportWorker: SupervisedWorker | null = null;

export function setupExportHandler() {
  console.log('📦 Setting up export handler with supervised worker');
  
  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings, projectFolder }) => {
    console.log('📹 Export handler invoked with settings:', settings);
    
    try {
      // Profile the machine
      const videoWidth = settings.resolution?.width || 1920;
      const videoHeight = settings.resolution?.height || 1080;
      
      const machineProfile = await machineProfiler.profileSystem(videoWidth, videoHeight);
      console.log('Machine profile:', {
        cpuCores: machineProfile.cpuCores,
        memoryGB: machineProfile.totalMemoryGB.toFixed(1),
        gpuAvailable: machineProfile.gpuAvailable
      });
      
      // Get export settings
      const targetQuality = settings.quality === 'ultra' ? 'quality' : 
                           settings.quality === 'low' ? 'fast' : 'balanced';
      const dynamicSettings = machineProfiler.getDynamicExportSettings(
        machineProfile,
        videoWidth,
        videoHeight,
        targetQuality
      );
      
      // Use conservative settings for stability
      dynamicSettings.concurrency = 1;
      dynamicSettings.jpegQuality = settings.quality === 'ultra' ? 90 : 80;
      
      // Cap OffthreadVideo cache to prevent memory exhaustion
      // Use 32MB as safe default, or 1/16 of available memory (whichever is smaller)
      const availableMemoryGB = machineProfile.availableMemoryGB || 2;
      const maxCacheMB = Math.min(32, Math.floor(availableMemoryGB * 1024 / 16));
      dynamicSettings.offthreadVideoCacheSizeInBytes = maxCacheMB * 1024 * 1024;
      
      console.log('Export settings:', {
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU
      });
      
      // Bundle Remotion project
      const { bundle } = await import('@remotion/bundler');
      const entryPoint = path.join(process.cwd(), 'src/remotion/index.ts');
      const bundleLocation = await bundle({
        entryPoint,
        publicDir: path.join(process.cwd(), 'public'),
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

      // Select composition in main process to avoid OOM in worker
      const { selectComposition } = await import('@remotion/renderer');
      
      // Use minimal props for composition selection
      const minimalProps = {
        segments: segments?.slice(0, 1) || [], // Just first segment for metadata
        recordings: {},
        metadata: {},
        videoUrls: {},
        ...settings
      };
      
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: segments && segments.length > 0 ? 'SegmentsComposition' : 'MainComposition',
        inputProps: minimalProps
      });
      
      // Calculate actual total frames from all segments
      let totalDurationInFrames = composition.durationInFrames;
      
      // If we have segments, calculate the real duration from all of them
      if (segments && segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        const firstSegment = segments[0];
        const totalDurationMs = lastSegment.endTime - firstSegment.startTime;
        const fps = settings.framerate || composition.fps || 30;
        totalDurationInFrames = Math.ceil((totalDurationMs / 1000) * fps);
        console.log(`Calculated total frames from segments: ${totalDurationInFrames} (${segments.length} segments)`);
      }
      
      // Extract composition metadata with corrected frame count
      const compositionMetadata = {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationInFrames: totalDurationInFrames,
        id: composition.id,
        defaultProps: composition.defaultProps
      };

      // Start video server
      await getVideoServer();
      
      // Convert recordings to video URLs
      const recordingsObj = Object.fromEntries(recordings);
      const videoUrls: Record<string, string> = {};
      const recordingsDir = getRecordingsDirectory();
      
      for (const [recordingId, recording] of recordings) {
        if (recording.filePath) {
          let fullPath = recording.filePath;
          
          if (!path.isAbsolute(recording.filePath)) {
            if (projectFolder) {
              const projectPath = path.join(projectFolder, path.basename(recording.filePath));
              if (fsSync.existsSync(projectPath)) {
                fullPath = projectPath;
              } else {
                const recordingsPath = path.join(recordingsDir, path.basename(recording.filePath));
                if (fsSync.existsSync(recordingsPath)) {
                  fullPath = recordingsPath;
                }
              }
            }
          }
          
          const normalizedPath = path.resolve(fullPath);
          const videoUrl = await makeVideoSrc(normalizedPath, 'export');
          videoUrls[recordingId] = videoUrl;
        }
      }
      
      // Prepare composition props
      const inputProps = {
        segments,
        recordings: recordingsObj,
        metadata: Object.fromEntries(metadata),
        videoUrls,
        ...settings,
      };
      
      // Create output path
      const outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Start or get export worker
      if (!exportWorker) {
        const workerPath = path.join(__dirname, '..', 'export-worker.js');
        
        if (!fsSync.existsSync(workerPath)) {
          throw new Error(`Export worker not found at ${workerPath}`);
        }
        
        // Calculate safe memory limit for worker (1/4 of available memory, max 4GB)
        const workerMemoryMB = Math.min(4096, Math.floor((machineProfile.availableMemoryGB || 2) * 1024 / 4));
        
        exportWorker = await workerPool.createWorker('export', workerPath, {
          serviceName: 'Export Worker',
          maxMemory: workerMemoryMB,
          enableHeartbeat: true,
          maxRestarts: 2
        });
        
        // Forward progress events
        exportWorker.on('message', (message) => {
          if (message.type === 'progress') {
            event.sender.send('export-progress', message.data);
          }
        });
      }
      
      // Prepare job with composition metadata
      const exportJob = {
        bundleLocation,
        compositionMetadata, // Pass pre-selected composition metadata
        inputProps,
        outputPath,
        settings,
        offthreadVideoCacheSizeInBytes: dynamicSettings.offthreadVideoCacheSizeInBytes,
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        ffmpegPath: resolveFfmpegPath(),
        compositorDir: getCompositorDirectory(),
      };
      
      // Execute export
      const result = await exportWorker.request('export', exportJob, 10 * 60 * 1000); // 10 minute timeout
      
      // Clean up bundle
      await fs.rm(bundleLocation, { recursive: true, force: true }).catch(() => {});
      
      if (result.success) {
        // Handle file response
        const stats = await fs.stat(outputPath);
        const fileSize = stats.size;
        
        if (fileSize < 50 * 1024 * 1024) {
          const buffer = await fs.readFile(outputPath);
          const base64 = buffer.toString('base64');
          await fs.unlink(outputPath).catch(() => {});
          return { success: true, data: base64, isStream: false };
        }
        
        return { 
          success: true, 
          filePath: outputPath,
          fileSize,
          isStream: true 
        };
      } else {
        await fs.unlink(outputPath).catch(() => {});
        return { 
          success: false, 
          error: result.error || 'Export failed' 
        };
      }
      
    } catch (error) {
      console.error('Export failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Export failed' 
      };
    }
  });
  
  // Handle export cancellation
  ipcMain.handle('export-cancel', async () => {
    try {
      if (exportWorker) {
        await exportWorker.send('cancel', {});
      }
      return { success: true };
    } catch (error) {
      console.error('Error canceling export:', error);
      return { success: false };
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
}
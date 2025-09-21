/**
 * Export handler using supervised worker with MessagePort IPC
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { machineProfiler } from '../utils/machine-profiler';
import type { MachineProfile } from '../utils/machine-profiler';
import { makeVideoSrc } from '../utils/video-url-factory';
import { getVideoServer } from '../video-http-server';
import { getRecordingsDirectory } from '../config';
import { resolveFfmpegPath, getCompositorDirectory } from '../utils/ffmpeg-resolver';
import { workerPool, SupervisedWorker } from '../utils/worker-manager';
import fsSync from 'fs';
import { normalizeCrossPlatform } from '../utils/path-normalizer';

const CHUNK_SIZE_FRAMES = 2000;

interface ChunkPlanEntry {
  index: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
}

const buildChunkPlan = (totalFrames: number, chunkSize: number, fps: number): ChunkPlanEntry[] => {
  if (totalFrames <= 0) {
    return [];
  }

  const numChunks = Math.ceil(totalFrames / chunkSize);
  const plan: ChunkPlanEntry[] = [];

  for (let index = 0; index < numChunks; index++) {
    const startFrame = index * chunkSize;
    const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1);
    const startTimeMs = (startFrame / fps) * 1000;
    const endTimeMs = ((endFrame + 1) / fps) * 1000;

    plan.push({
      index,
      startFrame,
      endFrame,
      startTimeMs,
      endTimeMs
    });
  }

  return plan;
};

const determineParallelWorkerCount = (profile: MachineProfile, chunkCount: number): number => {
  if (chunkCount <= 1) {
    return 1;
  }

  const cpuCores = Math.max(1, profile.cpuCores || 1);
  const rawAvailable = profile.availableMemoryGB ?? 0;
  const totalMem = profile.totalMemoryGB || 4;
  const effectiveMemory = Math.max(rawAvailable, totalMem * 0.4);

  let maxWorkers = 1;
  if (cpuCores >= 6 && effectiveMemory >= 6) maxWorkers = Math.max(maxWorkers, 2);
  if (cpuCores >= 10 && effectiveMemory >= 10) maxWorkers = Math.max(maxWorkers, 3);
  if (cpuCores >= 14 && effectiveMemory >= 14) maxWorkers = Math.max(maxWorkers, 4);

  if (chunkCount >= 4 && cpuCores >= 8) {
    maxWorkers = Math.max(maxWorkers, 2);
  }
  if (chunkCount >= 6 && cpuCores >= 12 && effectiveMemory >= 8) {
    maxWorkers = Math.max(maxWorkers, 3);
  }

  const cpuLimited = Math.max(1, Math.floor(cpuCores / 4));
  const memLimited = Math.max(1, Math.floor(effectiveMemory / 3));

  maxWorkers = Math.min(maxWorkers, cpuLimited, memLimited);
  maxWorkers = Math.min(maxWorkers, 4);
  maxWorkers = Math.min(maxWorkers, chunkCount);

  return Math.max(1, maxWorkers);
};

const computePerWorkerMemoryMB = (profile: MachineProfile, workerCount: number): number => {
  const totalGB = profile.totalMemoryGB || 4;
  const availableGB = profile.availableMemoryGB ?? totalGB * 0.5;
  const memoryBudget = Math.max(availableGB, totalGB * 0.4);
  const baseline = Math.floor((memoryBudget * 1024) / Math.max(1, workerCount * 3));
  return Math.max(512, Math.min(2048, baseline || 1024));
};

const escapeForConcat = (filePath: string): string => {
  return filePath.replace(/'/g, "'\\''");
};

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
      
      // Tune quality parameters based on requested preset
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
        useGPU: dynamicSettings.useGPU,
        concurrency: dynamicSettings.concurrency
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
      const normalizedRecordingsDir = normalizeCrossPlatform(recordingsDir);
      
      for (const [recordingId, recording] of recordings) {
        if (recording.filePath) {
          let fullPath = normalizeCrossPlatform(recording.filePath);

          if (!path.isAbsolute(fullPath)) {
            const candidates = new Set<string>();
            const fileName = path.basename(fullPath);

            if (recording.folderPath) {
              const normalizedFolder = normalizeCrossPlatform(recording.folderPath);
              candidates.add(path.join(normalizedFolder, fileName));

              const folderParent = path.dirname(normalizedFolder);
              if (folderParent && folderParent !== normalizedFolder) {
                candidates.add(path.join(folderParent, fullPath));
                candidates.add(path.join(folderParent, fileName));
              }
            }

            if (projectFolder) {
              const normalizedProject = normalizeCrossPlatform(projectFolder);
              candidates.add(path.join(normalizedProject, fullPath));
              candidates.add(path.join(normalizedProject, fileName));
            }

            candidates.add(path.join(normalizedRecordingsDir, fullPath));
            candidates.add(path.join(normalizedRecordingsDir, fileName));

            for (const candidate of candidates) {
              if (fsSync.existsSync(candidate)) {
                fullPath = candidate;
                break;
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
      
      const workerPath = path.join(__dirname, '..', 'export-worker.js');

      if (!fsSync.existsSync(workerPath)) {
        throw new Error(`Export worker not found at ${workerPath}`);
      }

      const chunkPlan = buildChunkPlan(
        totalDurationInFrames,
        CHUNK_SIZE_FRAMES,
        compositionMetadata.fps || settings.framerate || 30
      );

      const recommendedWorkers = determineParallelWorkerCount(machineProfile, chunkPlan.length);
      const workerCount = Math.min(recommendedWorkers, Math.max(1, chunkPlan.length || 1));
      const useParallel = workerCount > 1;

      console.log('[Export] Chunk plan metrics', {
        totalFrames: totalDurationInFrames,
        chunkCount: chunkPlan.length,
        chunkSize: CHUNK_SIZE_FRAMES,
        recommendedWorkers,
        workerCount,
        availableMemoryGB: machineProfile.availableMemoryGB,
        totalMemoryGB: machineProfile.totalMemoryGB,
        cpuCores: machineProfile.cpuCores
      });

      const ffmpegPath = resolveFfmpegPath();
      const compositorDir = getCompositorDirectory();

      const commonJob = {
        bundleLocation,
        compositionMetadata,
        inputProps,
        outputPath,
        settings,
        offthreadVideoCacheSizeInBytes: dynamicSettings.offthreadVideoCacheSizeInBytes,
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        concurrency: dynamicSettings.concurrency,
        ffmpegPath,
        compositorDir,
        chunkSizeFrames: CHUNK_SIZE_FRAMES,
        totalFrames: totalDurationInFrames,
        totalChunks: chunkPlan.length
      };

      const webContents = event.sender;

      const chunkProgress = new Map<number, { rendered: number; total: number }>();
      const totalFrameCount = Math.max(1, commonJob.totalFrames || totalDurationInFrames || 0);
      let lastForwardedProgress = 0;

      const clampProgress = (value: number | undefined): number => {
        if (!Number.isFinite(value ?? NaN)) {
          return lastForwardedProgress;
        }
        const normalized = Math.min(100, Math.max(0, Math.round(value!)));
        return Math.max(lastForwardedProgress, normalized);
      };

      const forwardProgressMessage = (payload: any) => {
        const data = payload ?? {};

        const hasChunkInfo =
          typeof data.chunkIndex === 'number' &&
          typeof data.chunkTotalFrames === 'number' &&
          Number.isFinite(data.chunkTotalFrames);

        if (hasChunkInfo) {
          const safeTotal = Math.max(0, data.chunkTotalFrames);
          const rendered = Math.max(0, Math.min(safeTotal, data.chunkRenderedFrames ?? 0));

          const chunkState = chunkProgress.get(data.chunkIndex) ?? { rendered: 0, total: safeTotal };
          chunkState.rendered = rendered;
          if (safeTotal > 0) {
            chunkState.total = safeTotal;
          }
          chunkProgress.set(data.chunkIndex, chunkState);

          let renderedSum = 0;
          for (const state of chunkProgress.values()) {
            const chunkTotal = Math.max(1, state.total || 0);
            const chunkRendered = Math.max(0, Math.min(chunkTotal, state.rendered));
            renderedSum += chunkRendered;
          }

          const normalized = Math.min(1, Math.max(0, renderedSum / totalFrameCount));
          const scaled = 10 + normalized * 80;
          const percent = clampProgress(scaled);

          const stage = data.stage === 'finalizing' ? 'finalizing' : data.stage === 'encoding' ? 'encoding' : 'rendering';
          const message = stage === 'finalizing'
            ? 'Finalizing export...'
            : `Rendering ${percent}% complete`;

          const aggregated = {
            progress: percent,
            stage,
            message
            // Don't include currentFrame/totalFrames to avoid flickering
          };

          webContents.send('export-progress', aggregated);
          lastForwardedProgress = aggregated.progress;
          return;
        }

        if (typeof data.progress === 'number') {
          const percent = clampProgress(data.progress);
          const stage = data.stage ?? (percent >= 100 ? 'complete' : 'encoding');
          const message = data.stage === 'finalizing'
            ? 'Finalizing export...'
            : data.stage === 'complete'
              ? 'Export complete!'
              : `Rendering ${percent}% complete`;

          const aggregated = {
            progress: percent,
            stage,
            message
            // Don't forward frame data to avoid flickering with multiple workers
          };

          webContents.send('export-progress', aggregated);
          lastForwardedProgress = aggregated.progress;
          return;
        }

        const fallback = {
          ...data,
          progress: lastForwardedProgress,
          stage: data.stage ?? 'rendering',
          message: data.message ?? `Rendering ${lastForwardedProgress}% complete`
        };

        webContents.send('export-progress', fallback);
        lastForwardedProgress = fallback.progress;
      };

      const attachProgressForwarder = (worker: SupervisedWorker) => {
        const forward = (message: any) => {
          if (message.type === 'progress') {
            forwardProgressMessage(message.data);
          }
        };

        worker.on('message', forward);
        return () => worker.off('message', forward);
      };

      const primaryWorkerMemoryMB = Math.min(4096, Math.floor((availableMemoryGB || 2) * 1024 / 4));

      const ensurePrimaryWorker = async (): Promise<SupervisedWorker> => {
        if (!exportWorker) {
          exportWorker = await workerPool.createWorker('export', workerPath, {
            serviceName: 'Export Worker',
            maxMemory: primaryWorkerMemoryMB,
            enableHeartbeat: true,
            maxRestarts: 2
          });
        }
        return exportWorker;
      };

      const executeWorkerRequest = async (worker: SupervisedWorker, job: any) => {
        const detach = attachProgressForwarder(worker);
        try {
          return await worker.request('export', job, 10 * 60 * 1000);
        } finally {
          detach();
        }
      };

      const runSequentialExport = async () => {
        const worker = await ensurePrimaryWorker();
        return executeWorkerRequest(worker, commonJob);
      };

      const runParallelExport = async () => {
        const workerRefs = new Map<string, SupervisedWorker>();
        const chunkGroups: ChunkPlanEntry[][] = [];

        if (chunkPlan.length === 0) {
          return { success: true };
        }

        const chunksPerWorker = Math.ceil(chunkPlan.length / workerCount);
        for (let i = 0; i < workerCount; i++) {
          const start = i * chunksPerWorker;
          const subset = chunkPlan.slice(start, start + chunksPerWorker);
          if (subset.length > 0) {
            chunkGroups.push(subset);
          }
        }

        const actualWorkerCount = chunkGroups.length;
        const perWorkerMemoryMB = computePerWorkerMemoryMB(machineProfile, actualWorkerCount || 1);
        console.log('[Export] Parallel plan', {
          workerCount: actualWorkerCount,
          perWorkerMemoryMB,
          chunksPerWorker,
          totalChunks: chunkPlan.length
        });
        const pendingChunkPaths: string[] = [];

        const getOrCreateWorker = async (name: string): Promise<SupervisedWorker> => {
          let worker = workerPool.getWorker(name);
          if (!worker) {
            worker = await workerPool.createWorker(name, workerPath, {
              serviceName: `Export Worker ${name}`,
              maxMemory: perWorkerMemoryMB,
              enableHeartbeat: true,
              maxRestarts: 1
            });
          }
          workerRefs.set(name, worker);
          return worker;
        };

        const workerPromises = chunkGroups.map((group, index) => (async () => {
          const workerName = `export-par-${index}`;
          const worker = await getOrCreateWorker(workerName);
          const detach = attachProgressForwarder(worker);
          try {
            const job = {
              ...commonJob,
              outputPath: path.join(app.getPath('temp'), `export-worker-${Date.now()}-${index}.mp4`),
              assignedChunks: group,
              combineChunksInWorker: false
            };

            const result = await worker.request('export', job, 10 * 60 * 1000);
            if (!result.success) {
              throw new Error(result.error || `Worker ${workerName} failed to export`);
            }

            const chunkResults: Array<{ index: number; path: string }> = (result.chunkResults || [])
              .map((entry: any) => ({ index: entry.index as number, path: entry.path as string }))
              .sort((a: { index: number; path: string }, b: { index: number; path: string }) => a.index - b.index);

            pendingChunkPaths.push(...chunkResults.map((entry) => entry.path));
            return chunkResults;
          } finally {
            detach();
          }
        })());

        let chunkResultLists: Array<Array<{ index: number; path: string }>>;

        try {
          chunkResultLists = await Promise.all(workerPromises);
        } catch (error) {
          for (const worker of workerRefs.values()) {
            try {
              worker.send('cancel', {});
            } catch {
              // Ignore cancel errors
            }
          }
          throw error;
        }

        const combinedChunkResults = chunkResultLists
          .flat()
          .sort((a, b) => a.index - b.index);

        if (combinedChunkResults.length === 0) {
          throw new Error('No chunks were rendered during export');
        }

        webContents.send('export-progress', {
          progress: 90,
          stage: 'finalizing',
          message: 'Combining video chunks...'
        });

        const concatListPath = path.join(tmpdir(), `concat-${Date.now()}.txt`);
        pendingChunkPaths.push(concatListPath);

        try {
          const concatContent = combinedChunkResults
            .map(({ path: chunkPath }) => `file '${escapeForConcat(chunkPath)}'`)
            .join('\n');

          await fs.writeFile(concatListPath, concatContent);

          const ffmpegArgs = [
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath
          ];

          await new Promise<void>((resolve, reject) => {
            const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
            ffmpegProcess.on('exit', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`FFmpeg concat failed with code ${code}`));
              }
            });
            ffmpegProcess.on('error', reject);
          });

          webContents.send('export-progress', {
            progress: 95,
            stage: 'finalizing',
            message: 'Finalizing video...'
          });

          return { success: true };
        } finally {
          for (const chunkPath of pendingChunkPaths) {
            await fs.unlink(chunkPath).catch(() => {});
          }

          for (const [name] of workerRefs) {
            await workerPool.destroyWorker(name).catch(() => {});
          }
        }
      };

      const result = useParallel ? await runParallelExport() : await runSequentialExport();

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

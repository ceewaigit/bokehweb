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

// Bundle cache management
interface BundleCache {
  location: string;
  timestamp: number;
  sourceHash?: string;
}

let cachedBundle: BundleCache | null = null;
let isBundling = false;

// Get or create webpack bundle with caching
async function getBundleLocation(forceRebuild = false): Promise<string> {
  // If already bundling, wait for it to complete
  if (isBundling) {
    console.log('Bundle already in progress, waiting...');
    while (isBundling) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (cachedBundle?.location && fsSync.existsSync(cachedBundle.location)) {
      return cachedBundle.location;
    }
  }

  // Check if we have a valid cached bundle
  if (!forceRebuild && cachedBundle?.location) {
    if (fsSync.existsSync(cachedBundle.location)) {
      console.log('Using cached Remotion bundle from:', cachedBundle.location);
      return cachedBundle.location;
    } else {
      console.log('Cached bundle no longer exists, rebuilding...');
      cachedBundle = null;
    }
  }

  try {
    isBundling = true;
    console.log('Building new Remotion bundle...');

    const { bundle } = await import('@remotion/bundler');
    const entryPoint = path.join(process.cwd(), 'src/remotion/index.ts');

    const startTime = Date.now();
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

    const bundleTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Bundle created in ${bundleTime}s at:`, bundleLocation);

    // Cache the bundle
    cachedBundle = {
      location: bundleLocation,
      timestamp: Date.now()
    };

    return bundleLocation;
  } finally {
    isBundling = false;
  }
}

// Clean up cached bundle on app quit
export function cleanupBundleCache() {
  if (cachedBundle?.location) {
    fs.rm(cachedBundle.location, { recursive: true, force: true }).catch(() => { });
    cachedBundle = null;
  }
}

// Dynamic chunk size based on available memory
function getOptimalChunkSize(profile: MachineProfile): number {
  const availableGB = profile.availableMemoryGB || 2;

  // Even with low memory, use larger chunks to reduce overhead
  // The bottleneck is worker count, not chunk size
  if (availableGB < 1) {
    return 1000; // Low memory: still use 1000 frames to reduce overhead
  } else if (availableGB < 4) {
    return 1500; // Medium memory
  } else if (availableGB < 8) {
    return 2000; // Good memory
  } else {
    return 2500; // High memory: larger chunks for best performance
  }
}

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

const determineParallelWorkerCount = (profile: MachineProfile, chunkCount: number, videoSizeEstimateGB: number = 0): number => {
  if (chunkCount <= 1) {
    return 1;
  }

  const cpuCores = Math.max(1, profile.cpuCores || 1);
  const availableMemoryGB = profile.availableMemoryGB ?? 0;
  const totalMem = profile.totalMemoryGB || 4;

  // CRITICAL: If available memory is very low, limit workers severely
  if (availableMemoryGB < 1) {
    // With < 1GB available, use at most 2 workers to prevent thrashing
    return Math.min(2, chunkCount);
  }

  // Smart allocation based on video size
  if (videoSizeEstimateGB < 0.5) {
    // Small video: single worker is fine
    return 1;
  } else if (videoSizeEstimateGB < 2) {
    // Medium video: 2-3 workers
    return Math.min(3, chunkCount, cpuCores - 1);
  }

  const effectiveMemory = Math.max(availableMemoryGB, totalMem * 0.4);

  // MORE AGGRESSIVE: Use 80% of CPU cores instead of 50%
  let idealWorkers = Math.floor(cpuCores * 0.8);

  // Memory constraint: Each worker needs ~500MB-1GB
  const memoryBasedWorkers = Math.floor(effectiveMemory);

  // Take the minimum of CPU-based and memory-based limits
  let maxWorkers = Math.min(idealWorkers, memoryBasedWorkers);

  // Ensure at least 2 workers if we have 4+ cores AND enough memory
  if (cpuCores >= 4 && availableMemoryGB >= 2) {
    maxWorkers = Math.max(maxWorkers, 2);
  }

  // Cap at chunk count (no point having more workers than chunks)
  maxWorkers = Math.min(maxWorkers, chunkCount);

  // Reasonable upper limit to prevent system overload (but less conservative)
  maxWorkers = Math.min(maxWorkers, Math.max(1, cpuCores - 1)); // Only leave 1 core for system

  return Math.max(1, maxWorkers);
};

const computePerWorkerMemoryMB = (profile: MachineProfile, workerCount: number): number => {
  const totalGB = profile.totalMemoryGB || 4;
  const availableGB = profile.availableMemoryGB ?? totalGB * 0.5;
  const memoryBudget = Math.max(availableGB, totalGB * 0.4);
  const baseline = Math.floor((memoryBudget * 1024) / Math.max(1, workerCount * 3));
  return Math.max(512, Math.min(2048, baseline || 1024));
};

const computeWorkerTimeoutMs = (
  totalFrames: number,
  fps: number | undefined,
  chunkCount: number,
  workerCount: number
): number => {
  const safeFrames = Math.max(1, totalFrames || 1);
  const effectiveFps = Math.max(1, Math.floor(fps || 30));
  const baseSeconds = safeFrames / effectiveFps;

  // Chunk pressure grows when we have to serialize large chunk batches through few workers.
  const chunkPressure = Math.max(1, chunkCount / Math.max(1, workerCount));
  const safetyMultiplier = Math.min(20, Math.max(8, chunkPressure * 4));
  const estimatedSeconds = baseSeconds * safetyMultiplier;

  const minTimeoutMs = 15 * 60 * 1000; // never less than 15 minutes
  const maxTimeoutMs = 2 * 60 * 60 * 1000; // cap at 2 hours
  return Math.min(maxTimeoutMs, Math.max(minTimeoutMs, Math.round(estimatedSeconds * 1000)));
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

      // CRITICAL FIX: Dramatically increase video cache to prevent pruning and re-seeking
      // Small cache causes constant pruning, each re-seek takes 100-700ms
      const totalMemoryGB = machineProfile.totalMemoryGB || 16;
      const reportedAvailableGB = machineProfile.availableMemoryGB ?? 0;

      // macOS frequently reports <2GB "available" even when plenty is free.
      // Derive a safer floor from total RAM to avoid under-utilising hardware.
      const baselineFromTotal = totalMemoryGB * 0.4; // Keep ~60% reserved for system
      const minimumOperationalGB = 2;
      const effectiveMemoryGB = Math.min(
        totalMemoryGB,
        Math.max(reportedAvailableGB, baselineFromTotal, minimumOperationalGB)
      );

      if (effectiveMemoryGB - reportedAvailableGB > 0.5) {
        console.log('[Export] Adjusted effective memory up from low OS reading', {
          reportedAvailableGB: reportedAvailableGB.toFixed(2),
          derivedBaselineGB: baselineFromTotal.toFixed(2),
          effectiveMemoryGB: effectiveMemoryGB.toFixed(2)
        });
      }

      // STABILITY FIX: Use conservative video cache to prevent memory exhaustion
      // Reduced by 50% from previous values to lower memory pressure
      let videoCacheSizeMB;
      if (effectiveMemoryGB < 2) {
        // Very low memory: minimum viable cache
        videoCacheSizeMB = 128;  // Reduced from 256
        dynamicSettings.offthreadVideoCacheSizeInBytes = 128 * 1024 * 1024;
      } else if (effectiveMemoryGB < 4) {
        // Low-medium memory: conservative cache
        videoCacheSizeMB = 256;  // Reduced from 512
        dynamicSettings.offthreadVideoCacheSizeInBytes = 256 * 1024 * 1024;
      } else if (effectiveMemoryGB < 8) {
        // Medium memory: moderate cache
        videoCacheSizeMB = 512;  // Reduced from 1024
        dynamicSettings.offthreadVideoCacheSizeInBytes = 512 * 1024 * 1024;
      } else {
        // High memory: still conservative cache
        videoCacheSizeMB = 1024;  // Reduced from 2048
        dynamicSettings.offthreadVideoCacheSizeInBytes = 1024 * 1024 * 1024;
      }

      console.log(`[Export] Video cache: ${videoCacheSizeMB}MB (effective memory: ${effectiveMemoryGB.toFixed(2)}GB, available: ${reportedAvailableGB.toFixed(2)}GB, total: ${totalMemoryGB.toFixed(1)}GB)`);

      console.log('Export settings:', {
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        concurrency: dynamicSettings.concurrency
      });

      // Get bundled location (cached or new)
      const bundleLocation = await getBundleLocation();

      // Select composition in main process to avoid OOM in worker
      const { selectComposition } = await import('@remotion/renderer');

      // IMPORTANT: Extract ALL clips from segments BEFORE selectComposition
      // This ensures calculateMetadata receives all clips to compute correct duration
      const allClipsForSelection: any[] = [];
      const seenClipIdsForSelection = new Set<string>();

      if (segments) {
        for (const segment of segments) {
          if (segment.clips) {
            for (const clipData of segment.clips) {
              if (clipData.clip && !seenClipIdsForSelection.has(clipData.clip.id)) {
                allClipsForSelection.push(clipData.clip);
                seenClipIdsForSelection.add(clipData.clip.id);
              }
            }
          }
        }
      }
      allClipsForSelection.sort((a, b) => a.startTime - b.startTime);

      // Fallback to single dummy clip if no clips found
      const clipsForComposition = allClipsForSelection.length > 0
        ? allClipsForSelection
        : [{ startTime: 0, duration: 30000 }];

      const minimalProps = {
        clips: clipsForComposition, // FIX: Pass ALL clips for correct duration calculation
        recordings: [],
        effects: [],
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        fps: settings.framerate || 30,
        ...settings
      };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'TimelineComposition',
        inputProps: minimalProps
      });

      // Duration is calculated from clips in TimelineComposition's calculateMetadata
      // Use the composition's calculated duration
      let totalDurationInFrames = composition.durationInFrames;

      console.log(`[Export] Composition selected: ${clipsForComposition.length} clips, ${totalDurationInFrames} frames (${(totalDurationInFrames / composition.fps).toFixed(1)}s)`);

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

          // CRITICAL: Always use HTTP server for export - file:// URLs blocked by Chromium security
          // The video-http-server provides secure token-based streaming that works in all contexts
          const videoUrl = await makeVideoSrc(normalizedPath, 'export');
          videoUrls[recordingId] = videoUrl;
        }
      }

      // Prepare composition props for TimelineComposition
      // Extract all unique clips from segments and sort by startTime
      const allClips: any[] = [];
      const seenClipIds = new Set<string>();

      if (segments) {
        for (const segment of segments) {
          if (segment.clips) {
            for (const clipData of segment.clips) {
              if (clipData.clip && !seenClipIds.has(clipData.clip.id)) {
                allClips.push(clipData.clip);
                seenClipIds.add(clipData.clip.id);
              }
            }
          }
        }
      }

      // Sort clips by start time
      allClips.sort((a, b) => a.startTime - b.startTime);

      // Convert metadata to Map if needed
      const metadataMap = metadata instanceof Map ? metadata : new Map(metadata);

      // Collect all effects from all segments (they're in source space)
      const allEffects: any[] = [];
      if (segments) {
        for (const segment of segments) {
          if (segment.effects) {
            allEffects.push(...segment.effects);
          }
        }
      }

      // Build TimelineComposition props
      // Note: recordings comes from IPC as array of entries [[id, rec], ...]
      // We need to extract just the recording objects
      const inputProps = {
        clips: allClips,
        recordings: Array.from(new Map(recordings).values()),
        effects: allEffects,
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        fps: settings.framerate || 30,
        // Include for compatibility/debugging if needed
        metadata: Object.fromEntries(metadata),
        videoUrls,
        ...settings,
        projectFolder,
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

      // Estimate video size for smart chunking
      const durationSeconds = totalDurationInFrames / (compositionMetadata.fps || 30);
      const videoSizeEstimateGB = durationSeconds * 0.05; // Rough estimate: 50MB per minute

      // STABILITY FIX: Prefer single-pass rendering for most videos to avoid memory issues
      // Parallel rendering causes browser crashes due to multiple Chromium instances competing for memory
      let optimalChunkSize: number;
      if (durationSeconds < 300) {
        // Videos under 5 minutes: single pass, no chunking
        // This avoids the "Target closed" errors from parallel browser instances
        optimalChunkSize = totalDurationInFrames;
        console.log(`Video (${durationSeconds.toFixed(1)}s) < 5min, using single-pass rendering for stability`);
      } else if (durationSeconds < 600) {
        // Medium video (5-10 min): use 2 large chunks
        optimalChunkSize = Math.ceil(totalDurationInFrames / 2);
        console.log(`Medium video detected (${durationSeconds.toFixed(1)}s), using 2-chunk rendering`);
      } else {
        // Large video (>10 min): use larger chunks to minimize overhead
        optimalChunkSize = Math.ceil(totalDurationInFrames / 3);
        console.log(`Large video detected (${durationSeconds.toFixed(1)}s), using 3-chunk rendering`);
      }

      const chunkPlan = buildChunkPlan(
        totalDurationInFrames,
        optimalChunkSize,
        compositionMetadata.fps || settings.framerate || 30
      );

      const recommendedWorkers = determineParallelWorkerCount(machineProfile, chunkPlan.length, videoSizeEstimateGB);

      // STABILITY FIX: Calculate worker/concurrency based on actual memory requirements
      // Each Chromium browser tab needs ~400MB of memory
      // Total tabs = workers × concurrency
      // We want total browser memory < 50% of effective memory to leave room for:
      // - Video cache (already allocated separately)
      // - Node.js heap
      // - OS overhead
      const browserMemoryMB = 400; // Conservative estimate per Chromium tab
      const memoryForBrowsersMB = effectiveMemoryGB * 1024 * 0.4; // Use 40% of effective memory for browsers
      const maxTotalTabs = Math.max(2, Math.floor(memoryForBrowsersMB / browserMemoryMB));

      // Distribute tabs between workers and concurrency
      // Prefer fewer workers with higher concurrency (less IPC overhead)
      let adjustedConcurrency: number;
      let maxWorkersForVideo: number;

      if (maxTotalTabs <= 2) {
        // Very constrained: single worker, minimal concurrency
        maxWorkersForVideo = 1;
        adjustedConcurrency = 2;
      } else if (maxTotalTabs <= 4) {
        // Constrained: single worker, moderate concurrency
        maxWorkersForVideo = 1;
        adjustedConcurrency = Math.min(4, maxTotalTabs);
      } else if (maxTotalTabs <= 8) {
        // Moderate: allow 2 workers
        maxWorkersForVideo = 2;
        adjustedConcurrency = Math.min(4, Math.floor(maxTotalTabs / 2));
      } else {
        // High capacity: scale with CPU but cap at reasonable limits
        adjustedConcurrency = Math.min(4, Math.floor(maxTotalTabs / 2));
        maxWorkersForVideo = Math.min(2, Math.floor(maxTotalTabs / adjustedConcurrency));
      }

      // Never exceed recommended workers or chunk count
      const workerCount = Math.min(recommendedWorkers, maxWorkersForVideo, Math.max(1, chunkPlan.length || 1));
      const useParallel = workerCount > 1;

      console.log(`[Export] Memory-based capacity: ${maxTotalTabs} max tabs (${memoryForBrowsersMB.toFixed(0)}MB / ${browserMemoryMB}MB per tab)`);
      console.log(`[Export] Worker decision: ${workerCount} workers × ${adjustedConcurrency} tabs = ${workerCount * adjustedConcurrency} total (duration: ${durationSeconds.toFixed(1)}s, memory: ${effectiveMemoryGB.toFixed(1)}GB, chunks: ${chunkPlan.length})`);

      console.log('[Export] Chunk plan metrics', {
        totalFrames: totalDurationInFrames,
        chunkCount: chunkPlan.length,
        chunkSize: optimalChunkSize,
        recommendedWorkers,
        workerCount,
        availableMemoryGB: machineProfile.availableMemoryGB,
        totalMemoryGB: machineProfile.totalMemoryGB,
        cpuCores: machineProfile.cpuCores
      });

      // MainComposition renders the full clip with all metadata
      // Pass complete metadata to all chunks (no filtering needed)
      const preFilteredMetadata = new Map<number, Map<string, any>>();

      for (const chunk of chunkPlan) {
        preFilteredMetadata.set(chunk.index, metadataMap);
      }

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
        concurrency: adjustedConcurrency,
        ffmpegPath,
        compositorDir,
        chunkSizeFrames: optimalChunkSize,
        preFilteredMetadata, // Pass pre-filtered metadata
        totalFrames: totalDurationInFrames,
        totalChunks: chunkPlan.length
      };

      const webContents = event.sender;

      const chunkProgress = new Map<number, { rendered: number; total: number }>();
      const totalFrameCount = Math.max(1, commonJob.totalFrames || totalDurationInFrames || 0);
      let lastForwardedProgress = 0;
      const fpsForTimeout = compositionMetadata?.fps ?? settings.framerate ?? 30;
      const workerTimeoutMs = computeWorkerTimeoutMs(totalDurationInFrames, fpsForTimeout, chunkPlan.length, workerCount);
      console.log('[Export] Worker timeout configuration', {
        minutes: Number((workerTimeoutMs / 60000).toFixed(1)),
        totalFrames: totalDurationInFrames,
        fps: fpsForTimeout,
        chunkCount: chunkPlan.length,
        workerCount
      });

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

      const availableMemoryGB = machineProfile.availableMemoryGB ?? effectiveMemoryGB;
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
          return await worker.request('export', job, workerTimeoutMs);
        } finally {
          detach();
        }
      };

      const runSequentialExport = async () => {
        const worker = await ensurePrimaryWorker();
        const jobWithMetadata = {
          ...commonJob,
          preFilteredMetadata // Pass pre-filtered metadata for sequential export too
        };
        return executeWorkerRequest(worker, jobWithMetadata);
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
            // Convert pre-filtered metadata to plain object for IPC serialization
            const workerPreFilteredMetadata: Record<number, Record<string, any>> = {};
            for (const chunk of group) {
              const chunkMetadata = preFilteredMetadata.get(chunk.index);
              if (chunkMetadata) {
                // Convert Map to plain object
                workerPreFilteredMetadata[chunk.index] = Object.fromEntries(chunkMetadata);
              }
            }

            const job = {
              ...commonJob,
              outputPath: path.join(app.getPath('temp'), `export-worker-${Date.now()}-${index}.mp4`),
              assignedChunks: group,
              combineChunksInWorker: false,
              preFilteredMetadata: workerPreFilteredMetadata
            };

            const result = await worker.request('export', job, workerTimeoutMs);
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

          // Set DYLD_LIBRARY_PATH for FFmpeg dynamic libraries
          const ffmpegDir = path.dirname(ffmpegPath);
          const env = {
            ...process.env,
            DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
          };

          await new Promise<void>((resolve, reject) => {
            const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { env });
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
            await fs.unlink(chunkPath).catch(() => { });
          }

          for (const [name] of workerRefs) {
            await workerPool.destroyWorker(name).catch(() => { });
          }
        }
      };

      const result = useParallel ? await runParallelExport() : await runSequentialExport();

      if (result.success) {
        // Handle file response
        const stats = await fs.stat(outputPath);
        const fileSize = stats.size;

        if (fileSize < 50 * 1024 * 1024) {
          const buffer = await fs.readFile(outputPath);
          const base64 = buffer.toString('base64');
          await fs.unlink(outputPath).catch(() => { });
          return { success: true, data: base64, isStream: false };
        }

        return {
          success: true,
          filePath: outputPath,
          fileSize,
          isStream: true
        };
      } else {
        await fs.unlink(outputPath).catch(() => { });
        return {
          success: false,
          error: result.error || 'Export failed'
        };
      }

    } catch (error) {
      console.error('Export failed:', error);

      // STABILITY FIX: Properly clean up resources on export failure
      // This prevents memory from staying allocated after a failed export
      try {
        // Destroy all parallel export workers
        const workerNames = ['export', 'export-par-0', 'export-par-1', 'export-par-2', 'export-par-3'];
        for (const name of workerNames) {
          await workerPool.destroyWorker(name).catch(() => {});
        }

        // Clear the primary export worker reference
        if (exportWorker) {
          try {
            exportWorker.send('cancel', {});
          } catch {
            // Ignore send errors on cleanup
          }
          exportWorker = null;
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        console.log('[Export] Cleanup completed after failure');
      } catch (cleanupError) {
        console.error('[Export] Cleanup error:', cleanupError);
      }

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

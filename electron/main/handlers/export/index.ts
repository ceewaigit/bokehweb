/**
 * Export handler - Main orchestrator
 * Registers IPC handlers and coordinates export operations
 */

import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'

import { machineProfiler } from '../../utils/machine-profiler'
import { makeVideoSrc } from '../../utils/video-url-factory'
import { getVideoServer } from '../../video-http-server'
import { getRecordingsDirectory } from '../../config'
import { resolveFfmpegPath, getCompositorDirectory } from '../../utils/ffmpeg-resolver'
import { normalizeCrossPlatform } from '../../utils/path-normalizer'

import { getBundleLocation, cleanupBundleCache } from './bundle-manager'
import { buildChunkPlan, calculateStableChunkSize, estimateVideoSizeGB } from './chunk-planner'
import { determineParallelWorkerCount, calculateWorkerAllocation } from './worker-allocator'
import { ProgressTracker } from './progress-tracker'
import {
  runSequentialExport,
  runParallelExport,
  cleanupExportResources,
  cancelExport,
  getWorkerPath
} from './worker-coordinator'

import type { ExportJobConfig, CompositionMetadata } from './types'

// Re-export cleanup function for app lifecycle
export { cleanupBundleCache }

/**
 * Calculate effective memory for export operations
 * macOS frequently reports low "available" memory even when plenty is free
 */
function calculateEffectiveMemory(
  totalMemoryGB: number,
  reportedAvailableGB: number
): number {
  const baselineFromTotal = totalMemoryGB * 0.4 // Keep ~60% reserved for system
  const minimumOperationalGB = 2
  const effectiveMemoryGB = Math.min(
    totalMemoryGB,
    Math.max(reportedAvailableGB, baselineFromTotal, minimumOperationalGB)
  )

  if (effectiveMemoryGB - reportedAvailableGB > 0.5) {
    console.log('[Export] Adjusted effective memory up from low OS reading', {
      reportedAvailableGB: reportedAvailableGB.toFixed(2),
      derivedBaselineGB: baselineFromTotal.toFixed(2),
      effectiveMemoryGB: effectiveMemoryGB.toFixed(2)
    })
  }

  return effectiveMemoryGB
}

/**
 * Calculate video cache size based on available memory
 */
function calculateVideoCacheSize(effectiveMemoryGB: number): number {
  // STABILITY FIX: Use conservative video cache to prevent memory exhaustion
  if (effectiveMemoryGB < 2) {
    return 128 * 1024 * 1024
  } else if (effectiveMemoryGB < 4) {
    return 256 * 1024 * 1024
  } else if (effectiveMemoryGB < 8) {
    return 512 * 1024 * 1024
  } else {
    return 1024 * 1024 * 1024
  }
}

/**
 * Resolve video paths and create HTTP URLs for export
 */
async function resolveVideoUrls(
  recordings: Array<[string, any]>,
  projectFolder: string | undefined,
  recordingsDir: string
): Promise<Record<string, string>> {
  const videoUrls: Record<string, string> = {}
  const normalizedRecordingsDir = normalizeCrossPlatform(recordingsDir)

  for (const [recordingId, recording] of recordings) {
    if (recording.filePath) {
      let fullPath = normalizeCrossPlatform(recording.filePath)

      if (!path.isAbsolute(fullPath)) {
        const candidates = new Set<string>()
        const fileName = path.basename(fullPath)

        if (recording.folderPath) {
          const normalizedFolder = normalizeCrossPlatform(recording.folderPath)
          candidates.add(path.join(normalizedFolder, fileName))

          const folderParent = path.dirname(normalizedFolder)
          if (folderParent && folderParent !== normalizedFolder) {
            candidates.add(path.join(folderParent, fullPath))
            candidates.add(path.join(folderParent, fileName))
          }
        }

        if (projectFolder) {
          const normalizedProject = normalizeCrossPlatform(projectFolder)
          candidates.add(path.join(normalizedProject, fullPath))
          candidates.add(path.join(normalizedProject, fileName))
        }

        candidates.add(path.join(normalizedRecordingsDir, fullPath))
        candidates.add(path.join(normalizedRecordingsDir, fileName))

        for (const candidate of candidates) {
          if (fsSync.existsSync(candidate)) {
            fullPath = candidate
            break
          }
        }
      }

      const normalizedPath = path.resolve(fullPath)
      // CRITICAL: Always use HTTP server for export - file:// URLs blocked by Chromium security
      const videoUrl = await makeVideoSrc(normalizedPath, 'export')
      videoUrls[recordingId] = videoUrl
    }
  }

  return videoUrls
}

/**
 * Extract all clips from segments
 */
function extractClipsFromSegments(segments: any[]): any[] {
  const allClips: any[] = []
  const seenClipIds = new Set<string>()

  if (segments) {
    for (const segment of segments) {
      if (segment.clips) {
        for (const clipData of segment.clips) {
          if (clipData.clip && !seenClipIds.has(clipData.clip.id)) {
            allClips.push(clipData.clip)
            seenClipIds.add(clipData.clip.id)
          }
        }
      }
    }
  }

  return allClips.sort((a, b) => a.startTime - b.startTime)
}

/**
 * Collect all effects from segments
 */
function extractEffectsFromSegments(segments: any[]): any[] {
  const allEffects: any[] = []
  if (segments) {
    for (const segment of segments) {
      if (segment.effects) {
        allEffects.push(...segment.effects)
      }
    }
  }
  return allEffects
}

/**
 * Setup export IPC handlers
 */
export function setupExportHandler(): void {
  console.log('[Export] Setting up export handler with supervised worker')

  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings, projectFolder }) => {
    console.log('[Export] Export handler invoked with settings:', settings)

    try {
      // Profile the machine
      const videoWidth = settings.resolution?.width || 1920
      const videoHeight = settings.resolution?.height || 1080

      const machineProfile = await machineProfiler.profileSystem(videoWidth, videoHeight)
      console.log('[Export] Machine profile:', {
        cpuCores: machineProfile.cpuCores,
        memoryGB: machineProfile.totalMemoryGB.toFixed(1),
        gpuAvailable: machineProfile.gpuAvailable
      })

      // Get export settings
      const targetQuality = settings.quality === 'ultra' ? 'quality' :
        settings.quality === 'low' ? 'fast' : 'balanced'
      const dynamicSettings = machineProfiler.getDynamicExportSettings(
        machineProfile,
        videoWidth,
        videoHeight,
        targetQuality
      )

      // Calculate effective memory
      const totalMemoryGB = machineProfile.totalMemoryGB || 16
      const reportedAvailableGB = machineProfile.availableMemoryGB ?? 0
      const effectiveMemoryGB = calculateEffectiveMemory(totalMemoryGB, reportedAvailableGB)

      // Calculate video cache size
      const videoCacheSizeBytes = calculateVideoCacheSize(effectiveMemoryGB)
      dynamicSettings.offthreadVideoCacheSizeInBytes = videoCacheSizeBytes

      console.log(`[Export] Video cache: ${videoCacheSizeBytes / (1024 * 1024)}MB (effective memory: ${effectiveMemoryGB.toFixed(2)}GB)`)

      console.log('[Export] Export settings:', {
        jpegQuality: dynamicSettings.jpegQuality,
        videoBitrate: dynamicSettings.videoBitrate,
        x264Preset: dynamicSettings.x264Preset,
        useGPU: dynamicSettings.useGPU,
        concurrency: dynamicSettings.concurrency
      })

      // Get bundled location (cached or new)
      const bundleLocation = await getBundleLocation()

      // Select composition in main process to avoid OOM in worker
      const { selectComposition } = await import('@remotion/renderer')

      // Extract clips for composition selection
      const clipsForSelection = extractClipsFromSegments(segments)
      const clipsForComposition = clipsForSelection.length > 0
        ? clipsForSelection
        : [{ startTime: 0, duration: 30000 }]

      const minimalProps = {
        clips: clipsForComposition,
        recordings: [],
        effects: [],
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        fps: settings.framerate || 30,
        ...settings
      }

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'TimelineComposition',
        inputProps: minimalProps
      })

      const totalDurationInFrames = composition.durationInFrames
      console.log(`[Export] Composition selected: ${clipsForComposition.length} clips, ${totalDurationInFrames} frames`)

      const compositionMetadata: CompositionMetadata = {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationInFrames: totalDurationInFrames,
        id: composition.id,
        defaultProps: composition.defaultProps
      }

      // Start video server
      await getVideoServer()

      // Resolve video URLs
      const recordingsDir = getRecordingsDirectory()
      const videoUrls = await resolveVideoUrls(recordings, projectFolder, recordingsDir)

      // Extract clips and effects
      const allClips = extractClipsFromSegments(segments)
      const allEffects = extractEffectsFromSegments(segments)

      // Log metadata sizes for debugging memory issues
      for (const [recordingId, recording] of recordings) {
        const meta = recording.metadata
        if (meta) {
          console.log(`[Export] Recording ${recordingId} metadata:`, {
            mouseEvents: meta.mouseEvents?.length || 0,
            clickEvents: meta.clickEvents?.length || 0,
            keyboardEvents: meta.keyboardEvents?.length || 0,
            scrollEvents: meta.scrollEvents?.length || 0
          })
        }
      }

      // Build input props
      const inputProps = {
        clips: allClips,
        recordings: Array.from(new Map(recordings).values()),
        effects: allEffects,
        videoWidth: settings.resolution?.width || 1920,
        videoHeight: settings.resolution?.height || 1080,
        fps: settings.framerate || 30,
        metadata: Object.fromEntries(metadata),
        videoUrls,
        ...settings,
        projectFolder
      }

      // Create output path
      const outputPath = path.join(
        app.getPath('temp'),
        `export-${Date.now()}.${settings.format || 'mp4'}`
      )
      await fs.mkdir(path.dirname(outputPath), { recursive: true })

      // Calculate chunk plan
      const durationSeconds = totalDurationInFrames / (compositionMetadata.fps || 30)
      const videoSizeEstimateGB = estimateVideoSizeGB(durationSeconds)
      const optimalChunkSize = calculateStableChunkSize(totalDurationInFrames, durationSeconds)
      const chunkPlan = buildChunkPlan(
        totalDurationInFrames,
        optimalChunkSize,
        compositionMetadata.fps || settings.framerate || 30
      )

      // Calculate worker allocation
      const recommendedWorkers = determineParallelWorkerCount(machineProfile, chunkPlan.length, videoSizeEstimateGB)
      const allocation = calculateWorkerAllocation(
        machineProfile,
        effectiveMemoryGB,
        chunkPlan.length,
        recommendedWorkers,
        totalDurationInFrames,
        compositionMetadata.fps || 30
      )

      console.log('[Export] Chunk plan metrics', {
        totalFrames: totalDurationInFrames,
        chunkCount: chunkPlan.length,
        chunkSize: optimalChunkSize,
        workerCount: allocation.workerCount,
        concurrency: allocation.concurrency
      })

      // Build pre-filtered metadata
      const metadataMap = metadata instanceof Map ? metadata : new Map(metadata)
      const preFilteredMetadata = new Map<number, Map<string, any>>()
      for (const chunk of chunkPlan) {
        preFilteredMetadata.set(chunk.index, metadataMap)
      }

      // Resolve paths
      const ffmpegPath = resolveFfmpegPath()
      const compositorDir = getCompositorDirectory()
      const workerPath = getWorkerPath()

      if (!fsSync.existsSync(workerPath)) {
        throw new Error(`Export worker not found at ${workerPath}`)
      }

      // Build common job config
      const commonJob: ExportJobConfig = {
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
        concurrency: allocation.concurrency,
        ffmpegPath,
        compositorDir,
        chunkSizeFrames: optimalChunkSize,
        preFilteredMetadata,
        totalFrames: totalDurationInFrames,
        totalChunks: chunkPlan.length
      }

      // Create progress tracker
      const progressTracker = new ProgressTracker(event.sender, totalDurationInFrames)

      // Execute export
      const primaryWorkerMemoryMB = Math.min(4096, Math.floor((effectiveMemoryGB || 2) * 1024 / 4))

      const result = allocation.useParallel
        ? await runParallelExport(
          commonJob,
          chunkPlan,
          allocation.workerCount,
          workerPath,
          machineProfile,
          allocation.timeoutMs,
          progressTracker,
          ffmpegPath,
          outputPath,
          preFilteredMetadata
        )
        : await runSequentialExport(
          commonJob,
          workerPath,
          primaryWorkerMemoryMB,
          allocation.timeoutMs,
          progressTracker
        )

      if (result.success) {
        // Handle file response
        const stats = await fs.stat(outputPath)
        const fileSize = stats.size

        if (fileSize < 50 * 1024 * 1024) {
          const buffer = await fs.readFile(outputPath)
          const base64 = buffer.toString('base64')
          await fs.unlink(outputPath).catch(() => { })
          return { success: true, data: base64, isStream: false }
        }

        return {
          success: true,
          filePath: outputPath,
          fileSize,
          isStream: true
        }
      } else {
        await fs.unlink(outputPath).catch(() => { })
        return {
          success: false,
          error: result.error || 'Export failed'
        }
      }

    } catch (error) {
      console.error('[Export] Export failed:', error)

      // Clean up resources on failure
      await cleanupExportResources()

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed'
      }
    }
  })

  // Handle export cancellation
  ipcMain.handle('export-cancel', async () => {
    return cancelExport()
  })

  // Handle stream requests for large files
  ipcMain.handle('export-stream-chunk', async (_event, { filePath, offset, length }) => {
    try {
      const buffer = Buffer.alloc(length)
      const fd = await fs.open(filePath, 'r')
      await fd.read(buffer, 0, length, offset)
      await fd.close()
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream failed'
      }
    }
  })

  // Clean up streamed file
  ipcMain.handle('export-cleanup', async (_event, { filePath }) => {
    try {
      await fs.unlink(filePath)
      return { success: true }
    } catch (error) {
      return { success: false }
    }
  })
}

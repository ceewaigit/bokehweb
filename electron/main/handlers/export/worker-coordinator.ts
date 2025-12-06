/**
 * Export worker coordination
 * Manages worker lifecycle and parallel execution
 */

import path from 'path'
import { app } from 'electron'
import type { MachineProfile } from '../../utils/machine-profiler'
import { workerPool, SupervisedWorker } from '../../utils/worker-manager'
import type { ExportJobConfig, ChunkPlanEntry, ChunkResult } from './types'
import { ProgressTracker } from './progress-tracker'
import { combineChunks, cleanupChunks } from './ffmpeg-combiner'
import { computePerWorkerMemoryMB } from './worker-allocator'

// Singleton export worker reference
let exportWorker: SupervisedWorker | null = null

/**
 * Get the export worker path
 */
export function getWorkerPath(): string {
  // Worker is at electron/dist/main/export-worker.js
  // This file is at electron/dist/main/handlers/export/worker-coordinator.js
  // So we need to go up two levels (export -> handlers -> main)
  return path.join(__dirname, '..', '..', 'export-worker.js')
}

/**
 * Ensure the primary export worker exists
 * @param memoryMB - Memory allocation for the worker
 * @param workerPath - Path to worker script
 * @returns The export worker instance
 */
export async function ensurePrimaryWorker(
  memoryMB: number,
  workerPath: string
): Promise<SupervisedWorker> {
  if (!exportWorker) {
    exportWorker = await workerPool.createWorker('export', workerPath, {
      serviceName: 'Export Worker',
      maxMemory: memoryMB,
      enableHeartbeat: true,
      maxRestarts: 2
    })
  }
  return exportWorker
}

/**
 * Execute a worker request with progress tracking
 * @param worker - The worker to execute on
 * @param job - Job configuration
 * @param timeoutMs - Request timeout
 * @param progressTracker - Progress tracker instance
 * @returns Worker result
 */
export async function executeWorkerRequest(
  worker: SupervisedWorker,
  job: ExportJobConfig,
  timeoutMs: number,
  progressTracker: ProgressTracker
): Promise<any> {
  const detach = progressTracker.attachToWorker(worker)
  try {
    return await worker.request('export', job, timeoutMs)
  } finally {
    detach()
  }
}

/**
 * Run sequential (single-worker) export
 */
export async function runSequentialExport(
  job: ExportJobConfig,
  workerPath: string,
  memoryMB: number,
  timeoutMs: number,
  progressTracker: ProgressTracker
): Promise<{ success: boolean; error?: string }> {
  const worker = await ensurePrimaryWorker(memoryMB, workerPath)
  return executeWorkerRequest(worker, job, timeoutMs, progressTracker)
}

/**
 * Run parallel (multi-worker) export
 */
export async function runParallelExport(
  commonJob: ExportJobConfig,
  chunkPlan: ChunkPlanEntry[],
  workerCount: number,
  workerPath: string,
  machineProfile: MachineProfile,
  timeoutMs: number,
  progressTracker: ProgressTracker,
  ffmpegPath: string,
  outputPath: string,
  preFilteredMetadata: Map<number, Map<string, any>>
): Promise<{ success: boolean; error?: string }> {
  const workerRefs = new Map<string, SupervisedWorker>()
  const chunkGroups: ChunkPlanEntry[][] = []

  if (chunkPlan.length === 0) {
    return { success: true }
  }

  // Distribute chunks among workers
  const chunksPerWorker = Math.ceil(chunkPlan.length / workerCount)
  for (let i = 0; i < workerCount; i++) {
    const start = i * chunksPerWorker
    const subset = chunkPlan.slice(start, start + chunksPerWorker)
    if (subset.length > 0) {
      chunkGroups.push(subset)
    }
  }

  const actualWorkerCount = chunkGroups.length
  const perWorkerMemoryMB = computePerWorkerMemoryMB(machineProfile, actualWorkerCount || 1)

  console.log('[Export] Parallel plan', {
    workerCount: actualWorkerCount,
    perWorkerMemoryMB,
    chunksPerWorker,
    totalChunks: chunkPlan.length
  })

  const pendingChunkPaths: string[] = []

  const getOrCreateWorker = async (name: string): Promise<SupervisedWorker> => {
    let worker = workerPool.getWorker(name)
    if (!worker) {
      worker = await workerPool.createWorker(name, workerPath, {
        serviceName: `Export Worker ${name}`,
        maxMemory: perWorkerMemoryMB,
        enableHeartbeat: true,
        maxRestarts: 1
      })
    }
    workerRefs.set(name, worker)
    return worker
  }

  // Create worker promises
  const workerPromises = chunkGroups.map((group, index) => (async () => {
    const workerName = `export-par-${index}`
    const worker = await getOrCreateWorker(workerName)
    const detach = progressTracker.attachToWorker(worker)

    try {
      // Convert pre-filtered metadata to plain object for IPC serialization
      const workerPreFilteredMetadata: Record<number, Record<string, any>> = {}
      for (const chunk of group) {
        const chunkMetadata = preFilteredMetadata.get(chunk.index)
        if (chunkMetadata) {
          workerPreFilteredMetadata[chunk.index] = Object.fromEntries(chunkMetadata)
        }
      }

      const job = {
        ...commonJob,
        outputPath: path.join(app.getPath('temp'), `export-worker-${Date.now()}-${index}.mp4`),
        assignedChunks: group,
        combineChunksInWorker: false,
        preFilteredMetadata: workerPreFilteredMetadata
      }

      const result = await worker.request('export', job, timeoutMs)
      if (!result.success) {
        throw new Error(result.error || `Worker ${workerName} failed to export`)
      }

      const chunkResults: Array<{ index: number; path: string }> = (result.chunkResults || [])
        .map((entry: any) => ({ index: entry.index as number, path: entry.path as string }))
        .sort((a: { index: number; path: string }, b: { index: number; path: string }) => a.index - b.index)

      pendingChunkPaths.push(...chunkResults.map((entry) => entry.path))
      return chunkResults
    } finally {
      detach()
    }
  })())

  let chunkResultLists: Array<Array<{ index: number; path: string }>>

  try {
    chunkResultLists = await Promise.all(workerPromises)
  } catch (error) {
    // Cancel all workers on failure
    for (const worker of workerRefs.values()) {
      try {
        worker.send('cancel', {})
      } catch {
        // Ignore cancel errors
      }
    }
    throw error
  }

  const combinedChunkResults = chunkResultLists
    .flat()
    .sort((a, b) => a.index - b.index)

  if (combinedChunkResults.length === 0) {
    throw new Error('No chunks were rendered during export')
  }

  // Notify progress about combining phase
  progressTracker.sendProgress(90, 'finalizing', 'Combining video chunks...')

  try {
    // Combine chunks using FFmpeg
    await combineChunks(combinedChunkResults, outputPath, ffmpegPath)

    progressTracker.sendProgress(95, 'finalizing', 'Finalizing video...')

    return { success: true }
  } finally {
    // Clean up chunk files
    await cleanupChunks(pendingChunkPaths)

    // Destroy parallel workers
    for (const [name] of workerRefs) {
      await workerPool.destroyWorker(name).catch(() => { })
    }
  }
}

/**
 * Clean up export resources after failure
 */
export async function cleanupExportResources(): Promise<void> {
  try {
    // Destroy all parallel export workers
    const workerNames = ['export', 'export-par-0', 'export-par-1', 'export-par-2', 'export-par-3']
    for (const name of workerNames) {
      await workerPool.destroyWorker(name).catch(() => { })
    }

    // Clear the primary export worker reference
    if (exportWorker) {
      try {
        exportWorker.send('cancel', {})
      } catch {
        // Ignore send errors on cleanup
      }
      exportWorker = null
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    console.log('[Export] Cleanup completed')
  } catch (cleanupError) {
    console.error('[Export] Cleanup error:', cleanupError)
  }
}

/**
 * Cancel current export operation
 */
export async function cancelExport(): Promise<{ success: boolean }> {
  try {
    if (exportWorker) {
      await exportWorker.send('cancel', {})
    }
    return { success: true }
  } catch (error) {
    console.error('Error canceling export:', error)
    return { success: false }
  }
}

/**
 * Get the current export worker reference
 */
export function getExportWorker(): SupervisedWorker | null {
  return exportWorker
}

/**
 * Clear the export worker reference
 */
export function clearExportWorker(): void {
  exportWorker = null
}

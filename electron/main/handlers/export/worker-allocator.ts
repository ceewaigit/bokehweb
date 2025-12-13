/**
 * Worker allocation and resource management
 * Determines optimal worker count and memory allocation for parallel export
 */

import type { MachineProfile } from '../../utils/machine-profiler'
import type { WorkerAllocation } from './types'

/**
 * Determine the optimal number of parallel workers
 * @param profile - Machine profile with CPU and memory info
 * @param chunkCount - Number of chunks to process
 * @param videoSizeEstimateGB - Estimated video size in GB
 * @returns Recommended worker count
 */
export function determineParallelWorkerCount(
  profile: MachineProfile,
  chunkCount: number,
  videoSizeEstimateGB: number = 0
): number {
  if (chunkCount <= 1) {
    return 1
  }

  const cpuCores = Math.max(1, profile.cpuCores || 1)
  const availableMemoryGB = profile.availableMemoryGB ?? 0
  const totalMem = profile.totalMemoryGB || 4

  // CRITICAL: If available memory is very low, limit workers severely
  if (availableMemoryGB < 1) {
    // With < 1GB available, use at most 2 workers to prevent thrashing
    return Math.min(2, chunkCount)
  }

  // Smart allocation based on video size
  if (videoSizeEstimateGB < 0.5) {
    // Small video: single worker is fine
    return 1
  } else if (videoSizeEstimateGB < 2) {
    // Medium video: 2-3 workers
    return Math.min(3, chunkCount, cpuCores - 1)
  }

  const effectiveMemory = Math.max(availableMemoryGB, totalMem * 0.4)

  // MORE AGGRESSIVE: Use 80% of CPU cores instead of 50%
  let idealWorkers = Math.floor(cpuCores * 0.8)

  // Memory constraint: Each worker needs ~500MB-1GB
  const memoryBasedWorkers = Math.floor(effectiveMemory)

  // Take the minimum of CPU-based and memory-based limits
  let maxWorkers = Math.min(idealWorkers, memoryBasedWorkers)

  // Ensure at least 2 workers if we have 4+ cores AND enough memory
  if (cpuCores >= 4 && availableMemoryGB >= 2) {
    maxWorkers = Math.max(maxWorkers, 2)
  }

  // Cap at chunk count (no point having more workers than chunks)
  maxWorkers = Math.min(maxWorkers, chunkCount)

  // Reasonable upper limit to prevent system overload (but less conservative)
  maxWorkers = Math.min(maxWorkers, Math.max(1, cpuCores - 1)) // Only leave 1 core for system

  return Math.max(1, maxWorkers)
}

/**
 * Compute memory allocation per worker
 * @param profile - Machine profile
 * @param workerCount - Number of workers
 * @returns Memory in MB per worker
 */
export function computePerWorkerMemoryMB(
  profile: MachineProfile,
  workerCount: number
): number {
  const totalGB = profile.totalMemoryGB || 4
  const availableGB = profile.availableMemoryGB ?? totalGB * 0.5
  const memoryBudget = Math.max(availableGB, totalGB * 0.4)
  const baseline = Math.floor((memoryBudget * 1024) / Math.max(1, workerCount * 3))
  return Math.max(512, Math.min(2048, baseline || 1024))
}

/**
 * Compute worker timeout based on video complexity
 * @param totalFrames - Total frames to render
 * @param fps - Frames per second
 * @param chunkCount - Number of chunks
 * @param workerCount - Number of workers
 * @returns Timeout in milliseconds
 */
export function computeWorkerTimeoutMs(
  totalFrames: number,
  fps: number | undefined,
  chunkCount: number,
  workerCount: number
): number {
  const safeFrames = Math.max(1, totalFrames || 1)
  const effectiveFps = Math.max(1, Math.floor(fps || 30))
  const baseSeconds = safeFrames / effectiveFps

  // Chunk pressure grows when we have to serialize large chunk batches through few workers.
  const chunkPressure = Math.max(1, chunkCount / Math.max(1, workerCount))
  const safetyMultiplier = Math.min(20, Math.max(8, chunkPressure * 4))
  const estimatedSeconds = baseSeconds * safetyMultiplier

  const minTimeoutMs = 15 * 60 * 1000 // never less than 15 minutes
  const maxTimeoutMs = 2 * 60 * 60 * 1000 // cap at 2 hours
  return Math.min(maxTimeoutMs, Math.max(minTimeoutMs, Math.round(estimatedSeconds * 1000)))
}

/**
 * Calculate complete worker allocation based on machine profile and export context
 * @param profile - Machine profile
 * @param effectiveMemoryGB - Effective available memory in GB
 * @param chunkCount - Number of chunks
 * @param recommendedWorkers - Pre-calculated recommended worker count
 * @param totalFrames - Total frames to render
 * @param fps - Frames per second
 * @returns Complete worker allocation configuration
 */
export function calculateWorkerAllocation(
  profile: MachineProfile,
  effectiveMemoryGB: number,
  chunkCount: number,
  recommendedWorkers: number,
  totalFrames: number,
  fps: number
): WorkerAllocation {
  const cpuCores = Math.max(1, profile.cpuCores || 1)
  const safeMemoryGB = Math.max(0.5, effectiveMemoryGB || 0.5)
  const safeFps = Math.max(1, fps || 30)
  const durationSeconds = Math.max(0, totalFrames / safeFps)

  const cpuBasedConcurrency = Math.max(1, Math.floor(cpuCores / 2))
  const memBasedConcurrency = Math.max(1, Math.floor(safeMemoryGB / 1.5))
  let concurrency = Math.max(1, Math.min(cpuBasedConcurrency, memBasedConcurrency, 6))

  if (safeMemoryGB < 2) {
    concurrency = 1
  } else if (safeMemoryGB < 3) {
    concurrency = Math.min(concurrency, 2)
  }

  // Real-time free memory is a better predictor of thrash than derived effective memory.
  // However, on macOS `os.freemem()` can be misleadingly low due to compressed/inactive memory,
  // so use the caller's effective memory estimate for throttling on darwin.
  const rawAvailableGB = profile.availableMemoryGB ?? 0
  const throttlingMemoryGB =
    process.platform === 'darwin'
      ? Math.max(rawAvailableGB, safeMemoryGB)
      : rawAvailableGB

  if (throttlingMemoryGB < 1) {
    concurrency = 1
  } else if (throttlingMemoryGB < 2) {
    concurrency = Math.min(concurrency, 2)
  } else if (throttlingMemoryGB < 3) {
    concurrency = Math.min(concurrency, 3)
  }

  // Allow higher concurrency for short exports to avoid needless slowness.
  if (durationSeconds < 60 && safeMemoryGB >= 3) {
    concurrency = Math.min(concurrency + 1, 6)
  }
  if (durationSeconds < 30 && cpuCores >= 8 && safeMemoryGB >= 4) {
    concurrency = Math.min(concurrency, 4)
  }

  const useParallel = chunkCount > 1 && recommendedWorkers > 1
  let workerCount = useParallel ? recommendedWorkers : 1

  // Cap parallel workers aggressively when raw available memory is low.
  if (useParallel) {
    if (throttlingMemoryGB < 2) {
      workerCount = Math.min(workerCount, 2)
    } else if (throttlingMemoryGB < 3) {
      workerCount = Math.min(workerCount, 3)
    } else {
      workerCount = Math.min(workerCount, 4)
    }
  }

  // When using multiple workers, keep tabs per worker modest.
  if (useParallel) {
    concurrency = Math.min(concurrency, 3)
  }

  const timeoutMs = computeWorkerTimeoutMs(totalFrames, fps, chunkCount, workerCount)
  const memoryPerWorkerMB = computePerWorkerMemoryMB(profile, workerCount)

  console.log('[Export] Allocation', {
    workerCount,
    concurrency,
    useParallel,
    durationSeconds: durationSeconds.toFixed(1),
    cpuCores,
    effectiveMemoryGB: safeMemoryGB.toFixed(2),
    chunkCount
  })

  return {
    workerCount,
    concurrency,
    useParallel,
    memoryPerWorkerMB,
    timeoutMs
  }
}

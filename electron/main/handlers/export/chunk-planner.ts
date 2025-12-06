/**
 * Export chunk planning
 * Determines optimal chunk sizes and builds chunk plans for parallel rendering
 */

import type { MachineProfile } from '../../utils/machine-profiler'
import type { ChunkPlanEntry } from './types'

/**
 * Determine optimal chunk size based on available memory
 * @param profile - Machine profile with memory info
 * @returns Optimal chunk size in frames
 */
export function getOptimalChunkSize(profile: MachineProfile): number {
  const availableGB = profile.availableMemoryGB || 2

  // Even with low memory, use larger chunks to reduce overhead
  // The bottleneck is worker count, not chunk size
  if (availableGB < 1) {
    return 1000 // Low memory: still use 1000 frames to reduce overhead
  } else if (availableGB < 4) {
    return 1500 // Medium memory
  } else if (availableGB < 8) {
    return 2000 // Good memory
  } else {
    return 2500 // High memory: larger chunks for best performance
  }
}

/**
 * Build a chunk plan for the given total frames
 * @param totalFrames - Total number of frames to render
 * @param chunkSize - Size of each chunk in frames
 * @param fps - Frames per second
 * @returns Array of chunk plan entries
 */
export function buildChunkPlan(
  totalFrames: number,
  chunkSize: number,
  fps: number
): ChunkPlanEntry[] {
  if (totalFrames <= 0) {
    return []
  }

  const numChunks = Math.ceil(totalFrames / chunkSize)
  const plan: ChunkPlanEntry[] = []

  for (let index = 0; index < numChunks; index++) {
    const startFrame = index * chunkSize
    const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1)
    const startTimeMs = (startFrame / fps) * 1000
    const endTimeMs = ((endFrame + 1) / fps) * 1000

    plan.push({
      index,
      startFrame,
      endFrame,
      startTimeMs,
      endTimeMs
    })
  }

  return plan
}

/**
 * Calculate chunk size based on video duration for stability
 * Prefers single-pass rendering for shorter videos to avoid memory issues
 * @param totalFrames - Total number of frames
 * @param durationSeconds - Video duration in seconds
 * @returns Optimal chunk size for the video
 */
export function calculateStableChunkSize(
  totalFrames: number,
  durationSeconds: number
): number {
  // STABILITY FIX: Prefer single-pass rendering for most videos to avoid memory issues
  // Parallel rendering causes browser crashes due to multiple Chromium instances competing for memory
  if (durationSeconds < 300) {
    // Videos under 5 minutes: single pass, no chunking
    // This avoids the "Target closed" errors from parallel browser instances
    console.log(`Video (${durationSeconds.toFixed(1)}s) < 5min, using single-pass rendering for stability`)
    return totalFrames
  } else if (durationSeconds < 600) {
    // Medium video (5-10 min): use 2 large chunks
    console.log(`Medium video detected (${durationSeconds.toFixed(1)}s), using 2-chunk rendering`)
    return Math.ceil(totalFrames / 2)
  } else {
    // Large video (>10 min): use larger chunks to minimize overhead
    console.log(`Large video detected (${durationSeconds.toFixed(1)}s), using 3-chunk rendering`)
    return Math.ceil(totalFrames / 3)
  }
}

/**
 * Calculate the video size estimate for smart chunking decisions
 * @param durationSeconds - Video duration in seconds
 * @returns Estimated video size in GB
 */
export function estimateVideoSizeGB(durationSeconds: number): number {
  // Rough estimate: 50MB per minute
  return durationSeconds * 0.05
}

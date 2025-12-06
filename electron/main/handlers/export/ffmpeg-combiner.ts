/**
 * FFmpeg video combination utilities
 * Handles concatenating chunk videos into final output
 */

import path from 'path'
import fs from 'fs/promises'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import type { ChunkResult } from './types'

/**
 * Escape file path for FFmpeg concat list
 * @param filePath - Path to escape
 * @returns Escaped path safe for concat list
 */
export function escapeForConcat(filePath: string): string {
  return filePath.replace(/'/g, "'\\''")
}

/**
 * Combine multiple video chunks into a single output file
 * @param chunkResults - Array of chunk results with paths
 * @param outputPath - Final output file path
 * @param ffmpegPath - Path to FFmpeg binary
 * @returns Promise resolving when combination is complete
 */
export async function combineChunks(
  chunkResults: Array<{ index: number; path: string }>,
  outputPath: string,
  ffmpegPath: string
): Promise<void> {
  if (chunkResults.length === 0) {
    throw new Error('No chunks to combine')
  }

  // Sort by index to ensure correct order
  const sortedResults = [...chunkResults].sort((a, b) => a.index - b.index)

  const concatListPath = path.join(tmpdir(), `concat-${Date.now()}.txt`)

  try {
    // Create concat list file
    const concatContent = sortedResults
      .map(({ path: chunkPath }) => `file '${escapeForConcat(chunkPath)}'`)
      .join('\n')

    await fs.writeFile(concatListPath, concatContent)

    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath
    ]

    // Set DYLD_LIBRARY_PATH for FFmpeg dynamic libraries
    const ffmpegDir = path.dirname(ffmpegPath)
    const env = {
      ...process.env,
      DYLD_LIBRARY_PATH: `${ffmpegDir}:${process.env.DYLD_LIBRARY_PATH || ''}`
    }

    await new Promise<void>((resolve, reject) => {
      const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { env })

      let stderr = ''
      ffmpegProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      ffmpegProcess.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`FFmpeg concat failed with code ${code}: ${stderr}`))
        }
      })
      ffmpegProcess.on('error', reject)
    })
  } finally {
    // Clean up concat list file
    await fs.unlink(concatListPath).catch(() => {})
  }
}

/**
 * Clean up chunk files after combination
 * @param chunkPaths - Array of chunk file paths to delete
 */
export async function cleanupChunks(chunkPaths: string[]): Promise<void> {
  for (const chunkPath of chunkPaths) {
    await fs.unlink(chunkPath).catch(() => {})
  }
}

/**
 * Result of combining chunks
 */
export interface CombineResult {
  success: boolean
  outputPath?: string
  error?: string
}

/**
 * Combine chunks and clean up in a single operation
 * @param chunkResults - Chunk results from workers
 * @param outputPath - Final output path
 * @param ffmpegPath - Path to FFmpeg
 * @returns Result of the combine operation
 */
export async function combineAndCleanup(
  chunkResults: ChunkResult[],
  outputPath: string,
  ffmpegPath: string
): Promise<CombineResult> {
  const validResults = chunkResults
    .filter(r => r.success && r.path)
    .map(r => ({ index: r.index, path: r.path }))

  if (validResults.length === 0) {
    return { success: false, error: 'No valid chunks to combine' }
  }

  try {
    await combineChunks(validResults, outputPath, ffmpegPath)

    // Clean up chunk files
    await cleanupChunks(validResults.map(r => r.path))

    return { success: true, outputPath }
  } catch (error) {
    // Clean up on failure too
    await cleanupChunks(validResults.map(r => r.path))

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Combine failed'
    }
  }
}

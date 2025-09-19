/**
 * Unified path resolution for recordings
 * Single source of truth for resolving recording paths
 */

import * as path from 'path'

/**
 * Resolve the full path to a recording file
 * Handles both absolute and relative paths consistently
 */
export async function resolveRecordingPath(
  filePath: string,
  folderPath?: string
): Promise<string> {
  // If already absolute, return as-is
  if (path.isAbsolute(filePath)) {
    return filePath
  }

  // If we have a folder path, use it
  if (folderPath) {
    if (path.isAbsolute(folderPath)) {
      // folderPath points to recording folder; video is in its parent
      const parentDir = path.dirname(folderPath)
      return path.join(parentDir, filePath)
    }
  }

  // Default: use recordings directory from Electron
  if (!window.electronAPI?.getRecordingsDirectory) {
    throw new Error('Electron API not available')
  }

  const recordingsDir = await window.electronAPI.getRecordingsDirectory()
  return path.join(recordingsDir, filePath)
}

/**
 * Convert a file path to a video-stream:// URL
 */
export function pathToFileUrl(filePath: string): string {
  const normalizedPath = path.resolve(filePath)
  const encodedPath = encodeURIComponent(normalizedPath)
  return `video-stream://local/${encodedPath}`
}
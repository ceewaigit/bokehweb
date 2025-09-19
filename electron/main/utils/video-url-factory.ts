/**
 * Unified video URL factory
 * Provides consistent URL generation for both preview and export
 */

import * as path from 'path'
import { getVideoServer } from '../video-http-server'

/**
 * Target environment for video URL generation
 */
export type VideoTarget = 'preview' | 'export'

/**
 * Create a video URL that works in the specified target environment
 * 
 * @param absPath - Absolute path to the video file
 * @param target - Target environment (preview uses custom protocol, export uses HTTP)
 * @returns URL that can be used in video elements
 */
export async function makeVideoSrc(absPath: string, target: VideoTarget): Promise<string> {
  // Clean up the path first
  let cleanPath = absPath
  
  // Remove any existing protocol
  cleanPath = cleanPath.replace(/^(file|video-stream):\/+/, '')
  
  // Remove 'local/' prefix if present  
  if (cleanPath.startsWith('local/')) {
    cleanPath = cleanPath.slice(6)
  }
  
  // Decode if encoded
  try {
    cleanPath = decodeURIComponent(cleanPath)
  } catch {
    // Use as-is if decode fails
  }
  
  // Make absolute if not already
  if (!path.isAbsolute(cleanPath)) {
    // If it looks like an absolute path without leading slash (Windows), add drive
    if (cleanPath.match(/^[A-Z]:/i)) {
      // Already has drive letter
    } else if (cleanPath.match(/^(Users|home|var|tmp|opt)/i)) {
      // Unix path missing leading slash
      cleanPath = '/' + cleanPath
    } else {
      // Relative path - don't throw, just log
      console.log(`[VideoURLFactory] Relative path provided: ${cleanPath}`)
    }
  }

  if (target === 'preview') {
    // For Electron preview, use custom video-stream:// protocol
    // Encode the path to handle special characters
    const encodedPath = encodeURIComponent(cleanPath)
    const url = `video-stream://local/${encodedPath}`
    console.log(`[VideoURLFactory] Preview URL created: ${url}`)
    return url
  }

  // For export, use HTTP server
  const server = await getVideoServer()
  // Register file with 5 minute TTL (export should complete within this time)
  const url = server.registerFile(cleanPath, 5 * 60 * 1000)
  console.log(`[VideoURLFactory] Export URL created: ${url}`)
  return url
}

/**
 * Helper to determine if we're in export mode based on environment
 */
export function isExportMode(): boolean {
  // Check if we're running in Remotion's rendering context
  // This is set by Remotion during export
  return process.env.NODE_ENV === 'production' || 
         process.env.REMOTION_RENDERER === 'true' ||
         false
}

/**
 * Batch create video URLs for multiple files
 */
export async function makeVideoSrcBatch(
  paths: string[], 
  target: VideoTarget
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}
  
  for (const filePath of paths) {
    try {
      urls[filePath] = await makeVideoSrc(filePath, target)
    } catch (error) {
      console.error(`[VideoURLFactory] Failed to create URL for ${filePath}:`, error)
      // Return empty string for failed URLs
      urls[filePath] = ''
    }
  }
  
  return urls
}
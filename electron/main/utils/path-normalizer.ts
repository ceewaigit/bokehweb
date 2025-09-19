/**
 * Minimal path normalization utilities
 * Only what's actually needed for video file resolution
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

/**
 * Normalize a path to work on current platform
 */
export function normalizeCrossPlatform(inputPath: string): string {
  if (!inputPath) return ''
  
  let normalized = inputPath
  
  // Remove any URL protocols
  normalized = normalized.replace(/^(file|video-stream):\/+/, '')
  
  // Remove 'local/' prefix if present
  if (normalized.startsWith('local/')) {
    normalized = normalized.slice(6)
  }
  
  // Handle URL encoding
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Use as-is if decode fails
  }
  
  // Platform-specific handling
  if (process.platform === 'win32') {
    // Windows: Convert forward slashes to backslashes
    normalized = normalized.replace(/\//g, '\\')
    // Fix drive letters
    if (normalized.match(/^[a-z]:/)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1)
    }
  } else {
    // Unix: Ensure forward slashes
    normalized = normalized.replace(/\\/g, '/')
    // Add leading slash if it looks like absolute path
    if (!normalized.startsWith('/') && normalized.match(/^(Users|home|var|tmp|opt)/i)) {
      normalized = '/' + normalized
    }
  }
  
  return path.normalize(normalized)
}

/**
 * Find a video file using simple search strategies
 */
export function findVideoFile(inputPath: string): string | null {
  // First normalize the path
  const normalizedPath = normalizeCrossPlatform(inputPath)
  
  // If file exists at normalized path, return it
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath
  }
  
  // If not absolute, try common directories
  if (!path.isAbsolute(normalizedPath)) {
    const searchDirs = [
      path.join(app.getPath('home'), 'Documents'),
      path.join(app.getPath('home'), 'Videos'),
      path.join(app.getPath('home'), 'Downloads'),
      app.getPath('documents'),
      app.getPath('videos'),
      app.getPath('downloads')
    ]
    
    for (const dir of searchDirs) {
      const fullPath = path.join(dir, normalizedPath)
      if (fs.existsSync(fullPath)) {
        return fullPath
      }
      
      // Also try with FlowCapture Recordings subdirectory
      const recordingPath = path.join(dir, 'FlowCapture Recordings', normalizedPath)
      if (fs.existsSync(recordingPath)) {
        return recordingPath
      }
    }
  }
  
  // Try just the filename in common locations
  const basename = path.basename(normalizedPath)
  if (basename !== normalizedPath) {
    const quickSearchDirs = [
      path.join(app.getPath('home'), 'Documents', 'FlowCapture Recordings'),
      path.join(app.getPath('home'), 'Documents'),
      path.join(app.getPath('home'), 'Downloads')
    ]
    
    for (const dir of quickSearchDirs) {
      const filePath = path.join(dir, basename)
      if (fs.existsSync(filePath)) {
        return filePath
      }
    }
  }
  
  return null
}
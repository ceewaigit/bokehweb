/**
 * Cross-platform path normalization utilities
 * Ensures paths work on Windows, macOS, and Linux
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

/**
 * Normalize a path to work on any platform
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
    // If decode fails, use as-is
  }
  
  // Handle Windows paths
  if (process.platform === 'win32') {
    // Convert forward slashes to backslashes
    normalized = normalized.replace(/\//g, '\\')
    
    // Fix drive letters (c: -> C:)
    if (normalized.match(/^[a-z]:/)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1)
    }
    
    // Add drive letter if missing
    if (!normalized.match(/^[A-Z]:/) && !normalized.startsWith('\\\\')) {
      // Assume C: drive if no drive specified
      if (normalized.startsWith('\\')) {
        normalized = 'C:' + normalized
      }
    }
  } else {
    // Unix-like systems (macOS, Linux)
    // Ensure forward slashes
    normalized = normalized.replace(/\\/g, '/')
    
    // Ensure leading slash for absolute paths
    if (!normalized.startsWith('/') && !normalized.startsWith('~')) {
      // Check if it looks like it should be absolute
      if (normalized.match(/^(Users|home|var|tmp|opt|mnt|media)/i)) {
        normalized = '/' + normalized
      }
    }
    
    // Expand home directory
    if (normalized.startsWith('~/')) {
      normalized = path.join(app.getPath('home'), normalized.slice(2))
    }
  }
  
  // Final normalization using Node's path module
  return path.normalize(normalized)
}

/**
 * Find a video file using multiple search strategies
 */
export function findVideoFile(inputPath: string): string | null {
  // First normalize the path
  let normalizedPath = normalizeCrossPlatform(inputPath)
  
  // If file exists at normalized path, return it
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath
  }
  
  // If absolute path doesn't exist, try relative to common directories
  if (!path.isAbsolute(normalizedPath)) {
    const searchDirs = [
      app.getPath('home'),
      path.join(app.getPath('home'), 'Documents'),
      path.join(app.getPath('home'), 'Videos'),
      path.join(app.getPath('home'), 'Movies'),
      path.join(app.getPath('home'), 'Downloads'),
      path.join(app.getPath('home'), 'Desktop'),
      app.getPath('documents'),
      app.getPath('videos'),
      app.getPath('downloads'),
      app.getPath('desktop'),
      app.getPath('userData'),
      process.cwd()
    ]
    
    // Also check for common recording app directories
    const recordingDirs = [
      'FlowCapture Recordings',
      'Screen Recordings',
      'Recordings',
      'Captures',
      'Videos'
    ]
    
    // Try each search directory
    for (const dir of searchDirs) {
      // Try direct path
      const directPath = path.join(dir, normalizedPath)
      if (fs.existsSync(directPath)) {
        return directPath
      }
      
      // Try with recording subdirectories
      for (const recDir of recordingDirs) {
        const recPath = path.join(dir, recDir, normalizedPath)
        if (fs.existsSync(recPath)) {
          return recPath
        }
      }
    }
  }
  
  // Try to extract just the filename and search for it
  const basename = path.basename(normalizedPath)
  if (basename !== normalizedPath) {
    // Search for the file by name only
    const searchDirs = [
      path.join(app.getPath('home'), 'Documents'),
      path.join(app.getPath('home'), 'Videos'),
      path.join(app.getPath('home'), 'Downloads'),
    ]
    
    for (const dir of searchDirs) {
      const result = searchInDirectory(dir, basename, 3) // Search 3 levels deep
      if (result) {
        return result
      }
    }
  }
  
  return null
}

/**
 * Recursively search for a file in a directory
 */
function searchInDirectory(dir: string, filename: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isFile() && entry.name === filename) {
        return fullPath
      }
      
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Skip hidden directories and system directories
        if (['node_modules', 'Library', 'AppData', '.git'].includes(entry.name)) {
          continue
        }
        
        const result = searchInDirectory(fullPath, filename, maxDepth - 1)
        if (result) {
          return result
        }
      }
    }
  } catch (e) {
    // Permission denied or other errors - skip this directory
  }
  
  return null
}

/**
 * Get all possible paths for a video file
 */
export function getPossiblePaths(inputPath: string): string[] {
  const paths: string[] = []
  const normalized = normalizeCrossPlatform(inputPath)
  
  // Add the normalized path
  paths.push(normalized)
  
  // Add with common directories
  const dirs = [
    app.getPath('home'),
    path.join(app.getPath('home'), 'Documents'),
    path.join(app.getPath('home'), 'Videos'),
    path.join(app.getPath('home'), 'Downloads'),
  ]
  
  const basename = path.basename(normalized)
  
  for (const dir of dirs) {
    paths.push(path.join(dir, normalized))
    paths.push(path.join(dir, basename))
    paths.push(path.join(dir, 'FlowCapture Recordings', basename))
    paths.push(path.join(dir, 'Screen Recordings', basename))
  }
  
  // Remove duplicates
  return [...new Set(paths)]
}
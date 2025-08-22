/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/lib/utils/logger'

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly METADATA_PREFIX = 'recording-metadata-'
  private static readonly PROJECT_PREFIX = 'project-'
  private static readonly PROJECT_PATH_PREFIX = 'project-path-'

  /**
   * Store a recording blob URL
   */
  static setBlobUrl(recordingId: string, url: string): void {
    try {
      localStorage.setItem(`${this.BLOB_PREFIX}${recordingId}`, url)
      logger.debug(`Stored blob URL for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store blob URL for recording ${recordingId}:`, error)
    }
  }

  /**
   * Get a recording blob URL
   */
  static getBlobUrl(recordingId: string): string | null {
    return localStorage.getItem(`${this.BLOB_PREFIX}${recordingId}`)
  }

  /**
   * Clear a recording blob URL
   */
  static clearBlobUrl(recordingId: string): void {
    localStorage.removeItem(`${this.BLOB_PREFIX}${recordingId}`)
    logger.debug(`Cleared blob URL for recording ${recordingId}`)
  }

  /**
   * Store recording metadata
   */
  static setMetadata(recordingId: string, metadata: any): void {
    try {
      const metadataStr = typeof metadata === 'string'
        ? metadata
        : JSON.stringify(metadata)
      localStorage.setItem(`${this.METADATA_PREFIX}${recordingId}`, metadataStr)
      logger.debug(`Stored metadata for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store metadata for recording ${recordingId}:`, error)
    }
  }

  /**
   * Get recording metadata
   */
  static getMetadata(recordingId: string): any | null {
    try {
      const metadataStr = localStorage.getItem(`${this.METADATA_PREFIX}${recordingId}`)
      if (!metadataStr) return null
      return JSON.parse(metadataStr)
    } catch (error) {
      logger.error(`Failed to parse metadata for recording ${recordingId}:`, error)
      return null
    }
  }

  /**
   * Store project data
   */
  static setProject(projectId: string, projectData: any): void {
    try {
      const dataStr = typeof projectData === 'string'
        ? projectData
        : JSON.stringify(projectData)
      localStorage.setItem(`${this.PROJECT_PREFIX}${projectId}`, dataStr)
      logger.debug(`Stored project ${projectId}`)
    } catch (error) {
      logger.error(`Failed to store project ${projectId}:`, error)
    }
  }

  /**
   * Get project data
   */
  static getProject(projectId: string): any | null {
    try {
      const projectStr = localStorage.getItem(`${this.PROJECT_PREFIX}${projectId}`)
      if (!projectStr) return null
      return JSON.parse(projectStr)
    } catch (error) {
      logger.error(`Failed to parse project ${projectId}:`, error)
      return null
    }
  }

  /**
   * Store project path
   */
  static setProjectPath(projectId: string, path: string): void {
    try {
      localStorage.setItem(`${this.PROJECT_PATH_PREFIX}${projectId}`, path)
      logger.debug(`Stored project path for ${projectId}: ${path}`)
    } catch (error) {
      logger.error(`Failed to store project path for ${projectId}:`, error)
    }
  }

  /**
   * Clear all blob URLs from localStorage (useful on app startup)
   * Since blob URLs are session-specific and become invalid after restart
   */
  static clearAllBlobUrls(): void {
    const keysToRemove: string[] = []

    // Find all blob URL keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.BLOB_PREFIX)) {
        keysToRemove.push(key)
      }
    }

    // Remove all blob URL entries
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      logger.info(`Cleared ${keysToRemove.length} cached blob URLs on startup`)
    }
  }

}
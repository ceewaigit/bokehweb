/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/lib/utils/logger'

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly METADATA_PREFIX = 'recording-metadata-'
  private static readonly EFFECTS_PREFIX = 'clip-effects-'
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
   * Store clip effects
   */
  static setClipEffects(clipId: string, effects: any): void {
    try {
      localStorage.setItem(`${this.EFFECTS_PREFIX}${clipId}`, JSON.stringify(effects))
      logger.debug(`Stored effects for clip ${clipId}`)
    } catch (error) {
      logger.error(`Failed to store effects for clip ${clipId}:`, error)
    }
  }

  /**
   * Get clip effects
   */
  static getClipEffects(clipId: string): any | null {
    try {
      const effectsStr = localStorage.getItem(`${this.EFFECTS_PREFIX}${clipId}`)
      if (!effectsStr) return null
      return JSON.parse(effectsStr)
    } catch (error) {
      logger.error(`Failed to parse effects for clip ${clipId}:`, error)
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
   * Get project path
   */
  static getProjectPath(projectId: string): string | null {
    return localStorage.getItem(`${this.PROJECT_PATH_PREFIX}${projectId}`)
  }

  /**
   * Clean up storage for a recording
   */
  static removeRecording(recordingId: string): void {
    localStorage.removeItem(`${this.BLOB_PREFIX}${recordingId}`)
    localStorage.removeItem(`${this.METADATA_PREFIX}${recordingId}`)
    logger.debug(`Removed storage for recording ${recordingId}`)
  }

  /**
   * Clean up storage for a clip
   */
  static removeClip(clipId: string): void {
    localStorage.removeItem(`${this.EFFECTS_PREFIX}${clipId}`)
    logger.debug(`Removed storage for clip ${clipId}`)
  }

  /**
   * Clean up storage for a project
   */
  static removeProject(projectId: string): void {
    localStorage.removeItem(`${this.PROJECT_PREFIX}${projectId}`)
    localStorage.removeItem(`${this.PROJECT_PATH_PREFIX}${projectId}`)
    logger.debug(`Removed storage for project ${projectId}`)
  }

  /**
   * Clear all recording-related storage
   */
  static clearAll(): void {
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.startsWith(this.BLOB_PREFIX) ||
        key.startsWith(this.METADATA_PREFIX) ||
        key.startsWith(this.EFFECTS_PREFIX) ||
        key.startsWith(this.PROJECT_PREFIX) ||
        key.startsWith(this.PROJECT_PATH_PREFIX)
      )) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
    logger.info(`Cleared ${keysToRemove.length} recording-related storage items`)
  }
}
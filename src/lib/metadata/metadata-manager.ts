/**
 * Unified metadata storage manager
 * Single source of truth for all recording metadata
 */

import { type RecordingMetadata } from '@/types/project'
import { logger } from '@/lib/utils/logger'

class MetadataManager {
  private readonly METADATA_KEY_PREFIX = 'recording-metadata-'
  
  /**
   * Save metadata for a recording
   * @param recordingId - Unique identifier for the recording
   * @param metadata - Recording metadata to save
   */
  saveMetadata(recordingId: string, metadata: RecordingMetadata): void {
    try {
      const key = `${this.METADATA_KEY_PREFIX}${recordingId}`
      localStorage.setItem(key, JSON.stringify(metadata))
      logger.debug(`Saved metadata for recording: ${recordingId}`)
    } catch (error) {
      logger.error('Failed to save metadata:', error)
      throw new Error(`Failed to save metadata for recording ${recordingId}`)
    }
  }
  
  /**
   * Load metadata for a recording
   * @param recordingId - Unique identifier for the recording
   * @returns Recording metadata or null if not found
   */
  loadMetadata(recordingId: string): RecordingMetadata | null {
    try {
      const key = `${this.METADATA_KEY_PREFIX}${recordingId}`
      const data = localStorage.getItem(key)
      
      if (!data) {
        logger.debug(`No metadata found for recording: ${recordingId}`)
        return null
      }
      
      return JSON.parse(data) as RecordingMetadata
    } catch (error) {
      logger.error('Failed to load metadata:', error)
      return null
    }
  }
  
  /**
   * Delete metadata for a recording
   * @param recordingId - Unique identifier for the recording
   */
  deleteMetadata(recordingId: string): void {
    try {
      const key = `${this.METADATA_KEY_PREFIX}${recordingId}`
      localStorage.removeItem(key)
      logger.debug(`Deleted metadata for recording: ${recordingId}`)
    } catch (error) {
      logger.error('Failed to delete metadata:', error)
    }
  }
  
  /**
   * Check if metadata exists for a recording
   * @param recordingId - Unique identifier for the recording
   */
  hasMetadata(recordingId: string): boolean {
    const key = `${this.METADATA_KEY_PREFIX}${recordingId}`
    return localStorage.getItem(key) !== null
  }
  
  /**
   * Migrate metadata from old key pattern to new
   * @param oldKey - Old localStorage key
   * @param recordingId - New recording ID to use
   */
  migrateMetadata(oldKey: string, recordingId: string): boolean {
    try {
      const oldData = localStorage.getItem(oldKey)
      if (!oldData) return false
      
      // Save with new key pattern
      this.saveMetadata(recordingId, JSON.parse(oldData))
      
      // Remove old key
      localStorage.removeItem(oldKey)
      
      logger.info(`Migrated metadata from ${oldKey} to recording-${recordingId}`)
      return true
    } catch (error) {
      logger.error('Failed to migrate metadata:', error)
      return false
    }
  }
  
  /**
   * Clean up orphaned metadata (no corresponding recording)
   * @param validRecordingIds - List of valid recording IDs to keep
   */
  cleanupOrphanedMetadata(validRecordingIds: string[]): number {
    let cleaned = 0
    const validKeys = new Set(validRecordingIds.map(id => `${this.METADATA_KEY_PREFIX}${id}`))
    
    // Find all metadata keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(this.METADATA_KEY_PREFIX) && !validKeys.has(key)) {
        localStorage.removeItem(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} orphaned metadata entries`)
    }
    
    return cleaned
  }
  
  /**
   * Get all metadata keys in localStorage
   */
  getAllMetadataKeys(): string[] {
    const keys: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(this.METADATA_KEY_PREFIX)) {
        keys.push(key)
      }
    }
    
    return keys
  }
  
  /**
   * Migrate all old metadata patterns to new unified pattern
   */
  migrateAllOldPatterns(): void {
    const patterns = [
      { prefix: 'clip-metadata-', extract: (key: string) => key.replace('clip-metadata-', '') },
      { prefix: 'recording-metadata-/', extract: (key: string) => {
        // Extract recording ID from file path
        const match = key.match(/Recording_([^.]+)\.webm/)
        return match ? match[1] : null
      }}
    ]
    
    let migrated = 0
    
    for (const pattern of patterns) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(pattern.prefix)) {
          const recordingId = pattern.extract(key)
          if (recordingId && this.migrateMetadata(key, recordingId)) {
            migrated++
          }
        }
      }
    }
    
    if (migrated > 0) {
      logger.info(`Migrated ${migrated} metadata entries to unified pattern`)
    }
  }
}

// Export singleton instance
export const metadataManager = new MetadataManager()

// Auto-migrate on first import
if (typeof window !== 'undefined') {
  metadataManager.migrateAllOldPatterns()
}
/**
 * Parallel metadata loader for efficient chunk loading
 * Loads metadata chunks from disk in parallel for faster export
 */

import type { Recording, RecordingMetadata } from '@/types'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { logger } from '@/lib/utils/logger'

export interface MetadataLoadResult {
  recordingId: string
  metadata: RecordingMetadata | null
  cached: boolean
}

export class MetadataLoader {
  private loadPromises: Map<string, Promise<RecordingMetadata | null>> = new Map()
  
  /**
   * Load metadata for multiple recordings in parallel
   */
  async loadAllMetadata(recordings: Recording[]): Promise<Map<string, RecordingMetadata>> {
    const startTime = performance.now()
    const results = new Map<string, RecordingMetadata>()
    
    // Create load tasks for each recording
    const loadTasks = recordings.map(async (recording) => {
      try {
        const metadata = await this.loadRecordingMetadata(recording)
        if (metadata) {
          results.set(recording.id, metadata)
        }
        return { recordingId: recording.id, metadata, cached: false }
      } catch (error) {
        logger.error(`Failed to load metadata for recording ${recording.id}:`, error)
        return { recordingId: recording.id, metadata: null, cached: false }
      }
    })
    
    // Execute all loads in parallel
    const loadResults = await Promise.all(loadTasks)
    
    const loadTime = performance.now() - startTime
    const successCount = loadResults.filter(r => r.metadata).length
    
    logger.info(`Loaded metadata for ${successCount}/${recordings.length} recordings in ${loadTime.toFixed(2)}ms`)
    
    return results
  }
  
  /**
   * Load metadata for a single recording (with caching)
   */
  async loadRecordingMetadata(recording: Recording): Promise<RecordingMetadata | null> {
    // Check memory cache first
    const cached = RecordingStorage.getMetadata(recording.id)
    if (cached) {
      logger.debug(`Using cached metadata for recording ${recording.id}`)
      return cached
    }
    
    // Check if we're already loading this recording
    const existingPromise = this.loadPromises.get(recording.id)
    if (existingPromise) {
      return existingPromise
    }
    
    // Create new load promise
    const loadPromise = this.loadMetadataFromDisk(recording)
    this.loadPromises.set(recording.id, loadPromise)
    
    try {
      const metadata = await loadPromise
      
      // Cache in memory for future use
      if (metadata) {
        RecordingStorage.setMetadata(recording.id, metadata)
      }
      
      return metadata
    } finally {
      // Clean up promise cache
      this.loadPromises.delete(recording.id)
    }
  }
  
  /**
   * Load metadata chunks from disk
   */
  private async loadMetadataFromDisk(recording: Recording): Promise<RecordingMetadata | null> {
    // If metadata is already in memory (from recent recording), use it
    if (recording.metadata) {
      return recording.metadata
    }
    
    // If we have chunked metadata on disk, load it
    if (recording.metadataChunks && recording.folderPath) {
      try {
        const metadata = await RecordingStorage.loadMetadataChunks(
          recording.folderPath,
          recording.metadataChunks
        )
        
        // Add capture area if available
        if (recording.captureArea) {
          metadata.captureArea = recording.captureArea
        }
        
        return metadata as RecordingMetadata
      } catch (error) {
        logger.error(`Failed to load metadata chunks for recording ${recording.id}:`, error)
      }
    }
    
    // Fallback: create minimal metadata from recording info
    return {
      mouseEvents: [],
      keyboardEvents: [],
      clickEvents: [],
      scrollEvents: [],
      screenEvents: [],
      captureArea: recording.captureArea
    }
  }
  
  /**
   * Preload metadata for recordings that will be needed soon
   * Useful for preloading next clips while current clip is exporting
   */
  async preloadMetadata(recordings: Recording[]): Promise<void> {
    // Fire and forget - just start the loading process
    recordings.forEach(recording => {
      this.loadRecordingMetadata(recording).catch(error => {
        logger.debug(`Preload failed for recording ${recording.id}:`, error)
      })
    })
  }
  
  /**
   * Clear all cached metadata to free memory
   */
  clearCache(): void {
    this.loadPromises.clear()
    // Note: We don't clear RecordingStorage cache here as it's managed separately
  }
}

// Singleton instance for shared use
export const metadataLoader = new MetadataLoader()
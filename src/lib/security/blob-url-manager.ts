/**
 * BlobURLManager - Unified video/blob management with automatic cleanup
 * Handles video loading, caching, and memory management
 */

import { logger } from '@/lib/utils/logger'
import { MemoryError } from '@/lib/core/errors'
import { RecordingStorage } from '@/lib/storage/recording-storage'

interface BlobEntry {
  url: string
  size: number
  createdAt: number
  description?: string
}

export class BlobURLManager {
  private entries = new Map<string, BlobEntry>()
  private disposed = false
  private totalSize = 0
  private maxSize = 500 * 1024 * 1024 // 500MB limit
  private cleanupTimer: NodeJS.Timeout | null = null
  private loadingPromises = new Map<string, Promise<string | null>>()

  create(blob: Blob, description?: string): string {
    if (this.disposed) {
      throw new MemoryError('BlobURLManager has been disposed')
    }

    // Check memory limit
    if (this.totalSize + blob.size > this.maxSize) {
      this.performEmergencyCleanup()
      if (this.totalSize + blob.size > this.maxSize) {
        throw new MemoryError(
          `Blob memory limit exceeded: ${Math.round(this.totalSize / 1024 / 1024)}MB used`,
          this.totalSize
        )
      }
    }

    const url = URL.createObjectURL(blob)
    const entry: BlobEntry = {
      url,
      size: blob.size,
      createdAt: Date.now(),
      description
    }

    this.entries.set(url, entry)
    this.totalSize += blob.size

    // Auto-cache if it's a recording
    if (description?.startsWith('recording-')) {
      const recordingId = description.replace('recording-', '')
      RecordingStorage.setBlobUrl(recordingId, url)
    }

    logger.debug(`Blob URL created: ${description || 'unnamed'}, size: ${blob.size} bytes`)

    // Schedule automatic cleanup for old entries
    this.scheduleCleanup()

    return url
  }

  revoke(url: string): void {
    const entry = this.entries.get(url)
    if (entry) {
      try {
        URL.revokeObjectURL(url)
        this.totalSize -= entry.size
        this.entries.delete(url)
        logger.debug(`Blob URL revoked: ${entry.description || url}`)
      } catch (error) {
        logger.error('Error revoking blob URL:', error)
      }
    }
  }

  getUrlCount(): number {
    return this.entries.size
  }

  getMemoryUsage(): number {
    return this.totalSize
  }

  getMemoryReport(): { count: number; totalSize: number; entries: Array<{ description?: string; size: number; age: number }> } {
    const now = Date.now()
    return {
      count: this.entries.size,
      totalSize: this.totalSize,
      entries: Array.from(this.entries.values()).map(entry => ({
        description: entry.description,
        size: entry.size,
        age: now - entry.createdAt
      }))
    }
  }

  cleanup(): void {
    const count = this.entries.size
    const size = this.totalSize

    this.entries.forEach(entry => {
      try {
        URL.revokeObjectURL(entry.url)
      } catch (error) {
        logger.error('Error revoking URL during cleanup:', error)
      }
    })

    this.entries.clear()
    this.totalSize = 0

    if (count > 0) {
      logger.info(`Cleaned up ${count} blob URLs, freed ${Math.round(size / 1024 / 1024)}MB`)
    }
  }

  private performEmergencyCleanup(): void {
    // Remove oldest entries first
    const sortedEntries = Array.from(this.entries.values())
      .sort((a, b) => a.createdAt - b.createdAt)

    const targetSize = this.maxSize * 0.7 // Free up to 70% capacity
    let freedSize = 0

    for (const entry of sortedEntries) {
      if (this.totalSize <= targetSize) break

      this.revoke(entry.url)
      freedSize += entry.size
    }

    if (freedSize > 0) {
      logger.warn(`Emergency cleanup: freed ${Math.round(freedSize / 1024 / 1024)}MB`)
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) return

    // Clean up entries older than 5 minutes
    this.cleanupTimer = setTimeout(() => {
      const now = Date.now()
      const maxAge = 5 * 60 * 1000 // 5 minutes

      let cleaned = 0
      this.entries.forEach(entry => {
        if (now - entry.createdAt > maxAge) {
          this.revoke(entry.url)
          cleaned++
        }
      })

      if (cleaned > 0) {
        logger.debug(`Auto-cleanup: removed ${cleaned} old blob URLs`)
      }

      this.cleanupTimer = null

      // Schedule next cleanup if there are still entries
      if (this.entries.size > 0) {
        this.scheduleCleanup()
      }
    }, 60000) // Check every minute
  }

  /**
   * Load a video file and return a blob URL
   * Handles caching, loading, and error handling automatically
   */
  async loadVideo(recordingId: string, filePath?: string): Promise<string | null> {
    // Check cache first
    const cached = RecordingStorage.getBlobUrl(recordingId)
    if (cached) {
      // Validate that the cached blob URL is still valid
      // Blob URLs become invalid after page reload/app restart
      if (await this.isBlobUrlValid(cached)) {
        logger.debug(`Using cached video for ${recordingId}`)
        return cached
      } else {
        logger.debug(`Cached blob URL invalid for ${recordingId}, reloading from file`)
        // Clear the invalid cached URL
        RecordingStorage.clearBlobUrl(recordingId)
      }
    }

    // Check if already loading
    const existingPromise = this.loadingPromises.get(recordingId)
    if (existingPromise) {
      logger.debug(`Already loading ${recordingId}, waiting...`)
      return existingPromise
    }

    // Start loading
    const loadPromise = this._loadVideoInternal(recordingId, filePath)
    this.loadingPromises.set(recordingId, loadPromise)

    try {
      const result = await loadPromise
      return result
    } finally {
      this.loadingPromises.delete(recordingId)
    }
  }

  /**
   * Check if a blob URL is still valid
   */
  private async isBlobUrlValid(url: string): Promise<boolean> {
    // Blob URLs start with "blob:"
    if (!url.startsWith('blob:')) {
      return false
    }

    try {
      // Instead of HEAD request (which blob URLs don't support),
      // try to fetch just the first byte to check validity
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 100) // Quick timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-0' }, // Request only first byte
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // If we can fetch even one byte, the blob URL is valid
      return response.ok || response.status === 206 // 206 is partial content
    } catch (error) {
      // Blob URL is no longer valid (happens after page reload)
      // This is expected behavior, not an error
      return false
    }
  }

  private async _loadVideoInternal(recordingId: string, filePath?: string): Promise<string | null> {
    if (!filePath) {
      logger.error(`No file path for ${recordingId}`)
      return null
    }

    if (!window.electronAPI?.readLocalFile || !window.electronAPI?.getRecordingsDirectory) {
      logger.error('Electron API not available')
      return null
    }

    try {
      // If path is not absolute, construct full path using recordings directory
      let fullPath = filePath
      if (!filePath.startsWith('/') && !filePath.startsWith('C:\\')) {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()
        fullPath = `${recordingsDir}/${filePath}`
      }

      logger.debug(`Loading video: ${recordingId} from ${fullPath}`)
      const result = await window.electronAPI.readLocalFile(fullPath)

      if (!result?.success || !result.data) {
        logger.error(`Failed to read file: ${filePath}`)
        return null
      }

      // Create blob and URL
      const blob = new Blob([result.data], { type: 'video/webm' })
      const blobUrl = this.create(blob, `recording-${recordingId}`)

      // Cache for future use
      RecordingStorage.setBlobUrl(recordingId, blobUrl)

      logger.info(`Video loaded: ${recordingId}`)
      return blobUrl
    } catch (error) {
      logger.error(`Error loading video ${recordingId}:`, error)
      return null
    }
  }

  /**
   * Ensure a video is loaded (loads if necessary)
   */
  async ensureVideoLoaded(recordingId: string, filePath?: string): Promise<string | null> {
    return this.loadVideo(recordingId, filePath)
  }

  /**
   * Load multiple videos in parallel
   */
  async loadVideos(recordings: Array<{ id: string; filePath?: string; metadata?: any }>): Promise<void> {
    await Promise.all(
      recordings.map(async rec => {
        // Load video
        const loadPromise = rec.filePath ?
          this.loadVideo(rec.id, rec.filePath).catch(err => {
            logger.error(`Failed to load ${rec.id}:`, err)
            return null
          }) : Promise.resolve(null)

        // Store metadata if provided
        if (rec.metadata) {
          RecordingStorage.setMetadata(rec.id, rec.metadata)
        }

        return loadPromise
      })
    )
  }

  /**
   * Store metadata for a recording
   */
  storeMetadata(recordingId: string, metadata: any): void {
    RecordingStorage.setMetadata(recordingId, metadata)
  }

  /**
   * Get metadata for a recording
   */
  getMetadata(recordingId: string): any {
    return RecordingStorage.getMetadata(recordingId)
  }

  dispose(): void {
    if (!this.disposed) {
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer)
        this.cleanupTimer = null
      }
      this.cleanup()
      this.disposed = true
      this.loadingPromises.clear()
      logger.debug('BlobURLManager disposed')
    }
  }
}

// Global instance for the application
export const globalBlobManager = new BlobURLManager()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalBlobManager.dispose()
  })
}
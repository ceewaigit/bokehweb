/**
 * BlobURLManager - Enhanced memory leak prevention with automatic cleanup
 * Tracks all blob URLs and ensures they are properly revoked
 */

import { logger } from '@/lib/utils/logger'
import { MemoryError } from '@/lib/core/errors'

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

  dispose(): void {
    if (!this.disposed) {
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer)
        this.cleanupTimer = null
      }
      this.cleanup()
      this.disposed = true
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
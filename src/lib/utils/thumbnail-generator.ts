/**
 * Lightweight thumbnail generator that efficiently extracts frames without loading full videos
 */

import { logger } from '@/lib/utils/logger'

interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  timestamp?: number // Percentage (0-1) or seconds
}

export class ThumbnailGenerator {
  private static cache = new Map<string, string>()
  private static generating = new Set<string>()

  /**
   * Generate thumbnail from video file without loading entire video into memory
   * Uses streaming approach with minimal memory footprint
   */
  static async generateThumbnail(
    videoPath: string,
    cacheKey: string,
    options: ThumbnailOptions = {}
  ): Promise<string | null> {
    const {
      width = 320,
      height = 180,
      quality = 0.6,
      timestamp = 0.1 // 10% into video by default
    } = options

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    // Prevent duplicate generation
    if (this.generating.has(cacheKey)) {
      // Wait for existing generation
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.generating.has(cacheKey)) {
            clearInterval(checkInterval)
            resolve(this.cache.get(cacheKey) || null)
          }
        }, 100)
      })
    }

    this.generating.add(cacheKey)

    try {
      // Direct thumbnail generation without full video load
      const thumbnail = await this.extractVideoFrame(
        videoPath,
        { width, height, quality, timestamp }
      )

      if (thumbnail) {
        this.cache.set(cacheKey, thumbnail)
      }

      return thumbnail
    } catch (error) {
      logger.error('Thumbnail generation failed:', error)
      return null
    } finally {
      this.generating.delete(cacheKey)
    }
  }

  /**
   * Extract video frame efficiently without loading full video
   */
  private static async extractVideoFrame(
    videoPath: string,
    options: ThumbnailOptions
  ): Promise<string | null> {
    const { width = 320, height = 180, quality = 0.6, timestamp = 0.1 } = options

    return new Promise(async (resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata' // Only load metadata, not full video

      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          video.remove()
        }
      }

      const handleError = () => {
        cleanup()
        resolve(null)
      }

      // Use Electron's streaming video URL API
      try {
        if (!window.electronAPI?.getVideoUrl) {
          logger.error('Video URL API not available')
          handleError()
          return
        }

        const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
        if (!videoUrl) {
          logger.error('Failed to get video URL')
          handleError()
          return
        }

        video.src = videoUrl
      } catch (error) {
        logger.error('Failed to load video for thumbnail:', error)
        handleError()
        return
      }

      video.addEventListener('error', handleError, { once: true })

      video.addEventListener('loadedmetadata', () => {
        // Calculate a safe seek time that is always finite
        const hasFiniteDuration = Number.isFinite(video.duration) && video.duration > 0
        const normalizedTimestamp = (
          typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0
        ) ? timestamp : 0

        let seekableEnd = 0
        try {
          if (video.seekable && video.seekable.length > 0) {
            seekableEnd = video.seekable.end(video.seekable.length - 1)
          }
        } catch (_err) {
          // ignore seekable access errors
        }

        const referenceDuration = hasFiniteDuration ? video.duration : seekableEnd

        let seekTime = 0
        if (normalizedTimestamp <= 1) {
          seekTime = referenceDuration > 0 ? referenceDuration * normalizedTimestamp : 0
        } else {
          const maxTime = referenceDuration > 0 ? referenceDuration : 0
          seekTime = maxTime > 0 ? Math.min(normalizedTimestamp, Math.max(0, maxTime - 0.001)) : 0
        }

        if (!Number.isFinite(seekTime) || seekTime < 0) {
          logger.warn('Non-finite seekTime detected, defaulting to 0', { duration: video.duration, timestamp })
          seekTime = 0
        }

        // Nudge slightly off zero so 'seeked' is guaranteed to fire
        if (seekTime === 0 && referenceDuration > 0.01) {
          seekTime = 0.001
        }

        video.currentTime = seekTime
      }, { once: true })

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            handleError()
            return
          }

          // Draw video frame to canvas
          ctx.drawImage(video, 0, 0, width, height)

          // Convert to data URL
          const dataUrl = canvas.toDataURL('image/jpeg', quality)

          resolved = true
          cleanup()
          resolve(dataUrl)
        } catch (error) {
          logger.error('Failed to extract frame:', error)
          handleError()
        }
      }, { once: true })

      // Start loading only metadata
      video.load()

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!resolved) {
          logger.warn('Thumbnail generation timeout')
          handleError()
        }
      }, 5000)
    })
  }

  /**
   * Clear thumbnail cache for memory management
   */
  static clearCache(pattern?: string): void {
    if (!pattern) {
      const size = this.cache.size
      this.cache.clear()
      logger.info(`Cleared ${size} thumbnails from cache`)
      return
    }

    // Clear specific pattern
    let cleared = 0
    const keysToDelete: string[] = []
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
        cleared++
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))

    if (cleared > 0) {
      logger.info(`Cleared ${cleared} thumbnails matching pattern: ${pattern}`)
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      count: this.cache.size,
      generating: this.generating.size,
      // Estimate memory usage (rough calculation)
      estimatedMemory: this.cache.size * 50 * 1024 // ~50KB per thumbnail
    }
  }

  /**
   * Preload thumbnails for a list of videos
   */
  static async preloadThumbnails(
    videos: Array<{ path: string; key: string }>,
    options?: ThumbnailOptions
  ): Promise<void> {
    // Process in batches to avoid overwhelming the system
    const batchSize = 3
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize)
      await Promise.all(
        batch.map(video =>
          this.generateThumbnail(video.path, video.key, options)
            .catch(err => {
              logger.error(`Failed to preload thumbnail for ${video.key}:`, err)
              return null
            })
        )
      )
    }
  }
}
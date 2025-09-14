/**
 * Video Frame Extractor
 * Efficiently extracts frames from video clips with proper timing and playback rate handling
 */

import type { Clip, Recording } from '@/types'
import { logger } from '@/lib/utils/logger'

export interface ExtractedFrame {
  imageData: ImageData
  timestamp: number
  clipId: string
  sourceTime: number
}

export class VideoFrameExtractor {
  private videoCache = new Map<string, HTMLVideoElement>()
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  private frameRate: number
  private resolution: { width: number; height: number }

  constructor(width: number, height: number, frameRate: number = 30) {
    this.resolution = { width, height }
    this.frameRate = frameRate

    // Use OffscreenCanvas if available for better performance
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height)
      this.ctx = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      }) as OffscreenCanvasRenderingContext2D
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      this.canvas = canvas
      this.ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: true
      })
    }
  }

  /**
   * Load and prepare a video element
   */
  async loadVideo(recordingId: string, videoUrl: string): Promise<HTMLVideoElement> {
    // Check cache first
    if (this.videoCache.has(recordingId)) {
      return this.videoCache.get(recordingId)!
    }

    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.preload = 'auto'
    
    // Enable hardware acceleration hints
    video.setAttribute('playsinline', 'true')
    video.setAttribute('disablePictureInPicture', 'true')

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Video load timeout for ${recordingId}`))
      }, 10000)

      video.onloadedmetadata = () => {
        clearTimeout(timeout)
        resolve()
      }
      
      video.onerror = () => {
        clearTimeout(timeout)
        reject(new Error(`Failed to load video for ${recordingId}`))
      }
    })

    // Cache the video element
    this.videoCache.set(recordingId, video)
    
    logger.debug(`Loaded video for recording ${recordingId}: ${video.duration}s`)
    
    return video
  }

  /**
   * Extract a single frame at a specific time
   */
  async extractFrame(
    video: HTMLVideoElement,
    sourceTime: number,
    clipId: string,
    timestamp: number
  ): Promise<ExtractedFrame> {
    if (!this.ctx) {
      throw new Error('Canvas context not initialized')
    }

    // Seek to the specified time
    const seekTime = sourceTime / 1000  // Convert ms to seconds
    
    // Only seek if we're not already at the right time (within 1 frame tolerance)
    const frameTolerance = 1 / this.frameRate
    if (Math.abs(video.currentTime - seekTime) > frameTolerance) {
      video.currentTime = seekTime
      
      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.warn(`Seek timeout at ${seekTime}s, continuing anyway`)
          resolve()
        }, 1000)

        const handleSeeked = () => {
          clearTimeout(timeout)
          resolve()
        }

        video.addEventListener('seeked', handleSeeked, { once: true })
      })
    }

    // Clear canvas
    this.ctx.fillStyle = '#000000'
    this.ctx.fillRect(0, 0, this.resolution.width, this.resolution.height)

    // Draw the video frame
    try {
      this.ctx.drawImage(
        video,
        0, 0,
        video.videoWidth, video.videoHeight,
        0, 0,
        this.resolution.width, this.resolution.height
      )
    } catch (error) {
      logger.warn(`Failed to draw frame at ${seekTime}s:`, error)
      // Return black frame on error
    }

    // Get image data
    const imageData = this.ctx.getImageData(
      0, 0,
      this.resolution.width,
      this.resolution.height
    )

    return {
      imageData,
      timestamp,
      clipId,
      sourceTime
    }
  }

  /**
   * Extract frames for a clip with proper timing
   */
  async extractClipFrames(
    clip: Clip,
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    onFrame?: (frame: ExtractedFrame) => Promise<void>
  ): Promise<ExtractedFrame[]> {
    const frames: ExtractedFrame[] = []
    const frameDuration = 1000 / this.frameRate
    const playbackRate = clip.playbackRate || 1
    
    // Calculate frame times
    const clipDuration = endTime - startTime
    const frameCount = Math.ceil((clipDuration / 1000) * this.frameRate)
    
    logger.debug(`Extracting ${frameCount} frames for clip ${clip.id} (${startTime}-${endTime}ms)`)

    for (let i = 0; i < frameCount; i++) {
      const timestamp = startTime + (i * frameDuration)
      
      // Check if we're still within the clip
      if (timestamp >= endTime) break
      
      // Calculate source time with playback rate
      const clipRelativeTime = timestamp - clip.startTime
      const sourceTime = (clip.sourceIn || 0) + (clipRelativeTime * playbackRate)
      
      // Extract the frame
      const frame = await this.extractFrame(
        video,
        sourceTime,
        clip.id,
        timestamp
      )
      
      if (onFrame) {
        await onFrame(frame)
      } else {
        frames.push(frame)
      }
      
      // Allow browser to breathe every 30 frames
      if (i % 30 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    return frames
  }

  /**
   * Extract frames for clips with typing speed adjustments
   */
  async extractClipFramesWithTypingSpeed(
    clip: Clip,
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    onFrame?: (frame: ExtractedFrame) => Promise<void>
  ): Promise<ExtractedFrame[]> {
    const frames: ExtractedFrame[] = []
    const frameDuration = 1000 / this.frameRate
    
    // If clip has typing speed applied, it already has the adjusted playback rate
    const playbackRate = clip.playbackRate || 1
    const isTypingSpeedClip = (clip as any).typingSpeedApplied === true
    
    logger.debug(`Extracting frames for ${isTypingSpeedClip ? 'typing-speed' : 'normal'} clip ${clip.id} at ${playbackRate}x`)
    
    // Calculate frame times
    const clipDuration = endTime - startTime
    const frameCount = Math.ceil((clipDuration / 1000) * this.frameRate)
    
    for (let i = 0; i < frameCount; i++) {
      const timestamp = startTime + (i * frameDuration)
      
      // Check if we're still within the clip
      if (timestamp >= endTime) break
      
      // Calculate source time
      // For typing speed clips, sourceIn and sourceOut already define the exact range
      const clipRelativeTime = timestamp - clip.startTime
      const sourceTime = (clip.sourceIn || 0) + (clipRelativeTime * playbackRate)
      
      // Make sure we don't go past sourceOut
      const maxSourceTime = clip.sourceOut || (clip.sourceIn || 0) + (clip.duration * playbackRate)
      if (sourceTime > maxSourceTime) {
        logger.debug(`Reached end of source for clip ${clip.id}`)
        break
      }
      
      // Extract the frame
      const frame = await this.extractFrame(
        video,
        sourceTime,
        clip.id,
        timestamp
      )
      
      if (onFrame) {
        await onFrame(frame)
      } else {
        frames.push(frame)
      }
      
      // Allow browser to breathe every 30 frames
      if (i % 30 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    logger.debug(`Extracted ${frames.length} frames for clip ${clip.id}`)
    
    return frames
  }

  /**
   * Create a black frame
   */
  createBlackFrame(timestamp: number): ExtractedFrame {
    if (!this.ctx) {
      throw new Error('Canvas context not initialized')
    }

    // Fill with black
    this.ctx.fillStyle = '#000000'
    this.ctx.fillRect(0, 0, this.resolution.width, this.resolution.height)

    // Get image data
    const imageData = this.ctx.getImageData(
      0, 0,
      this.resolution.width,
      this.resolution.height
    )

    return {
      imageData,
      timestamp,
      clipId: 'black-frame',
      sourceTime: 0
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Clear video cache
    for (const video of this.videoCache.values()) {
      video.src = ''
      video.remove()
    }
    this.videoCache.clear()

    // Clear canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.resolution.width, this.resolution.height)
    }
  }
}
/**
 * High-Performance Frame Processing Pipeline
 * Implements producer-consumer pattern for maximum throughput
 */

import { logger } from '@/lib/utils/logger'

export interface FrameData {
  id: string
  data: any // Video element, ImageBitmap, or VideoFrame
  timestamp: number
  metadata?: any
}

export class FramePipeline {
  private queue: FrameData[] = []
  private maxQueueSize: number
  private processing = false
  private processCallback: ((frame: FrameData) => Promise<void>) | null = null
  private activeProcessing = 0
  private maxConcurrent: number
  private completed = 0
  private dropped = 0

  constructor(maxQueueSize = 100, maxConcurrent = 20) {
    this.maxQueueSize = maxQueueSize
    this.maxConcurrent = maxConcurrent
  }

  /**
   * Set the frame processor callback
   */
  onProcess(callback: (frame: FrameData) => Promise<void>): void {
    this.processCallback = callback
  }

  /**
   * Add frame to pipeline (non-blocking)
   */
  addFrame(frame: FrameData): boolean {
    // Drop frame if queue is full (prevent memory overflow)
    if (this.queue.length >= this.maxQueueSize) {
      this.dropped++
      logger.debug(`Dropped frame ${frame.id} - queue full`)
      return false
    }

    this.queue.push(frame)
    
    // Start processing if not already running
    if (!this.processing) {
      this.processing = true
      this.processQueue()
    }

    return true
  }

  /**
   * Process queued frames continuously
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 || this.activeProcessing > 0) {
      // Process up to maxConcurrent frames in parallel
      while (this.queue.length > 0 && this.activeProcessing < this.maxConcurrent) {
        const frame = this.queue.shift()
        if (!frame) break

        this.activeProcessing++
        
        // Process frame without blocking the loop
        this.processFrame(frame).finally(() => {
          this.activeProcessing--
          this.completed++
        })
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1))
    }

    this.processing = false
  }

  /**
   * Process a single frame
   */
  private async processFrame(frame: FrameData): Promise<void> {
    if (!this.processCallback) return

    try {
      await this.processCallback(frame)
    } catch (error) {
      logger.error(`Failed to process frame ${frame.id}:`, error)
    }
  }

  /**
   * Wait for all frames to be processed
   */
  async flush(): Promise<void> {
    // Wait for queue to empty
    while (this.queue.length > 0 || this.activeProcessing > 0) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): {
    queued: number
    processing: number
    completed: number
    dropped: number
  } {
    return {
      queued: this.queue.length,
      processing: this.activeProcessing,
      completed: this.completed,
      dropped: this.dropped
    }
  }

  /**
   * Clear the pipeline
   */
  clear(): void {
    this.queue = []
    this.processing = false
    this.activeProcessing = 0
    this.completed = 0
    this.dropped = 0
  }
}

/**
 * Create an optimized pipeline based on system capabilities
 */
export function createOptimizedPipeline(): FramePipeline {
  const cores = navigator.hardwareConcurrency || 4
  const memory = (performance as any).memory?.jsHeapSizeLimit || 2147483648
  const memoryGB = memory / 1024 / 1024 / 1024
  
  // Adjust queue and concurrency based on system resources
  const maxQueueSize = memoryGB > 4 ? 200 : 100
  const maxConcurrent = Math.min(30, cores * 3) // 3x cores but max 30
  
  logger.info(`Creating frame pipeline: queue=${maxQueueSize}, concurrent=${maxConcurrent}`)
  
  return new FramePipeline(maxQueueSize, maxConcurrent)
}
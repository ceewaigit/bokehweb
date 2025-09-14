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
  private batchSize = 3 // Smaller batches to reduce memory spikes

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
   * Process queued frames continuously with batching
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 || this.activeProcessing > 0) {
      // Process frames in batches for better throughput
      const batch: FrameData[] = []
      while (batch.length < this.batchSize && this.queue.length > 0 && 
             this.activeProcessing < this.maxConcurrent) {
        const frame = this.queue.shift()
        if (frame) batch.push(frame)
      }

      if (batch.length > 0) {
        this.activeProcessing += batch.length
        
        // Process batch in parallel
        Promise.all(batch.map(frame => this.processFrame(frame)))
          .finally(() => {
            this.activeProcessing -= batch.length
            this.completed += batch.length
          })
      }

      // Use microtask for faster scheduling
      if (this.queue.length > 0 || this.activeProcessing > 0) {
        await new Promise(resolve => queueMicrotask(() => resolve(undefined)))
      }
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
   * Wait for all frames to be processed with timeout and better scheduling
   */
  async flush(): Promise<void> {
    const startTime = performance.now()
    const timeout = 30000 // 30 second timeout
    let lastProgress = this.completed
    let noProgressTime = 0
    const noProgressTimeout = 5000 // 5 seconds without progress = stuck
    
    // Wait for queue to empty with progressive backoff
    let backoffMs = 1
    while (this.queue.length > 0 || this.activeProcessing > 0) {
      // Check for timeout
      const elapsed = performance.now() - startTime
      if (elapsed > timeout) {
        logger.error(`Pipeline flush timeout after ${timeout}ms. Queue: ${this.queue.length}, Processing: ${this.activeProcessing}`)
        throw new Error('Pipeline flush timeout - possible deadlock')
      }
      
      // Check for progress
      if (this.completed === lastProgress) {
        noProgressTime += backoffMs
        if (noProgressTime > noProgressTimeout) {
          logger.warn(`Pipeline stuck - no progress for ${noProgressTimeout}ms. Forcing flush...`)
          // Force clear to prevent infinite hang
          this.clear()
          break
        }
      } else {
        lastProgress = this.completed
        noProgressTime = 0
        backoffMs = 1 // Reset backoff on progress
      }
      
      // Use microtask for fast scheduling, with progressive backoff
      if (backoffMs <= 4) {
        await new Promise(resolve => queueMicrotask(() => resolve(undefined)))
      } else {
        await new Promise(resolve => setTimeout(resolve, Math.min(backoffMs, 100)))
      }
      
      // Progressive backoff: 1, 2, 4, 8, 16, 32, 64, 100ms max
      backoffMs = Math.min(backoffMs * 2, 100)
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
  
  // Dynamic resource allocation based on actual system capabilities
  // Balance between parallelism and avoiding contention
  const maxQueueSize = Math.floor(
    memoryGB > 8 ? 400 :
    memoryGB > 4 ? 250 :
    memoryGB > 2 ? 150 :
    100
  )
  
  // Concurrency should not exceed encoder capacity to avoid deadlock
  // Balanced for performance and stability
  const baseConcurrency = Math.min(Math.floor(cores * 1.2), 12) // Slightly more aggressive
  const memoryCap = memoryGB > 4 ? 15 : 10 // Increased but still safe
  const maxConcurrent = Math.min(baseConcurrency, memoryCap)
  
  logger.info(`Creating frame pipeline: queue=${maxQueueSize}, concurrent=${maxConcurrent} (${cores} cores, ${memoryGB.toFixed(1)}GB RAM)`)
  
  return new FramePipeline(maxQueueSize, maxConcurrent)
}
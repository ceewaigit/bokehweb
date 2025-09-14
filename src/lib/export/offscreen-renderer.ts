/**
 * OffscreenCanvas Renderer
 * Uses OffscreenCanvas for better performance and parallel rendering
 */

import { logger } from '@/lib/utils/logger'

export class OffscreenRenderer {
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  private width: number
  private height: number
  private isOffscreen: boolean

  constructor(width: number, height: number) {
    this.width = width
    this.height = height

    // Try to use OffscreenCanvas if available
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height)
      this.ctx = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      }) as OffscreenCanvasRenderingContext2D
      this.isOffscreen = true
      logger.info('Using OffscreenCanvas for rendering')
    } else {
      // Fallback to regular canvas
      this.canvas = document.createElement('canvas')
      this.canvas.width = width
      this.canvas.height = height
      this.ctx = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      }) as CanvasRenderingContext2D
      this.isOffscreen = false
      logger.info('Using HTMLCanvas for rendering (OffscreenCanvas not available)')
    }

    if (!this.ctx) {
      throw new Error('Failed to create canvas context')
    }
  }

  /**
   * Draw video frame to canvas
   */
  drawVideoFrame(video: HTMLVideoElement): void {
    this.ctx.drawImage(video, 0, 0, this.width, this.height)
  }

  /**
   * Draw ImageBitmap to canvas
   */
  drawBitmap(bitmap: ImageBitmap): void {
    this.ctx.drawImage(bitmap, 0, 0, this.width, this.height)
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /**
   * Get the canvas for encoding
   */
  getCanvas(): OffscreenCanvas | HTMLCanvasElement {
    return this.canvas
  }

  /**
   * Get the context for effects
   */
  getContext(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
    return this.ctx
  }

  /**
   * Create ImageBitmap from current canvas
   */
  async toBitmap(): Promise<ImageBitmap> {
    if (this.isOffscreen) {
      return (this.canvas as OffscreenCanvas).transferToImageBitmap()
    } else {
      return createImageBitmap(this.canvas as HTMLCanvasElement)
    }
  }

  /**
   * Transfer to ImageBitmap (for OffscreenCanvas)
   */
  transferToBitmap(): ImageBitmap | null {
    if (this.isOffscreen) {
      return (this.canvas as OffscreenCanvas).transferToImageBitmap()
    }
    return null
  }
}

/**
 * Pool of OffscreenCanvas renderers for parallel processing
 */
export class RendererPool {
  private renderers: OffscreenRenderer[] = []
  private available: OffscreenRenderer[] = []
  private inUse = new Set<OffscreenRenderer>()
  poolSize: number // Made public for access
  private waitingQueue: Array<(renderer: OffscreenRenderer) => void> = []
  private acquisitionTimeouts = new Map<(renderer: OffscreenRenderer) => void, NodeJS.Timeout>()

  constructor(width: number, height: number, poolSize = 2) {
    this.poolSize = poolSize

    // Create pool of renderers
    for (let i = 0; i < poolSize; i++) {
      const renderer = new OffscreenRenderer(width, height)
      this.renderers.push(renderer)
      this.available.push(renderer)
    }

    logger.info(`Created renderer pool with ${poolSize} renderers`)
  }

  /**
   * Get an available renderer
   */
  async acquire(): Promise<OffscreenRenderer> {
    // Fast path: renderer immediately available
    if (this.available.length > 0) {
      const renderer = this.available.shift()!
      this.inUse.add(renderer)
      return renderer
    }

    // Slow path: wait with progressive backoff
    const startTime = performance.now()
    const timeout = 10000 // 10 second timeout
    let backoffMs = 1
    
    while (this.available.length === 0) {
      if (performance.now() - startTime > timeout) {
        throw new Error(`Renderer acquisition timeout after ${timeout}ms. Pool stats: ${JSON.stringify(this.getStats())}`)
      }
      
      // Progressive backoff for efficient waiting
      if (backoffMs <= 4) {
        await new Promise(resolve => queueMicrotask(() => resolve(undefined)))
      } else {
        await new Promise(resolve => setTimeout(resolve, Math.min(backoffMs, 50)))
      }
      backoffMs = Math.min(backoffMs * 2, 50)
    }

    const renderer = this.available.shift()!
    this.inUse.add(renderer)
    return renderer
  }
  
  /**
   * Get an available renderer with timeout
   */
  async acquireWithTimeout(timeoutMs: number): Promise<OffscreenRenderer | null> {
    // If one is immediately available, return it
    if (this.available.length > 0) {
      const renderer = this.available.shift()!
      this.inUse.add(renderer)
      return renderer
    }
    
    // Wait with timeout
    return new Promise((resolve) => {
      const resolveWithRenderer = (renderer: OffscreenRenderer) => {
        const timeoutId = this.acquisitionTimeouts.get(resolveWithRenderer)
        if (timeoutId) {
          clearTimeout(timeoutId)
          this.acquisitionTimeouts.delete(resolveWithRenderer)
        }
        this.inUse.add(renderer)
        resolve(renderer)
      }
      
      const timeoutId = setTimeout(() => {
        // Remove from waiting queue
        const index = this.waitingQueue.indexOf(resolveWithRenderer)
        if (index !== -1) {
          this.waitingQueue.splice(index, 1)
        }
        this.acquisitionTimeouts.delete(resolveWithRenderer)
        
        // Log warning about timeout
        logger.debug(`Renderer acquisition timeout after ${timeoutMs}ms. Pool stats: ${JSON.stringify(this.getStats())}`)
        resolve(null)
      }, timeoutMs)
      
      // Track timeout for cleanup
      this.acquisitionTimeouts.set(resolveWithRenderer, timeoutId)
      
      // Add to waiting queue
      this.waitingQueue.push(resolveWithRenderer)
      
      // Check again in case one became available while setting up
      if (this.available.length > 0) {
        const renderer = this.available.shift()!
        const waiter = this.waitingQueue.shift()
        if (waiter) {
          const tid = this.acquisitionTimeouts.get(waiter)
          if (tid) {
            clearTimeout(tid)
            this.acquisitionTimeouts.delete(waiter)
          }
          waiter(renderer)
        }
      }
    })
  }

  /**
   * Release a renderer back to the pool
   */
  release(renderer: OffscreenRenderer): void {
    if (!this.inUse.has(renderer)) {
      logger.warn('Attempting to release renderer that was not in use')
      return
    }
    
    renderer.clear()
    this.inUse.delete(renderer)
    
    // If someone is waiting, give it to them directly
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()
      if (waiter) {
        waiter(renderer)
        return
      }
    }
    
    this.available.push(renderer)
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; available: number; inUse: number; waiting: number } {
    return {
      total: this.poolSize,
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waitingQueue.length
    }
  }

  /**
   * Dispose all renderers
   */
  dispose(): void {
    // Clear all timeouts
    this.acquisitionTimeouts.forEach(timeout => clearTimeout(timeout))
    this.acquisitionTimeouts.clear()
    
    // Cancel all waiting acquisitions
    this.waitingQueue.forEach(waiter => {
      try {
        waiter(null as any) // Force resolve with null
      } catch {}
    })
    
    this.renderers = []
    this.available = []
    this.waitingQueue = []
    this.inUse.clear()
  }
}
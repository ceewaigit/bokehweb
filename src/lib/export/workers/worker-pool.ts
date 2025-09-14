/**
 * Worker Pool Manager
 * Manages a pool of WebWorkers for parallel frame processing
 */

import { logger } from '@/lib/utils/logger'
import type { Effect } from '@/types'

export interface FrameTask {
  id: string
  bitmap: ImageBitmap
  effects: Effect[]
  timestamp: number
  metadata?: any
}

export interface ProcessedFrame {
  id: string
  bitmap: ImageBitmap
  timestamp: number
}

interface WorkerInstance {
  worker: Worker
  busy: boolean
  id: number
}

export class WorkerPool {
  private workers: WorkerInstance[] = []
  private taskQueue: Array<{
    task: FrameTask
    resolve: (frame: ProcessedFrame) => void
    reject: (error: Error) => void
  }> = []
  private initialized = false
  private width: number
  private height: number
  private poolSize: number
  private processingCount = 0
  private maxConcurrent: number

  constructor(width: number, height: number, poolSize: number = 4) {
    this.width = width
    this.height = height
    this.poolSize = Math.min(poolSize, navigator.hardwareConcurrency || 4)
    this.maxConcurrent = this.poolSize * 2 // Allow queuing 2x pool size
    
    logger.info(`Initializing worker pool with ${this.poolSize} workers`)
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const initPromises: Promise<void>[] = []

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(
        new URL('./frame-processor.worker.ts', import.meta.url),
        { type: 'module' }
      )

      const workerInstance: WorkerInstance = {
        worker,
        busy: false,
        id: i
      }

      this.workers.push(workerInstance)

      // Initialize worker
      const initPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${i} initialization timeout`))
        }, 5000)

        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'initialized') {
            clearTimeout(timeout)
            worker.removeEventListener('message', handleMessage)
            resolve()
          }
        }

        worker.addEventListener('message', handleMessage)
        worker.postMessage({
          type: 'init',
          width: this.width,
          height: this.height
        })
      })

      initPromises.push(initPromise)
    }

    await Promise.all(initPromises)
    this.initialized = true
    
    logger.info('Worker pool initialized successfully')
  }

  /**
   * Process a frame using an available worker
   */
  async processFrame(task: FrameTask): Promise<ProcessedFrame> {
    if (!this.initialized) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      // Add to queue
      this.taskQueue.push({ task, resolve, reject })
      this.processNextTask()
    })
  }

  /**
   * Process frames in batch for better throughput
   */
  async processFrameBatch(tasks: FrameTask[]): Promise<ProcessedFrame[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    const promises = tasks.map(task => this.processFrame(task))
    return Promise.all(promises)
  }

  /**
   * Process the next task in queue
   */
  private processNextTask(): void {
    if (this.taskQueue.length === 0) return
    if (this.processingCount >= this.maxConcurrent) return

    // Find available worker
    const availableWorker = this.workers.find(w => !w.busy)
    if (!availableWorker) return

    // Get next task
    const taskItem = this.taskQueue.shift()
    if (!taskItem) return

    const { task, resolve, reject } = taskItem

    // Mark worker as busy
    availableWorker.busy = true
    this.processingCount++

    // Setup timeout
    const timeout = setTimeout(() => {
      availableWorker.busy = false
      this.processingCount--
      reject(new Error(`Frame processing timeout for ${task.id}`))
      this.processNextTask()
    }, 10000)

    // Setup message handler
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'processed' && event.data.frameId === task.id) {
        clearTimeout(timeout)
        availableWorker.worker.removeEventListener('message', handleMessage)
        availableWorker.busy = false
        this.processingCount--

        resolve({
          id: event.data.frameId,
          bitmap: event.data.bitmap,
          timestamp: event.data.timestamp
        })

        // Process next task
        this.processNextTask()
      } else if (event.data.type === 'error' && event.data.frameId === task.id) {
        clearTimeout(timeout)
        availableWorker.worker.removeEventListener('message', handleMessage)
        availableWorker.busy = false
        this.processingCount--

        reject(new Error(event.data.error))
        this.processNextTask()
      }
    }

    availableWorker.worker.addEventListener('message', handleMessage)

    // Send task to worker
    availableWorker.worker.postMessage({
      type: 'process',
      frameId: task.id,
      bitmap: task.bitmap,
      effects: task.effects,
      timestamp: task.timestamp,
      metadata: task.metadata
    }, [task.bitmap])
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number
    busyWorkers: number
    queueLength: number
    processingCount: number
  } {
    return {
      poolSize: this.poolSize,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      processingCount: this.processingCount
    }
  }

  /**
   * Terminate all workers
   */
  async terminate(): Promise<void> {
    // Clear queue
    this.taskQueue.forEach(({ reject }) => {
      reject(new Error('Worker pool terminated'))
    })
    this.taskQueue = []

    // Terminate workers
    const terminatePromises = this.workers.map(({ worker }) => {
      return new Promise<void>((resolve) => {
        worker.postMessage({ type: 'terminate' })
        setTimeout(resolve, 100)
        worker.terminate()
      })
    })

    await Promise.all(terminatePromises)
    this.workers = []
    this.initialized = false
    
    logger.info('Worker pool terminated')
  }
}

/**
 * Create optimized worker pool based on system capabilities
 */
export function createOptimizedWorkerPool(
  width: number,
  height: number
): WorkerPool {
  const cores = navigator.hardwareConcurrency || 4
  
  // Use 50-75% of cores for workers, leave some for main thread and encoder
  const optimalPoolSize = Math.max(2, Math.floor(cores * 0.6))
  
  logger.info(`Creating worker pool: ${optimalPoolSize} workers for ${cores} cores`)
  
  return new WorkerPool(width, height, optimalPoolSize)
}
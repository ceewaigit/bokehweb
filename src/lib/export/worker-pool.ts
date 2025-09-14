/**
 * Worker Pool Manager for parallel frame rendering
 * Manages a pool of Web Workers for efficient multi-threaded processing
 */

import { logger } from '@/lib/utils/logger'

export interface WorkerTask {
  id: string
  data: any
  priority?: number
  resolve: (value: any) => void
  reject: (error: any) => void
}

export interface WorkerInstance {
  id: number
  worker: Worker
  busy: boolean
  currentTask: WorkerTask | null
}

export class WorkerPool {
  private workers: WorkerInstance[] = []
  private taskQueue: WorkerTask[] = []
  private workerScript: string
  private maxWorkers: number
  private initialized = false
  private disposed = false
  
  constructor(workerScript: string, maxWorkers?: number) {
    this.workerScript = workerScript
    this.maxWorkers = maxWorkers || navigator.hardwareConcurrency || 4
    
    // Cap at 8 workers for memory efficiency
    this.maxWorkers = Math.min(this.maxWorkers, 8)
    
    logger.info(`Worker pool created with max ${this.maxWorkers} workers`)
  }
  
  /**
   * Initialize the worker pool
   */
  async initialize(initData?: any): Promise<void> {
    if (this.initialized) return
    
    try {
      // Create worker script blob
      const workerBlob = new Blob([this.workerScript], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(workerBlob)
      
      // Create workers
      const initPromises: Promise<void>[] = []
      
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = new Worker(workerUrl, { type: 'module' })
        const workerInstance: WorkerInstance = {
          id: i,
          worker,
          busy: false,
          currentTask: null
        }
        
        // Set up message handler
        worker.addEventListener('message', (event) => {
          this.handleWorkerMessage(workerInstance, event)
        })
        
        // Set up error handler
        worker.addEventListener('error', (error) => {
          this.handleWorkerError(workerInstance, error)
        })
        
        this.workers.push(workerInstance)
        
        // Initialize worker
        if (initData) {
          initPromises.push(this.initializeWorker(workerInstance, initData))
        }
      }
      
      // Wait for all workers to initialize
      await Promise.all(initPromises)
      
      this.initialized = true
      logger.info(`Worker pool initialized with ${this.workers.length} workers`)
      
      // Clean up blob URL
      URL.revokeObjectURL(workerUrl)
    } catch (error) {
      logger.error('Failed to initialize worker pool:', error)
      throw error
    }
  }
  
  /**
   * Initialize a single worker
   */
  private initializeWorker(worker: WorkerInstance, initData: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'INIT_COMPLETE') {
          worker.worker.removeEventListener('message', handler)
          resolve()
        } else if (event.data.type === 'ERROR') {
          worker.worker.removeEventListener('message', handler)
          reject(new Error(event.data.error))
        }
      }
      
      worker.worker.addEventListener('message', handler)
      worker.worker.postMessage({ type: 'INIT', ...initData })
    })
  }
  
  /**
   * Execute a task on an available worker
   */
  async execute<T = any>(data: any, priority: number = 0): Promise<T> {
    if (this.disposed) {
      throw new Error('Worker pool has been disposed')
    }
    
    if (!this.initialized) {
      await this.initialize()
    }
    
    return new Promise((resolve, reject) => {
      const task: WorkerTask = {
        id: `task-${Date.now()}-${Math.random()}`,
        data,
        priority,
        resolve,
        reject
      }
      
      // Try to find an available worker
      const availableWorker = this.workers.find(w => !w.busy)
      
      if (availableWorker) {
        this.assignTask(availableWorker, task)
      } else {
        // Add to queue if no workers available
        this.addToQueue(task)
      }
    })
  }
  
  /**
   * Execute multiple tasks in parallel
   */
  async executeMany<T = any>(tasks: any[]): Promise<T[]> {
    const promises = tasks.map(task => this.execute<T>(task))
    return Promise.all(promises)
  }
  
  /**
   * Add task to priority queue
   */
  private addToQueue(task: WorkerTask): void {
    // Insert task based on priority (higher priority first)
    const index = this.taskQueue.findIndex(t => (t.priority || 0) < (task.priority || 0))
    
    if (index === -1) {
      this.taskQueue.push(task)
    } else {
      this.taskQueue.splice(index, 0, task)
    }
    
    logger.debug(`Task queued. Queue size: ${this.taskQueue.length}`)
  }
  
  /**
   * Assign a task to a worker
   */
  private assignTask(worker: WorkerInstance, task: WorkerTask): void {
    worker.busy = true
    worker.currentTask = task
    
    // Send task to worker
    if (task.data.transferables) {
      worker.worker.postMessage(task.data, task.data.transferables)
    } else {
      worker.worker.postMessage(task.data)
    }
    
    logger.debug(`Task ${task.id} assigned to worker ${worker.id}`)
  }
  
  /**
   * Handle message from worker
   */
  private handleWorkerMessage(worker: WorkerInstance, event: MessageEvent): void {
    const { data } = event
    
    if (data.type === 'FRAME_COMPLETE' || data.type === 'TASK_COMPLETE') {
      // Task completed successfully
      if (worker.currentTask) {
        worker.currentTask.resolve(data)
        this.completeTask(worker)
      }
    } else if (data.type === 'ERROR') {
      // Task failed
      if (worker.currentTask) {
        worker.currentTask.reject(new Error(data.error))
        this.completeTask(worker)
      }
    } else if (data.type === 'PROGRESS') {
      // Progress update (can be forwarded if needed)
      logger.debug(`Worker ${worker.id} progress: ${data.progress}`)
    }
  }
  
  /**
   * Handle worker error
   */
  private handleWorkerError(worker: WorkerInstance, error: ErrorEvent): void {
    logger.error(`Worker ${worker.id} error:`, error)
    
    if (worker.currentTask) {
      worker.currentTask.reject(error)
      this.completeTask(worker)
    }
    
    // Restart worker if it crashed
    this.restartWorker(worker)
  }
  
  /**
   * Complete current task and check queue
   */
  private completeTask(worker: WorkerInstance): void {
    worker.busy = false
    worker.currentTask = null
    
    // Check if there are queued tasks
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift()
      if (nextTask) {
        this.assignTask(worker, nextTask)
      }
    }
  }
  
  /**
   * Restart a crashed worker
   */
  private async restartWorker(worker: WorkerInstance): Promise<void> {
    try {
      // Terminate old worker
      worker.worker.terminate()
      
      // Create new worker
      const workerBlob = new Blob([this.workerScript], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(workerBlob)
      const newWorker = new Worker(workerUrl, { type: 'module' })
      
      // Set up handlers
      newWorker.addEventListener('message', (event) => {
        this.handleWorkerMessage(worker, event)
      })
      
      newWorker.addEventListener('error', (error) => {
        this.handleWorkerError(worker, error)
      })
      
      // Update worker instance
      worker.worker = newWorker
      worker.busy = false
      worker.currentTask = null
      
      logger.info(`Worker ${worker.id} restarted`)
      
      // Clean up
      URL.revokeObjectURL(workerUrl)
    } catch (error) {
      logger.error(`Failed to restart worker ${worker.id}:`, error)
    }
  }
  
  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number
    busyWorkers: number
    idleWorkers: number
    queuedTasks: number
  } {
    const busyWorkers = this.workers.filter(w => w.busy).length
    
    return {
      totalWorkers: this.workers.length,
      busyWorkers,
      idleWorkers: this.workers.length - busyWorkers,
      queuedTasks: this.taskQueue.length
    }
  }
  
  /**
   * Dispose of all workers
   */
  dispose(): void {
    if (this.disposed) return
    
    this.disposed = true
    
    // Clear queue
    this.taskQueue.forEach(task => {
      task.reject(new Error('Worker pool disposed'))
    })
    this.taskQueue = []
    
    // Terminate all workers
    this.workers.forEach(worker => {
      worker.worker.terminate()
    })
    this.workers = []
    
    logger.info('Worker pool disposed')
  }
}

/**
 * Create a worker pool from a URL
 */
export async function createWorkerPool(
  workerUrl: string,
  maxWorkers?: number
): Promise<WorkerPool> {
  const response = await fetch(workerUrl)
  const workerScript = await response.text()
  return new WorkerPool(workerScript, maxWorkers)
}

// Worker pool singleton management removed - handled directly in export engine
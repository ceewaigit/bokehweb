/**
 * Performance Monitor
 * Tracks and reports export performance metrics
 */

import { logger } from '@/lib/utils/logger'

export interface PerformanceMetrics {
  frameRate: number
  frameTime: number
  cpuUsage: number
  memoryUsage: number
  gpuUsage: number
  encoderQueueDepth: number
  workerPoolUtilization: number
  totalFrames: number
  droppedFrames: number
  averageFrameTime: number
  p95FrameTime: number
  p99FrameTime: number
}

export interface PerformanceStats {
  avgFps: number
  minFps: number
  maxFps: number
  avgFrameTime: number
  p95FrameTime: number
  p99FrameTime: number
  totalFrames: number
  droppedFrames: number
  gpuAccelerated: boolean
  webglEnabled: boolean
  workersEnabled: boolean
}

export class PerformanceMonitor {
  private frameTimes: number[] = []
  private frameStartTimes = new Map<string, number>()
  private totalFrames = 0
  private droppedFrames = 0
  private startTime = 0
  private lastReportTime = 0
  private reportInterval = 1000 // Report every second
  private maxSamples = 1000
  
  // Performance observers
  private memoryInfo: any = null
  private isMonitoring = false

  constructor() {
    // Check for memory info API
    if ('memory' in performance) {
      this.memoryInfo = (performance as any).memory
    }
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.isMonitoring = true
    this.startTime = performance.now()
    this.lastReportTime = this.startTime
    this.frameTimes = []
    this.frameStartTimes.clear()
    this.totalFrames = 0
    this.droppedFrames = 0
    
    logger.info('Performance monitoring started')
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false
    const duration = performance.now() - this.startTime
    
    logger.info(`Performance monitoring stopped. Duration: ${duration.toFixed(2)}ms`)
    this.reportFinalMetrics()
  }

  /**
   * Mark frame start
   */
  frameStart(frameId: string): void {
    if (!this.isMonitoring) return
    this.frameStartTimes.set(frameId, performance.now())
  }

  /**
   * Mark frame end
   */
  frameEnd(frameId: string): void {
    if (!this.isMonitoring) return
    
    const startTime = this.frameStartTimes.get(frameId)
    if (!startTime) return
    
    const frameTime = performance.now() - startTime
    this.frameTimes.push(frameTime)
    this.frameStartTimes.delete(frameId)
    this.totalFrames++
    
    // Keep sample size manageable
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift()
    }
    
    // Check if we should report (reduced frequency)
    const now = performance.now()
    if (now - this.lastReportTime >= this.reportInterval * 2) { // Report less frequently
      this.report()
      this.lastReportTime = now
    }
  }

  /**
   * Mark dropped frame
   */
  frameDropped(): void {
    if (!this.isMonitoring) return
    this.droppedFrames++
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    const sortedFrameTimes = [...this.frameTimes].sort((a, b) => a - b)
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length || 0
    const p95Index = Math.floor(sortedFrameTimes.length * 0.95)
    const p99Index = Math.floor(sortedFrameTimes.length * 0.99)
    
    const duration = (performance.now() - this.startTime) / 1000
    const frameRate = this.totalFrames / duration
    
    return {
      frameRate,
      frameTime: avgFrameTime,
      cpuUsage: this.estimateCPUUsage(),
      memoryUsage: this.getMemoryUsage(),
      gpuUsage: this.estimateGPUUsage(),
      encoderQueueDepth: 0, // Would need encoder reference
      workerPoolUtilization: 0, // Would need worker pool reference
      totalFrames: this.totalFrames,
      droppedFrames: this.droppedFrames,
      averageFrameTime: avgFrameTime,
      p95FrameTime: sortedFrameTimes[p95Index] || 0,
      p99FrameTime: sortedFrameTimes[p99Index] || 0
    }
  }

  /**
   * Report current metrics
   */
  private report(): void {
    const metrics = this.getMetrics()
    
    logger.info('Performance Report:', {
      frameRate: `${metrics.frameRate.toFixed(2)} fps`,
      avgFrameTime: `${metrics.averageFrameTime.toFixed(2)} ms`,
      p95FrameTime: `${metrics.p95FrameTime.toFixed(2)} ms`,
      p99FrameTime: `${metrics.p99FrameTime.toFixed(2)} ms`,
      totalFrames: metrics.totalFrames,
      droppedFrames: metrics.droppedFrames,
      dropRate: `${((metrics.droppedFrames / metrics.totalFrames) * 100).toFixed(2)}%`,
      memory: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`,
      cpuEstimate: `${metrics.cpuUsage.toFixed(0)}%`,
      gpuEstimate: `${metrics.gpuUsage.toFixed(0)}%`
    })
  }

  /**
   * Report final metrics
   */
  private reportFinalMetrics(): void {
    const metrics = this.getMetrics()
    const duration = (performance.now() - this.startTime) / 1000
    
    logger.info('=== FINAL PERFORMANCE REPORT ===')
    logger.info(`Total Duration: ${duration.toFixed(2)} seconds`)
    logger.info(`Total Frames: ${metrics.totalFrames}`)
    logger.info(`Average FPS: ${metrics.frameRate.toFixed(2)}`)
    logger.info(`Average Frame Time: ${metrics.averageFrameTime.toFixed(2)} ms`)
    logger.info(`P95 Frame Time: ${metrics.p95FrameTime.toFixed(2)} ms`)
    logger.info(`P99 Frame Time: ${metrics.p99FrameTime.toFixed(2)} ms`)
    logger.info(`Dropped Frames: ${metrics.droppedFrames} (${((metrics.droppedFrames / metrics.totalFrames) * 100).toFixed(2)}%)`)
    logger.info(`Peak Memory: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`)
    logger.info('================================')
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): number {
    if (this.memoryInfo) {
      return this.memoryInfo.usedJSHeapSize || 0
    }
    return 0
  }

  /**
   * Estimate CPU usage based on frame times
   */
  private estimateCPUUsage(): number {
    if (this.frameTimes.length === 0) return 0
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    const targetFrameTime = 1000 / 30 // 30 fps target
    
    // Rough estimate: if we're taking longer than target, CPU is likely maxed
    const usage = Math.min(100, (avgFrameTime / targetFrameTime) * 100)
    return usage
  }

  /**
   * Estimate GPU usage (very rough approximation)
   */
  private estimateGPUUsage(): number {
    // This is a very rough estimate based on frame complexity
    // Real GPU usage would require browser extensions or native APIs
    if (this.frameTimes.length === 0) return 0
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    
    // If frame times are very low, GPU is likely being used efficiently
    if (avgFrameTime < 10) return 80 // Likely hardware accelerated
    if (avgFrameTime < 20) return 50 // Moderate GPU usage
    return 20 // Likely CPU-bound
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    const sortedFrameTimes = [...this.frameTimes].sort((a, b) => a - b)
    const count = sortedFrameTimes.length
    
    if (count === 0) {
      return {
        avgFps: 0,
        minFps: 0,
        maxFps: 0,
        avgFrameTime: 0,
        p95FrameTime: 0,
        p99FrameTime: 0,
        totalFrames: 0,
        droppedFrames: 0,
        gpuAccelerated: false,
        webglEnabled: false,
        workersEnabled: false
      }
    }
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / count
    const avgFps = 1000 / avgFrameTime
    const minFps = 1000 / Math.max(...sortedFrameTimes)
    const maxFps = 1000 / Math.min(...sortedFrameTimes)
    const p95FrameTime = sortedFrameTimes[Math.floor(count * 0.95)] || 0
    const p99FrameTime = sortedFrameTimes[Math.floor(count * 0.99)] || 0
    
    // Check for GPU and feature availability
    const settings = PerformanceMonitor.getOptimizedSettings()
    
    return {
      avgFps,
      minFps,
      maxFps,
      avgFrameTime,
      p95FrameTime,
      p99FrameTime,
      totalFrames: this.totalFrames,
      droppedFrames: this.droppedFrames,
      gpuAccelerated: settings.useGPU,
      webglEnabled: settings.useWebGL,
      workersEnabled: settings.useWorkers
    }
  }

  /**
   * Create optimized export settings based on system capabilities
   */
  static getOptimizedSettings(): {
    workerCount: number
    encoderQueueDepth: number
    frameBatchSize: number
    useWebGL: boolean
    useWorkers: boolean
    useGPU: boolean
  } {
    const cores = navigator.hardwareConcurrency || 4
    const memory = (performance as any).memory?.jsHeapSizeLimit || 2147483648
    const memoryGB = memory / 1024 / 1024 / 1024
    
    // Check WebGL2 support
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    const hasWebGL2 = !!gl
    
    // Check for GPU availability via WebCodecs
    const hasGPU = typeof VideoEncoder !== 'undefined' && cores > 2
    
    return {
      workerCount: Math.min(Math.max(2, Math.floor(cores * 0.5)), 4), // More conservative
      encoderQueueDepth: memoryGB > 4 ? 30 : 20, // Much lower to prevent stalls
      frameBatchSize: memoryGB > 4 ? 10 : 5, // Smaller batches
      useWebGL: false, // Disable WebGL for now - it may be causing crashes
      useWorkers: false, // Disable workers temporarily to isolate crash
      useGPU: hasGPU
    }
  }
}

// Global instance for easy access
export const performanceMonitor = new PerformanceMonitor()
/**
 * Export Performance Integration Test
 * Run this in Electron environment to test actual performance
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { WebCodecsExportEngine } from '../../src/lib/export/webcodecs-export-engine'
import { ExportFormat, QualityLevel, type ExportSettings, type TimelineSegment, type Clip, type Recording } from '../../src/types'
import { performanceMonitor } from '../../src/lib/export/performance-monitor'

describe('Export Performance', () => {
  let engine: WebCodecsExportEngine
  
  const mockSettings: ExportSettings = {
    format: ExportFormat.WEBM,
    quality: QualityLevel.High,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    bitrate: 5000000
  }
  
  beforeAll(() => {
    // Mock DOM environment for tests
    if (typeof document === 'undefined') {
      const { JSDOM } = require('jsdom')
      const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
      global.document = dom.window.document
      global.window = dom.window as any
      global.navigator = dom.window.navigator
      global.HTMLCanvasElement = dom.window.HTMLCanvasElement
      global.HTMLVideoElement = dom.window.HTMLVideoElement
      
      // Mock WebCodecs APIs
      global.VideoEncoder = class VideoEncoder {
        static isConfigSupported = jest.fn().mockResolvedValue({ supported: true })
        configure = jest.fn()
        encode = jest.fn()
        flush = jest.fn().mockResolvedValue(undefined)
        close = jest.fn()
        state = 'configured'
        encodeQueueSize = 0
      } as any
      
      global.VideoDecoder = class VideoDecoder {} as any
      global.VideoFrame = class VideoFrame {
        constructor(public source: any, public options: any) {}
        close = jest.fn()
      } as any
      
      global.OffscreenCanvas = class OffscreenCanvas {
        constructor(public width: number, public height: number) {}
        getContext = jest.fn().mockReturnValue({
          drawImage: jest.fn(),
          clearRect: jest.fn()
        })
        transferToImageBitmap = jest.fn()
      } as any
    }
    
    engine = new WebCodecsExportEngine()
  })
  
  afterAll(() => {
    performanceMonitor.stop()
  })
  
  it('should initialize without errors', async () => {
    expect(engine).toBeDefined()
  })
  
  it('should export with acceptable performance', async () => {
    performanceMonitor.start()
    
    const mockRecording: Recording = {
      id: 'test-recording',
      name: 'Test Recording',
      filePath: '/test/video.mp4',
      duration: 5000,
      createdAt: Date.now(),
      thumbnailPath: '/test/thumb.jpg',
      fileSize: 1000000,
      dimensions: { width: 1920, height: 1080 },
      hasAudio: false
    }
    
    const mockClip: Clip = {
      id: 'test-clip',
      recordingId: 'test-recording',
      startTime: 0,
      duration: 5000,
      sourceIn: 0,
      sourceOut: 5000,
      playbackRate: 1
    }
    
    const mockSegment: TimelineSegment = {
      id: 'test-segment',
      startTime: 0,
      endTime: 5000,
      clips: [{
        clip: mockClip,
        recording: mockRecording
      }],
      effects: []
    }
    
    const recordings = new Map([['test-recording', mockRecording]])
    const metadata = new Map()
    
    let lastProgress = 0
    const startTime = performance.now()
    
    try {
      const blob = await engine.export(
        [mockSegment],
        recordings,
        metadata,
        mockSettings,
        (progress) => {
          lastProgress = progress.progress
        }
      )
      
      const totalTime = performance.now() - startTime
      const stats = performanceMonitor.getStats()
      
      // Performance assertions
      expect(blob).toBeDefined()
      expect(lastProgress).toBeGreaterThanOrEqual(90)
      
      // Check frame rate - should be at least 20 fps for acceptable performance
      expect(stats.avgFps).toBeGreaterThanOrEqual(20)
      
      // Check frame time - should be under 100ms for acceptable performance
      expect(stats.avgFrameTime).toBeLessThan(100)
      
      // Log performance results
      console.log('Export Performance Results:')
      console.log(`  Average FPS: ${stats.avgFps.toFixed(1)}`)
      console.log(`  Average Frame Time: ${stats.avgFrameTime.toFixed(1)}ms`)
      console.log(`  P95 Frame Time: ${stats.p95FrameTime.toFixed(1)}ms`)
      console.log(`  Total Time: ${(totalTime / 1000).toFixed(2)}s`)
      console.log(`  GPU Accelerated: ${stats.gpuAccelerated}`)
      console.log(`  WebGL Enabled: ${stats.webglEnabled}`)
      console.log(`  Workers Enabled: ${stats.workersEnabled}`)
      
    } catch (error) {
      console.error('Export failed:', error)
      throw error
    }
  }, 30000) // 30 second timeout
  
  it('should utilize GPU when available', () => {
    const stats = performanceMonitor.getStats()
    
    // Check if GPU features are detected
    if (navigator.hardwareConcurrency > 2) {
      expect(stats.gpuAccelerated).toBe(true)
    }
  })
  
  it('should scale with CPU cores', () => {
    const settings = performanceMonitor.constructor.getOptimizedSettings()
    const cores = navigator.hardwareConcurrency || 4
    
    // Worker count should scale with cores
    expect(settings.workerCount).toBeGreaterThanOrEqual(2)
    expect(settings.workerCount).toBeLessThanOrEqual(cores)
    
    // Should enable workers on multi-core systems
    if (cores > 2) {
      expect(settings.useWorkers).toBe(true)
    }
  })
})
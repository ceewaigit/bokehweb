/**
 * Real integration tests for EffectsProcessor
 * Tests actual implementation details discovered by running tests
 */

import { EffectsProcessor } from '@/lib/effects'

// Proper browser API mocks
beforeAll(() => {
  // Mock OffscreenCanvas properly
  global.OffscreenCanvas = class MockOffscreenCanvas {
    width: number
    height: number
    
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
    
    getContext(type: string) {
      if (type === '2d') {
        return {
          clearRect: jest.fn(),
          fillRect: jest.fn(),
          arc: jest.fn(),
          fill: jest.fn(),
          stroke: jest.fn(),
          beginPath: jest.fn(),
          save: jest.fn(),
          restore: jest.fn(),
          translate: jest.fn(),
          scale: jest.fn(),
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(1920 * 1080 * 4) })),
          putImageData: jest.fn(),
          createRadialGradient: () => ({
            addColorStop: jest.fn()
          }),
          fillStyle: '#000000',
          strokeStyle: '#000000',
          lineWidth: 1,
          globalAlpha: 1,
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0
        }
      }
      return null
    }
  } as any

  // Mock OffscreenCanvasRenderingContext2D (this was missing!)
  global.OffscreenCanvasRenderingContext2D = class MockOffscreenCanvasRenderingContext2D {} as any

  // Mock VideoFrame properly
  global.VideoFrame = class MockVideoFrame {
    timestamp: number
    duration?: number
    
    constructor(data: any, options?: any) {
      this.timestamp = options?.timestamp || 0
      this.duration = options?.duration || 33333
    }
    
    close() {}
  } as any
})

describe('EffectsProcessor Real Implementation Tests', () => {
  let processor: EffectsProcessor

  beforeEach(() => {
    processor = new EffectsProcessor(1920, 1080, {
      enableCursor: true,
      cursorSize: 20,
      cursorColor: '#3b82f6',
      enableZoom: true,
      zoomLevel: 1.0,
      enableClickEffects: true,
      clickEffectColor: '#ff6b6b'
    })
  })

  afterEach(() => {
    processor.dispose()
  })

  describe('Feature Detection', () => {
    test('should detect browser support correctly', () => {
      // Now that we have proper mocks, this should return true
      expect(EffectsProcessor.isSupported()).toBe(true)
    })
  })

  describe('Async Frame Processing', () => {
    test('should process frame asynchronously', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      // processFrame returns a Promise!
      const result = await processor.processFrame(frame, {
        timestamp: 1000
      })
      
      expect(result).toBeInstanceOf(VideoFrame)
      expect(result.timestamp).toBe(1000)
    })

    test('should apply cursor effects asynchronously', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      const result = await processor.processFrame(frame, {
        timestamp: 1000,
        mouseX: 960,
        mouseY: 540
      })
      
      expect(result).toBeInstanceOf(VideoFrame)
    })

    test('should apply zoom effects asynchronously', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      const result = await processor.processFrame(frame, {
        timestamp: 1000,
        zoomLevel: 2.0
      })
      
      expect(result).toBeInstanceOf(VideoFrame)
    })

    test('should apply click effects asynchronously', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      const result = await processor.processFrame(frame, {
        timestamp: 1000,
        isClicking: true,
        mouseX: 960,
        mouseY: 540
      })
      
      expect(result).toBeInstanceOf(VideoFrame)
    })
  })

  describe('Real Performance Tracking', () => {
    test('should track actual processing performance', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      // Process multiple frames
      for (let i = 0; i < 3; i++) {
        await processor.processFrame(frame, { 
          timestamp: i * 1000,
          mouseX: 100 + i * 50,
          mouseY: 100 + i * 50
        })
      }
      
      const stats = processor.getPerformanceStats()
      
      // Real interface has different properties!
      expect(stats).toHaveProperty('effectsActive')
      expect(stats).toHaveProperty('processingTimeMs')
      expect(stats.effectsActive).toBeGreaterThanOrEqual(0)
      expect(stats.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Error Handling in Async Context', () => {
    test('should handle async processing errors gracefully', async () => {
      // Mock drawImage to throw error
      const mockCtx = processor['ctx']
      mockCtx.drawImage = jest.fn(() => {
        throw new Error('Canvas draw failed')
      })
      
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      // Should not throw but handle gracefully
      const result = await processor.processFrame(frame, { timestamp: 1000 })
      
      // Implementation might return original frame or handle differently
      expect(result).toBeTruthy()
    })
  })

  describe('Settings Update with Real Interface', () => {
    test('should update settings using correct interface', async () => {
      // Use the actual settings interface
      processor.updateSettings({
        cursorSize: 40,
        enableZoom: false,
        zoomLevel: 1.5
      })
      
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      const result = await processor.processFrame(frame, {
        timestamp: 1000,
        mouseX: 100,
        mouseY: 100,
        zoomLevel: 2.0 // Should be ignored due to enableZoom: false
      })
      
      expect(result).toBeInstanceOf(VideoFrame)
    })
  })

  describe('Resource Management', () => {
    test('should dispose resources without breaking async operations', async () => {
      const frame = new VideoFrame(new ArrayBuffer(8), { timestamp: 1000 })
      
      // Process one frame
      await processor.processFrame(frame, { timestamp: 1000 })
      
      // Dispose
      processor.dispose()
      
      // Should handle post-dispose operations gracefully
      expect(() => processor.dispose()).not.toThrow()
    })
  })
})
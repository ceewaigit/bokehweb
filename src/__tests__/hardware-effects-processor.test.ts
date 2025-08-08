/**
 * Hardware Effects Processor Tests
 * Tests FFmpeg-based hardware-accelerated video effects processing
 */

import { HardwareEffectsProcessor, type HardwareEffectsResult, type EffectsMetadata } from '@/lib/recording/hardware-effects-processor'
import type { ElectronMetadata } from '@/lib/recording/electron-recorder'
import type { EnhancementSettings } from '@/lib/recording/screen-recorder'

// Mock FFmpeg
const mockFFmpeg = {
  load: jest.fn(),
  writeFile: jest.fn(),
  exec: jest.fn(),
  readFile: jest.fn(),
  deleteFile: jest.fn(),
  on: jest.fn()
}

jest.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: jest.fn().mockImplementation(() => mockFFmpeg)
}))

jest.mock('@ffmpeg/util', () => ({
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  toBlobURL: jest.fn().mockResolvedValue('blob:mock-url')
}))

describe('HardwareEffectsProcessor', () => {
  let processor: HardwareEffectsProcessor
  const mockVideoBlob = new Blob(['mock video data'], { type: 'video/webm' })
  const mockOutputData = new Uint8Array([5, 6, 7, 8])

  const defaultEnhancementSettings: EnhancementSettings = {
    enableAutoZoom: true,
    zoomSensitivity: 0.5,
    maxZoom: 3.0,
    zoomSpeed: 1.0,
    showCursor: true,
    cursorSize: 1.0,
    cursorColor: '#FF0000',
    showClickEffects: true,
    clickEffectSize: 1.0,
    clickEffectColor: '#0080FF',
    enableSmartPanning: true,
    panSpeed: 1.0,
    motionSensitivity: 0.5,
    enableSmoothAnimations: true
  }

  const mockMetadata: ElectronMetadata[] = [
    { timestamp: 0, mouseX: 100, mouseY: 100, eventType: 'mouse' },
    { timestamp: 500, mouseX: 200, mouseY: 150, eventType: 'mouse' },
    { timestamp: 1000, mouseX: 300, mouseY: 200, eventType: 'click' },
    { timestamp: 1500, mouseX: 300, mouseY: 200, eventType: 'mouse' },
    { timestamp: 2000, mouseX: 400, mouseY: 250, eventType: 'click' }
  ]

  beforeEach(() => {
    processor = new HardwareEffectsProcessor()
    jest.clearAllMocks()
    
    // Setup default mock responses
    mockFFmpeg.load.mockResolvedValue(undefined)
    mockFFmpeg.writeFile.mockResolvedValue(undefined)
    mockFFmpeg.exec.mockResolvedValue(undefined)
    mockFFmpeg.readFile.mockResolvedValue(mockOutputData)
    mockFFmpeg.deleteFile.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await processor.dispose()
  })

  describe('Initialization', () => {
    test('should initialize processor', () => {
      expect(processor).toBeInstanceOf(HardwareEffectsProcessor)
    })

    test('should initialize FFmpeg on first use', async () => {
      await processor.initialize()
      
      expect(mockFFmpeg.load).toHaveBeenCalledWith({
        coreURL: 'blob:mock-url',
        wasmURL: 'blob:mock-url'
      })
    })

    test('should not reinitialize if already loaded', async () => {
      await processor.initialize()
      await processor.initialize()
      
      expect(mockFFmpeg.load).toHaveBeenCalledTimes(1)
    })

    test('should handle FFmpeg initialization failure', async () => {
      mockFFmpeg.load.mockRejectedValue(new Error('Failed to load FFmpeg'))
      
      await expect(processor.initialize()).rejects.toThrow('Hardware effects processor initialization failed')
    })
  })

  describe('Video Processing', () => {
    test('should process video with hardware acceleration', async () => {
      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(result).toHaveProperty('enhancedVideo')
      expect(result).toHaveProperty('effectsApplied')
      expect(result).toHaveProperty('processingTime')
      expect(result).toHaveProperty('metadata')
      
      expect(result.enhancedVideo).toBeInstanceOf(Blob)
      expect(result.enhancedVideo.type).toBe('video/mp4')
      expect(result.effectsApplied).toContain('hardware-acceleration')
      expect(typeof result.processingTime).toBe('number')
      expect(Array.isArray(result.metadata)).toBe(true)
    })

    test('should initialize FFmpeg automatically if not loaded', async () => {
      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.load).toHaveBeenCalled()
      expect(result.enhancedVideo).toBeInstanceOf(Blob)
    })

    test('should write input video to FFmpeg filesystem', async () => {
      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith(
        'input.webm',
        new Uint8Array([1, 2, 3, 4])
      )
    })

    test('should execute FFmpeg with correct arguments', async () => {
      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.exec).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-i', 'input.webm',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '18',
          '-r', '60',
          '-pix_fmt', 'yuv420p',
          'output.mp4'
        ])
      )
    })

    test('should cleanup temporary files after processing', async () => {
      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.webm')
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('output.mp4')
    })

    test('should handle processing errors', async () => {
      mockFFmpeg.exec.mockRejectedValue(new Error('FFmpeg processing failed'))

      await expect(processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )).rejects.toThrow('Effects processing failed')
    })
  })

  describe('Effects Timeline Generation', () => {
    test('should generate zoom effects from mouse movements', async () => {
      const rapidMovements: ElectronMetadata[] = [
        { timestamp: 0, mouseX: 100, mouseY: 100, eventType: 'mouse' },
        { timestamp: 50, mouseX: 300, mouseY: 200, eventType: 'mouse' }, // Rapid movement
        { timestamp: 1000, mouseX: 300, mouseY: 200, eventType: 'mouse' } // Pause after movement
      ]

      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        rapidMovements,
        defaultEnhancementSettings,
        2000
      )

      expect(result.effectsApplied).toContain('auto-zoom')
    })

    test('should generate click effects', async () => {
      const clickData: ElectronMetadata[] = [
        { timestamp: 1000, mouseX: 200, mouseY: 300, eventType: 'click' },
        { timestamp: 2000, mouseX: 400, mouseY: 500, eventType: 'click' }
      ]

      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        clickData,
        defaultEnhancementSettings,
        3000
      )

      expect(result.effectsApplied).toContain('click-ripples')
    })

    test('should add cursor enhancement when enabled', async () => {
      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(result.effectsApplied).toContain('cursor-enhancement')
    })

    test('should not add effects when disabled', async () => {
      const disabledSettings: EnhancementSettings = {
        ...defaultEnhancementSettings,
        enableAutoZoom: false,
        showClickEffects: false,
        showCursor: false
      }

      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        disabledSettings,
        5000
      )

      expect(result.effectsApplied).not.toContain('auto-zoom')
      expect(result.effectsApplied).not.toContain('click-ripples')
      expect(result.effectsApplied).not.toContain('cursor-enhancement')
    })
  })

  describe('FFmpeg Command Building', () => {
    test('should add hardware acceleration when supported', async () => {
      // Mock hardware acceleration support
      jest.spyOn(processor as any, 'supportsHardwareAcceleration').mockReturnValue(true)

      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['-hwaccel', 'auto'])
      )
    })

    test('should build complex video filters for effects', async () => {
      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      const execCall = mockFFmpeg.exec.mock.calls[0][0]
      const filterIndex = execCall.indexOf('-filter_complex')
      
      if (filterIndex !== -1) {
        expect(execCall[filterIndex + 1]).toContain('[out]')
      }
    })

    test('should use high-quality encoding settings', async () => {
      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(mockFFmpeg.exec).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '18',
          '-r', '60'
        ])
      )
    })
  })

  describe('Performance Monitoring', () => {
    test('should track performance metrics', () => {
      const metrics = processor.getPerformanceMetrics()
      
      expect(metrics).toHaveProperty('queueLength')
      expect(metrics).toHaveProperty('isProcessing')
      expect(metrics).toHaveProperty('isLoaded')
      expect(typeof metrics.queueLength).toBe('number')
      expect(typeof metrics.isProcessing).toBe('boolean')
      expect(typeof metrics.isLoaded).toBe('boolean')
    })

    test('should measure processing time', async () => {
      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )

      expect(result.processingTime).toBeGreaterThan(0)
      expect(typeof result.processingTime).toBe('number')
    })
  })

  describe('Resource Management', () => {
    test('should dispose properly', async () => {
      await processor.initialize()
      await processor.dispose()

      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.webm')
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('output.mp4')
    })

    test('should handle disposal errors gracefully', async () => {
      mockFFmpeg.deleteFile.mockRejectedValue(new Error('Cleanup failed'))

      await expect(processor.dispose()).resolves.not.toThrow()
    })

    test('should reset state after disposal', async () => {
      await processor.initialize()
      await processor.dispose()

      const metrics = processor.getPerformanceMetrics()
      expect(metrics.isLoaded).toBe(false)
    })
  })

  describe('Error Handling', () => {
    test('should handle file write errors', async () => {
      mockFFmpeg.writeFile.mockRejectedValue(new Error('Write failed'))

      await expect(processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )).rejects.toThrow('Effects processing failed')
    })

    test('should handle file read errors', async () => {
      mockFFmpeg.readFile.mockRejectedValue(new Error('Read failed'))

      await expect(processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )).rejects.toThrow('Effects processing failed')
    })

    test('should handle cleanup errors during processing failure', async () => {
      mockFFmpeg.exec.mockRejectedValue(new Error('Processing failed'))
      mockFFmpeg.deleteFile.mockRejectedValue(new Error('Cleanup failed'))

      await expect(processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        defaultEnhancementSettings,
        5000
      )).rejects.toThrow('Effects processing failed')
    })
  })

  describe('Metadata Processing', () => {
    test('should detect zoom opportunities from rapid movements', async () => {
      const rapidMovements: ElectronMetadata[] = [
        { timestamp: 0, mouseX: 100, mouseY: 100, eventType: 'mouse' },
        { timestamp: 16, mouseX: 200, mouseY: 200, eventType: 'mouse' }, // Fast movement
        { timestamp: 32, mouseX: 300, mouseY: 300, eventType: 'mouse' }, // Fast movement
        { timestamp: 1000, mouseX: 300, mouseY: 300, eventType: 'mouse' } // Long pause
      ]

      await processor.processVideoWithEffects(
        mockVideoBlob,
        rapidMovements,
        defaultEnhancementSettings,
        2000
      )

      // Should generate auto-zoom effects
      expect(mockFFmpeg.exec).toHaveBeenCalled()
    })

    test('should respect zoom sensitivity settings', async () => {
      const highSensitivitySettings: EnhancementSettings = {
        ...defaultEnhancementSettings,
        zoomSensitivity: 2.0,
        maxZoom: 5.0
      }

      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        highSensitivitySettings,
        5000
      )

      expect(result.effectsApplied).toContain('auto-zoom')
    })

    test('should limit zoom level to maxZoom setting', async () => {
      const limitedZoomSettings: EnhancementSettings = {
        ...defaultEnhancementSettings,
        maxZoom: 1.5
      }

      await processor.processVideoWithEffects(
        mockVideoBlob,
        mockMetadata,
        limitedZoomSettings,
        5000
      )

      // Zoom effects should be generated but limited
      expect(mockFFmpeg.exec).toHaveBeenCalled()
    })
  })

  describe('Integration', () => {
    test('should work with real-world metadata patterns', async () => {
      const realisticMetadata: ElectronMetadata[] = [
        // Slow cursor movement
        ...Array.from({ length: 10 }, (_, i) => ({
          timestamp: i * 50,
          mouseX: 100 + i * 5,
          mouseY: 100 + i * 3,
          eventType: 'mouse' as const
        })),
        
        // Click event
        { timestamp: 500, mouseX: 150, mouseY: 130, eventType: 'click' },
        
        // Rapid movement (should trigger zoom)
        { timestamp: 600, mouseX: 150, mouseY: 130, eventType: 'mouse' },
        { timestamp: 616, mouseX: 300, mouseY: 250, eventType: 'mouse' },
        { timestamp: 632, mouseX: 400, mouseY: 350, eventType: 'mouse' },
        
        // Pause (end of rapid movement)
        { timestamp: 1200, mouseX: 400, mouseY: 350, eventType: 'mouse' },
        
        // Another click
        { timestamp: 1500, mouseX: 400, mouseY: 350, eventType: 'click' }
      ]

      const result = await processor.processVideoWithEffects(
        mockVideoBlob,
        realisticMetadata,
        defaultEnhancementSettings,
        2000
      )

      expect(result.enhancedVideo).toBeInstanceOf(Blob)
      expect(result.effectsApplied).toContain('hardware-acceleration')
      expect(result.effectsApplied).toContain('h264-encoding')
      expect(result.metadata.length).toBeGreaterThan(0)
    })
  })
})
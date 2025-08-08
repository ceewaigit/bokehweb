/**
 * Unit tests for MediaRecorderManager
 * Tests the MediaRecorder lifecycle management component
 */

import { MediaRecorderManager, type MediaRecorderResult } from '@/lib/recording/media-recorder-manager'
import type { RecordingSettings } from '@/types'

// Mock MediaRecorder
global.MediaRecorder = class MockMediaRecorder {
  state = 'inactive'
  mimeType: string
  ondataavailable: ((event: any) => void) | null = null
  onstop: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onstart: ((event: any) => void) | null = null

  constructor(stream: any, options?: any) {
    this.mimeType = options?.mimeType || 'video/webm'
  }

  start(timeslice?: number) {
    this.state = 'recording'
    if (this.onstart) this.onstart(new Event('start'))
    
    // Simulate data chunks
    setTimeout(() => {
      if (this.ondataavailable) {
        const chunk = new Blob(['test video data'], { type: this.mimeType })
        const event = new Event('dataavailable')
        ;(event as any).data = chunk
        this.ondataavailable(event)
      }
    }, 10)
  }

  stop() {
    this.state = 'inactive'
    setTimeout(() => {
      if (this.onstop) this.onstop(new Event('stop'))
    }, 10)
  }

  pause() {
    this.state = 'paused'
  }

  resume() {
    this.state = 'recording'
  }

  static isTypeSupported(type: string) {
    return ['video/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].includes(type)
  }
} as any

// Mock MediaStream
const createMockStream = () => ({
  getTracks: () => [{ stop: jest.fn() }],
  getVideoTracks: () => [{ stop: jest.fn() }],
  getAudioTracks: () => [{ stop: jest.fn() }]
})

describe('MediaRecorderManager', () => {
  let manager: MediaRecorderManager
  let mockStream: any

  beforeEach(() => {
    mockStream = createMockStream()
    manager = new MediaRecorderManager(mockStream)
    jest.clearAllMocks()
  })

  describe('Initialization', () => {
    test('should initialize with provided stream', () => {
      expect(manager).toBeInstanceOf(MediaRecorderManager)
      expect(manager.isRecording()).toBe(false)
    })
  })

  describe('Recording Lifecycle', () => {
    test('should start recording with default settings', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      expect(manager.isRecording()).toBe(false)
      
      await manager.start(settings)
      
      expect(manager.isRecording()).toBe(true)
    })

    test('should stop recording and return result', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'medium',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      expect(manager.isRecording()).toBe(true)

      const result = await manager.stop()
      
      expect(manager.isRecording()).toBe(false)
      expect(result).toHaveProperty('video')
      expect(result).toHaveProperty('duration')
      expect(result.video).toBeInstanceOf(Blob)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    })

    test('should throw error when starting while already recording', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      
      await expect(manager.start(settings)).rejects.toThrow('Already recording')
    })

    test('should throw error when stopping while not recording', async () => {
      expect(manager.isRecording()).toBe(false)
      
      await expect(manager.stop()).rejects.toThrow('Not recording')
    })
  })

  describe('Pause and Resume', () => {
    test('should pause recording', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      expect(manager.isPaused()).toBe(false)
      
      manager.pause()
      expect(manager.isPaused()).toBe(true)
    })

    test('should resume recording', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      manager.pause()
      expect(manager.isPaused()).toBe(true)
      
      manager.resume()
      expect(manager.isPaused()).toBe(false)
    })

    test('should handle pause when not recording', () => {
      expect(() => manager.pause()).not.toThrow()
      expect(manager.isPaused()).toBe(false)
    })

    test('should handle resume when not paused', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      expect(() => manager.resume()).not.toThrow()
      expect(manager.isPaused()).toBe(false)
    })
  })

  describe('Duration Tracking', () => {
    test('should track recording duration', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      expect(manager.getDuration()).toBe(0)
      
      await manager.start(settings)
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const duration = manager.getDuration()
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(1000) // Should be less than 1 second
    })
  })

  describe('Quality Settings', () => {
    test('should handle different quality settings', async () => {
      const qualities = ['low', 'medium', 'high']

      for (const quality of qualities) {
        const testManager = new MediaRecorderManager(createMockStream())
        const settings: RecordingSettings = {
          area: 'fullscreen',
          audioInput: 'system',
          quality: quality as any,
          framerate: 30,
          format: 'webm'
        }

        await testManager.start(settings)
        expect(testManager.isRecording()).toBe(true)
        
        const result = await testManager.stop()
        expect(result.video).toBeInstanceOf(Blob)
      }
    })

    test('should handle different formats', async () => {
      const formats = ['webm', 'mp4']

      for (const format of formats) {
        const testManager = new MediaRecorderManager(createMockStream())
        const settings: RecordingSettings = {
          area: 'fullscreen',
          audioInput: 'system',
          quality: 'high',
          framerate: 30,
          format: format as any
        }

        await testManager.start(settings)
        const result = await testManager.stop()
        expect(result.video.type).toMatch(/^video\//)
      }
    })
  })

  describe('Error Handling', () => {
    test('should handle MediaRecorder creation failure', async () => {
      // Mock MediaRecorder constructor to fail
      const originalMediaRecorder = global.MediaRecorder
      global.MediaRecorder = jest.fn().mockImplementation(() => {
        throw new Error('MediaRecorder not supported')
      }) as any
      global.MediaRecorder.isTypeSupported = jest.fn().mockReturnValue(true)

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await expect(manager.start(settings)).rejects.toThrow('MediaRecorder not supported')
      
      // Restore
      global.MediaRecorder = originalMediaRecorder
    })

    test('should handle unsupported codec', async () => {
      // Mock all codecs as unsupported
      const originalIsTypeSupported = global.MediaRecorder.isTypeSupported
      global.MediaRecorder.isTypeSupported = jest.fn().mockReturnValue(false)

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await expect(manager.start(settings)).rejects.toThrow('No supported video codec found')
      
      // Restore
      global.MediaRecorder.isTypeSupported = originalIsTypeSupported
    })
  })

  describe('Blob Handling', () => {
    test('should create blob with correct MIME type', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.start(settings)
      const result = await manager.stop()
      
      expect(result.video.type).toMatch(/^video\/webm/)
    })

    test('should handle empty recording', async () => {
      // Create a MediaRecorder that doesn't produce data
      global.MediaRecorder = class MockEmptyMediaRecorder {
        state = 'inactive'
        mimeType = 'video/webm'
        ondataavailable: ((event: any) => void) | null = null
        onstop: ((event: any) => void) | null = null

        constructor(stream: any, options?: any) {
          this.mimeType = options?.mimeType || 'video/webm'
        }

        start() {
          this.state = 'recording'
          // Don't produce any data
        }

        stop() {
          this.state = 'inactive'
          setTimeout(() => {
            if (this.onstop) this.onstop(new Event('stop'))
          }, 10)
        }

        pause() { this.state = 'paused' }
        resume() { this.state = 'recording' }
        static isTypeSupported() { return true }
      } as any

      const emptyManager = new MediaRecorderManager(createMockStream())
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await emptyManager.start(settings)
      const result = await emptyManager.stop()
      
      expect(result.video).toBeInstanceOf(Blob)
      expect(result.video.size).toBe(0) // Should be empty but valid
    })
  })
})
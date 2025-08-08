/**
 * REAL Recording Tests
 * Tests actual simplified ScreenRecorder class functionality - TRUE TDD
 */

import { ScreenRecorder } from '../lib/recording/screen-recorder'
import type { RecordingSettings } from '@/types'

// Store original Blob constructor
const OriginalBlob = global.Blob

// Mock browser APIs
Object.defineProperty(global, 'MediaRecorder', {
  value: class MockMediaRecorder {
    state = 'inactive'
    mimeType: string
    ondataavailable: ((event: any) => void) | null = null
    onstop: ((event: any) => void) | null = null
    onerror: ((event: any) => void) | null = null
    onstart: ((event: any) => void) | null = null
    private eventListeners: Map<string, ((event: any) => void)[]> = new Map()

    constructor(stream: any, options?: any) {
      this.mimeType = options?.mimeType || 'video/webm'
    }

    addEventListener(type: string, listener: (event: any) => void, options?: any) {
      if (!this.eventListeners.has(type)) {
        this.eventListeners.set(type, [])
      }
      this.eventListeners.get(type)!.push(listener)
    }

    removeEventListener(type: string, listener: (event: any) => void) {
      const listeners = this.eventListeners.get(type)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    }

    private dispatchEvent(type: string, event: any) {
      // Call traditional event handlers
      if (type === 'dataavailable' && this.ondataavailable) this.ondataavailable(event)
      if (type === 'stop' && this.onstop) this.onstop(event)
      if (type === 'start' && this.onstart) this.onstart(event)
      if (type === 'error' && this.onerror) this.onerror(event)

      // Call addEventListener listeners
      const listeners = this.eventListeners.get(type)
      if (listeners) {
        listeners.forEach(listener => listener(event))
      }
    }

    start() {
      this.state = 'recording'
      this.dispatchEvent('start', new Event('start'))
      
      // Simulate immediate data events
      const testData = new Array(1000).fill('test video data chunk').join(' ')
      const chunk = new Blob([testData], { type: this.mimeType })
      
      const blobEvent = new Event('dataavailable')
      ;(blobEvent as any).data = chunk
      this.dispatchEvent('dataavailable', blobEvent)
    }

    stop() {
      this.state = 'inactive'
      setTimeout(() => {
        this.dispatchEvent('stop', new Event('stop'))
      }, 50)
    }

    pause() {
      this.state = 'paused'
    }

    resume() {
      this.state = 'recording'
    }

    static isTypeSupported(type: string) {
      return ['video/webm', 'video/webm;codecs=vp9', 'video/mp4'].includes(type)
    }
  } as any,
  writable: true
})

Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: {
      getDisplayMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
        getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
      })
    }
  },
  writable: true
})

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    innerWidth: 1920,
    innerHeight: 1080,
    scrollX: 0,
    scrollY: 0
  },
  writable: true
})

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    createElement: jest.fn((tag: string) => ({
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
      style: {},
      id: ''
    })),
    body: {
      innerHTML: '',
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      children: []
    }
  },
  writable: true
})

describe('REAL Recording Tests - Simplified Implementation', () => {
  let recorder: ScreenRecorder
  const mockSettings: RecordingSettings = {
    format: 'webm',
    quality: 'high',
    framerate: 30,
    audioInput: 'none',
    area: 'fullscreen'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    recorder = new ScreenRecorder()
    
    // Reset navigator mock
    ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
      getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
    })
  })

  afterEach(() => {
    if (recorder && recorder.isRecording && recorder.isRecording()) {
      recorder.cleanup()
    }
  })

  describe('Recording Lifecycle', () => {
    test('should start recording successfully', async () => {
      await recorder.startRecording(mockSettings)
      
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      
      expect(recorder.isRecording()).toBe(true)
    })

    test('should stop recording and return result', async () => {
      await recorder.startRecording(mockSettings)
      
      const result = await recorder.stopRecording()
      
      expect(result).toHaveProperty('video')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('duration')
      expect(result.video).toBeInstanceOf(Blob)
      expect(Array.isArray(result.metadata)).toBe(true)
      expect(typeof result.duration).toBe('number')
    })

    test('should handle already recording error', async () => {
      await recorder.startRecording(mockSettings)
      
      await expect(recorder.startRecording(mockSettings))
        .rejects.toThrow('Already recording')
    })

    test('should return null when stopping while not recording', async () => {
      const result = await recorder.stopRecording()
      expect(result).toBeNull()
    })
  })

  describe('Recording Controls', () => {
    test('should pause and resume recording', async () => {
      await recorder.startRecording(mockSettings)
      
      recorder.pauseRecording()
      expect(recorder.getRecordingState().isPaused).toBe(true)
      
      recorder.resumeRecording()
      expect(recorder.getRecordingState().isPaused).toBe(false)
      
      await recorder.stopRecording()
    })

    test('should track recording duration', async () => {
      expect(recorder.getRecordingDurationMs()).toBe(0)
      
      await recorder.startRecording(mockSettings)
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const duration = recorder.getRecordingDurationMs()
      expect(duration).toBeGreaterThan(0)
      
      await recorder.stopRecording()
    })
  })

  describe('Audio Settings', () => {
    test('should handle audio input settings', async () => {
      const settingsWithAudio: RecordingSettings = {
        ...mockSettings,
        audioInput: 'system'
      }
      
      await recorder.startRecording(settingsWithAudio)
      
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      })
      
      await recorder.stopRecording()
    })
  })

  describe('Error Handling', () => {
    test('should handle permission denied', async () => {
      ;(navigator.mediaDevices.getDisplayMedia as jest.Mock)
        .mockRejectedValue(new Error('Permission denied'))
      
      await expect(recorder.startRecording(mockSettings))
        .rejects.toThrow('Failed to start recording: Error: Screen recording permission denied')
    })
  })

  describe('Static Methods', () => {
    test('should detect browser support', () => {
      const isSupported = ScreenRecorder.isSupported()
      expect(isSupported).toBe(true)
    })

    test('should get available sources', async () => {
      const sources = await ScreenRecorder.getAvailableSources()
      
      expect(Array.isArray(sources)).toBe(true)
      expect(sources.length).toBeGreaterThanOrEqual(2)
      expect(sources[0]).toEqual({
        id: 'screen:0',
        name: 'Entire Screen',
        type: 'screen'
      })
    })
  })

  describe('Backward Compatibility', () => {
    test('should support legacy stopRecordingCompat method', async () => {
      await recorder.startRecording(mockSettings)
      
      const result = await recorder.stopRecordingCompat()
      
      expect(result).toHaveProperty('enhanced')
      expect(result).toHaveProperty('original')
      expect(result.enhanced).toBeInstanceOf(Blob)
      expect(result.original).toBeInstanceOf(Blob)
    })

    test('should return null from stopRecordingCompat when not recording', async () => {
      const result = await recorder.stopRecordingCompat()
      expect(result).toBeNull()
    })
  })

  describe('State Management', () => {
    test('should report correct recording state', async () => {
      expect(recorder.isRecording()).toBe(false)
      
      const initialState = recorder.getRecordingState()
      expect(initialState.isRecording).toBe(false)
      expect(initialState.isPaused).toBe(false)
      expect(initialState.duration).toBe(0)
      
      await recorder.startRecording(mockSettings)
      
      const recordingState = recorder.getRecordingState()
      expect(recordingState.isRecording).toBe(true)
      expect(recordingState.isPaused).toBe(false)
      
      await recorder.stopRecording()
      
      const stoppedState = recorder.getRecordingState()
      expect(stoppedState.isRecording).toBe(false)
    })
  })

  describe('Cleanup', () => {
    test('should cleanup resources properly', async () => {
      await recorder.startRecording(mockSettings)
      
      recorder.cleanup()
      
      expect(recorder.isRecording()).toBe(false)
    })
  })
})
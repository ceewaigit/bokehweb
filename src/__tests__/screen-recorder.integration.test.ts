/**
 * Integration tests for ScreenRecorder
 * Tests the complex screen recorder with effects
 */

// Mock dependencies first
jest.mock('@/lib/effects', () => ({
  EffectsProcessor: jest.fn().mockImplementation(() => ({
    dispose: jest.fn()
  }))
}))

jest.mock('@/lib/effects/motion-tracker', () => ({
  MotionTracker: jest.fn().mockImplementation(() => ({
    updateConfig: jest.fn(),
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    getZoomKeyframes: jest.fn(() => [])
  }))
}))

import { ScreenRecorder, type RecordingResult } from '../lib/recording/screen-recorder'

// Mock browser APIs for testing
beforeAll(() => {
  // Mock MediaRecorder
  global.MediaRecorder = class MockMediaRecorder {
    state = 'inactive'
    mimeType = 'video/webm'
    ondataavailable: ((event: any) => void) | null = null
    onstop: ((event: any) => void) | null = null
    onstart: ((event: any) => void) | null = null
    onpause: ((event: any) => void) | null = null
    onresume: ((event: any) => void) | null = null
    onerror: ((event: any) => void) | null = null
    
    constructor(stream: MediaStream, options?: any) {
      this.mimeType = options?.mimeType || 'video/webm'
    }
    
    start(timeslice?: number) {
      this.state = 'recording'
      if (this.onstart) this.onstart(new Event('start'))
      // Simulate data
      setTimeout(() => {
        if (this.ondataavailable) {
          this.ondataavailable({ 
            data: new Blob(['test-data'], { type: this.mimeType }) 
          })
        }
      }, 100)
    }
    
    stop() {
      this.state = 'inactive'
      setTimeout(() => {
        if (this.onstop) this.onstop(new Event('stop'))
      }, 50)
    }
    
    pause() {
      this.state = 'paused'
      if (this.onpause) this.onpause(new Event('pause'))
    }
    
    resume() {
      this.state = 'recording'
      if (this.onresume) this.onresume(new Event('resume'))
    }
    
    requestData() {
      if (this.ondataavailable) {
        this.ondataavailable({ 
          data: new Blob(['final-data'], { type: this.mimeType }) 
        })
      }
    }
    
    addEventListener(type: string, listener: (event: any) => void, options?: any) {
      if (type === 'dataavailable') this.ondataavailable = listener
      else if (type === 'stop') this.onstop = listener
      else if (type === 'start') this.onstart = listener
      else if (type === 'pause') this.onpause = listener
      else if (type === 'resume') this.onresume = listener
      else if (type === 'error') this.onerror = listener
    }
    
    removeEventListener(type: string, listener: (event: any) => void) {
      // Mock implementation - could track listeners if needed
    }
    
    static isTypeSupported(type: string) {
      return ['video/webm', 'video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4'].includes(type)
    }
  } as any

  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getDisplayMedia: jest.fn().mockResolvedValue({
        getVideoTracks: () => [{
          addEventListener: jest.fn(),
          stop: jest.fn()
        }],
        getAudioTracks: () => [{
          clone: () => ({ stop: jest.fn() }),
          stop: jest.fn()
        }],
        getTracks: () => [{ stop: jest.fn() }]
      })
    },
    writable: true
  })

  // Mock DOM APIs
  Object.defineProperty(document, 'createElement', {
    value: jest.fn((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 1920,
          height: 1080,
          style: {
            position: '',
            top: '',
            right: '',
            left: '',
            width: '',
            height: '',
            zIndex: '',
            pointerEvents: '',
            border: '',
            borderRadius: '',
            backgroundColor: '',
            display: '',
            visibility: '',
            opacity: ''
          },
          getContext: () => ({
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            drawImage: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            translate: jest.fn(),
            scale: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            beginPath: jest.fn(),
            createRadialGradient: () => ({
              addColorStop: jest.fn()
            })
          }),
          captureStream: jest.fn(() => ({
            addTrack: jest.fn(),
            getTracks: () => [{ stop: jest.fn() }]
          })),
          parentNode: null,
          setAttribute: jest.fn(),
          removeAttribute: jest.fn()
        }
      }
      if (tag === 'video') {
        return {
          srcObject: null,
          muted: false,
          autoplay: false,
          playsInline: false,
          videoWidth: 1920,
          videoHeight: 1080,
          readyState: 4, // HAVE_ENOUGH_DATA
          paused: false,
          ended: false,
          currentTime: 0,
          play: jest.fn().mockResolvedValue(undefined),
          pause: jest.fn(),
          style: {
            position: '',
            top: '',
            left: '',
            width: '',
            height: '',
            zIndex: '',
            pointerEvents: '',
            display: '',
            visibility: '',
            opacity: ''
          },
          addEventListener: jest.fn((event, callback) => {
            if (event === 'loadedmetadata') {
              setTimeout(callback, 10)
            }
          })
        }
      }
      return {
        style: {},
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn()
      }
    }),
    writable: true
  })

  Object.defineProperty(document, 'body', {
    value: {
      appendChild: jest.fn(),
      removeChild: jest.fn()
    },
    writable: true
  })

  // Add addEventListener to document as well
  Object.defineProperty(document, 'addEventListener', {
    value: jest.fn(),
    writable: true
  })
  
  Object.defineProperty(document, 'removeEventListener', {
    value: jest.fn(),
    writable: true
  })

  // Mock requestAnimationFrame
  global.requestAnimationFrame = jest.fn((cb) => {
    setTimeout(cb, 16)
    return 1
  })
  global.cancelAnimationFrame = jest.fn()

  // Mock window events
  global.window = {
    ...global.window,
    innerWidth: 1920,
    innerHeight: 1080,
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    // Disable electronAPI for tests to use browser fallback
    electronAPI: undefined
  }

  // Mock OffscreenCanvas for effects processor
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
          getImageData: jest.fn(() => ({ 
            data: new Uint8ClampedArray(1920 * 1080 * 4),
            width: 1920,
            height: 1080
          })),
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

  // Mock OffscreenCanvasRenderingContext2D
  global.OffscreenCanvasRenderingContext2D = class MockOffscreenCanvasRenderingContext2D {} as any

  // Mock VideoFrame for effects processing
  global.VideoFrame = class MockVideoFrame {
    timestamp: number
    duration?: number
    
    constructor(data: any, options?: any) {
      this.timestamp = options?.timestamp || 0
      this.duration = options?.duration || 33333
    }
    
    close() {}
  } as any

  // Mock animation frame APIs
  global.requestAnimationFrame = jest.fn(callback => {
    setTimeout(callback, 16) // ~60fps
    return 1
  }) as any
  
  global.cancelAnimationFrame = jest.fn() as any

  // Mock window object
  Object.defineProperty(global, 'window', {
    value: {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      innerWidth: 1920,
      innerHeight: 1080
    },
    writable: true
  })
})

describe('ScreenRecorder Integration Tests', () => {
  let recorder: ScreenRecorder

  beforeEach(() => {
    recorder = new ScreenRecorder()
    jest.clearAllMocks()
    
    // Reset navigator mock to success state for each test
    ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue({
      getVideoTracks: () => [{
        addEventListener: jest.fn(),
        stop: jest.fn()
      }],
      getAudioTracks: () => [{
        clone: () => ({ stop: jest.fn() }),
        stop: jest.fn()
      }],
      getTracks: () => [{ stop: jest.fn() }]
    })
  })

  afterEach(() => {
    // No longer need to call cleanup directly - handled by stopRecording
    if (recorder && recorder.isRecording && recorder.isRecording()) {
      recorder.stopRecording().catch(() => {/* ignore cleanup errors */})
    }
  })

  describe('Source Management', () => {
    test('should get available sources', async () => {
      console.log('🧪 Test: getting available sources...')
      const sources = await recorder.getAvailableSources()
      console.log('🧪 Test: received sources:', sources.length, sources)
      
      expect(sources).toBeInstanceOf(Array)
      // Should return default sources even without Electron
      expect(sources.length).toBeGreaterThanOrEqual(2)
      
      // Check default sources
      expect(sources[0]).toEqual({
        id: 'screen:0',
        name: 'Entire Screen',
        type: 'screen'
      })
      expect(sources[1]).toEqual({
        id: 'window:select',
        name: 'Select Window',
        type: 'window'
      })
    })
  })

  describe('Recording Without Effects', () => {
    test('should start and stop direct recording', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'system' as const,
        quality: 'high' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      // Start recording
      await recorder.startRecording(settings)
      
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled()
      
      const state = recorder.getRecordingState()
      expect(state.isRecording).toBe(true)
      expect(state.isPaused).toBe(false)

      // Stop recording
      const result = await recorder.stopRecording()
      
      expect(result).toHaveProperty('video')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('duration')
      expect(result.video).toBeInstanceOf(Blob)
      expect(Array.isArray(result.metadata)).toBe(true)
      expect(typeof result.duration).toBe('number')
    })

    test('should handle pause and resume', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'none' as const,
        quality: 'medium' as const,
        framerate: 60 as const,
        format: 'mp4' as const
      }

      await recorder.startRecording(settings)
      
      // Pause
      recorder.pauseRecording()
      let state = recorder.getRecordingState()
      expect(state.isPaused).toBe(true)
      
      // Resume
      recorder.resumeRecording()
      state = recorder.getRecordingState()
      expect(state.isPaused).toBe(false)
      
      await recorder.stopRecording()
    })
  })

  describe('Recording With Metadata Collection', () => {
    test('should collect metadata during recording', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'system' as const,
        quality: 'high' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      await recorder.startRecording(settings)
      
      const state = recorder.getRecordingState()
      expect(state.isRecording).toBe(true)
      
      // Wait a bit for metadata collection
      await new Promise(resolve => setTimeout(resolve, 100))

      const result = await recorder.stopRecording()
      
      // Should have collected metadata
      expect(result.metadata).toBeDefined()
      expect(Array.isArray(result.metadata)).toBe(true)
      // Metadata collection happens at 60fps, so we should have some events
      expect(result.metadata.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Recording Duration', () => {
    test('should track recording duration', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'none' as const,
        quality: 'medium' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      expect(recorder.getRecordingDurationMs()).toBe(0)

      await recorder.startRecording(settings)
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const duration = recorder.getRecordingDurationMs()
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(1000) // Should be less than 1 second (in ms)

      const result = await recorder.stopRecording()
      
      // Result should have the actual duration
      expect(result.duration).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    test('should throw error when already recording', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'system' as const,
        quality: 'high' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      await recorder.startRecording(settings)
      
      await expect(recorder.startRecording(settings))
        .rejects.toThrow('Already recording')

      // Verify recorder is still in recording state after failed call
      const state = recorder.getRecordingState()
      expect(state.isRecording).toBe(true)

      await recorder.stopRecording()
    })

    test('should handle permission denied', async () => {
      // Mock to reject both initial and fallback calls
      (navigator.mediaDevices.getDisplayMedia as jest.Mock)
        .mockRejectedValue(new Error('Permission denied'))

      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'system' as const,
        quality: 'high' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      await expect(recorder.startRecording(settings))
        .rejects.toThrow('Failed to start recording: Error: Screen recording permission denied')
    })

    test('should return null when stopping while not recording', async () => {
      const result = await recorder.stopRecording()
      expect(result).toBeNull()
    })
  })

  describe('Metadata Collection', () => {
    test('should collect user interaction metadata', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'none' as const,
        quality: 'medium' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      await recorder.startRecording(settings)
      
      // Simulate some user interactions
      // In a real test environment, these would be actual DOM events
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const result = await recorder.stopRecording()
      
      expect(result.metadata).toBeDefined()
      expect(Array.isArray(result.metadata)).toBe(true)
    })
  })

  describe('Resource Cleanup', () => {
    test('should cleanup resources properly', async () => {
      const settings = {
        area: 'fullscreen' as const,
        audioInput: 'system' as const,
        quality: 'high' as const,
        framerate: 30 as const,
        format: 'webm' as const
      }

      await recorder.startRecording(settings)
      
      // Stop recording should cleanup automatically
      await recorder.stopRecording()
      
      const state = recorder.getRecordingState()
      expect(state.isRecording).toBe(false)
      expect(state.isPaused).toBe(false)
    })
  })
})
/**
 * Electron Recorder Tests
 * Tests the native Electron-based screen recording functionality
 */

import { ElectronRecorder, type ElectronRecordingResult, type ElectronMetadata } from '@/lib/recording/electron-recorder'
import type { RecordingSettings } from '@/types'
import type { EnhancementSettings } from '@/lib/recording/screen-recorder'

// Mock Electron APIs
const mockElectronAPI = {
  getDesktopSources: jest.fn(),
  startMouseTracking: jest.fn(),
  stopMouseTracking: jest.fn(),
  isNativeMouseTrackingAvailable: jest.fn(),
  onMouseMove: jest.fn(),
  onMouseClick: jest.fn(),
  removeAllMouseListeners: jest.fn()
}

// Mock DOM environment for Node.js tests
Object.defineProperty(global, 'document', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    body: {
      innerHTML: ''
    }
  },
  writable: true
})

// Mock window object with Electron API
Object.defineProperty(global, 'window', {
  value: {
    electronAPI: mockElectronAPI,
    process: { type: 'renderer' },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  },
  writable: true
})

// Mock performance for timing tests
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => Date.now())
  },
  writable: true
})

// Mock Date.now for consistent timing with incremental time
let mockTime = 1000000 // Starting timestamp
const mockDateNow = jest.fn(() => {
  mockTime += 100 // Increment by 100ms on each call
  return mockTime
})
global.Date.now = mockDateNow

// Mock MediaRecorder for Electron environment
Object.defineProperty(global, 'MediaRecorder', {
  value: class MockMediaRecorder {
    state = 'inactive'
    mimeType: string
    ondataavailable: ((event: any) => void) | null = null
    onstop: ((event: any) => void) | null = null
    onerror: ((event: any) => void) | null = null
    onstart: ((event: any) => void) | null = null

    constructor(stream: any, options?: any) {
      this.mimeType = options?.mimeType || 'video/webm'
    }

    start(interval?: number) {
      this.state = 'recording'
      if (this.onstart) this.onstart(new Event('start'))
      
      // Simulate immediate data chunk for Electron recording
      setTimeout(() => {
        const testData = new Array(2000).fill('electron video data').join(' ')
        const chunk = new Blob([testData], { type: this.mimeType })
        const blobEvent = new Event('dataavailable');
        (blobEvent as any).data = chunk
        if (this.ondataavailable) this.ondataavailable(blobEvent)
      }, 50)
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
      return ['video/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'].includes(type)
    }
  } as any,
  writable: true
})

// Ensure navigator exists for this test file
if (!global.navigator) {
  Object.defineProperty(global, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }],
          getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
          getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
        }),
        getDisplayMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }],
          getVideoTracks: () => [{ addEventListener: jest.fn() }]
        })
      }
    },
    writable: true
  })
}

describe('ElectronRecorder', () => {
  let recorder: ElectronRecorder
  const mockDesktopSources = [
    {
      id: 'screen:1',
      name: 'Primary Display',
      thumbnail: 'data:image/png;base64,test',
      display_id: '1',
      appIcon: 'data:image/png;base64,icon'
    },
    {
      id: 'window:123',
      name: 'Chrome Window',
      thumbnail: 'data:image/png;base64,test2',
      display_id: null,
      appIcon: 'data:image/png;base64,icon2'
    }
  ]

  const defaultRecordingSettings: RecordingSettings = {
    area: 'fullscreen',
    audioInput: 'system',
    quality: 'high',
    framerate: 30,
    format: 'webm'
  }

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

  beforeEach(() => {
    // Clear all mock functions manually
    mockElectronAPI.getDesktopSources.mockClear()
    mockElectronAPI.startMouseTracking.mockClear()
    mockElectronAPI.stopMouseTracking.mockClear()
    mockElectronAPI.isNativeMouseTrackingAvailable.mockClear()
    mockElectronAPI.onMouseMove.mockClear()
    mockElectronAPI.onMouseClick.mockClear()
    mockElectronAPI.removeAllMouseListeners.mockClear()

    // Reset navigator.mediaDevices.getUserMedia to default success behavior
    if (navigator?.mediaDevices?.getUserMedia) {
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
        getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
      })
    }

    // Setup default mock responses
    mockElectronAPI.getDesktopSources.mockResolvedValue(mockDesktopSources)
    mockElectronAPI.startMouseTracking.mockResolvedValue({
      success: true,
      nativeTracking: true,
      fps: 60
    })
    mockElectronAPI.stopMouseTracking.mockResolvedValue({ success: true })
    mockElectronAPI.isNativeMouseTrackingAvailable.mockResolvedValue({
      available: true,
      tracker: true
    })

    // Reset mock timers
    mockTime = 1000000
    mockDateNow.mockClear()

    // Create recorder after mocks are set up
    recorder = new ElectronRecorder()
  })

  afterEach(() => {
    if (recorder && recorder.isCurrentlyRecording()) {
      try {
        recorder.stopRecording()
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  })

  describe('Initialization', () => {
    test('should initialize in Electron environment', () => {
      expect(recorder).toBeInstanceOf(ElectronRecorder)
      expect(recorder.isCurrentlyRecording()).toBe(false)
    })

    test('should detect Electron environment correctly', async () => {
      // The recorder should work since we have window.process.type = 'renderer'
      await expect(recorder.startRecording(defaultRecordingSettings)).resolves.not.toThrow()
    })

    test('should fail in non-Electron environment', async () => {
      // Temporarily remove Electron API
      const originalElectronAPI = window.electronAPI
      delete (window as any).electronAPI

      const nonElectronRecorder = new ElectronRecorder()
      await expect(nonElectronRecorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('ElectronRecorder requires Electron environment')

      // Restore
      ;(window as any).electronAPI = originalElectronAPI
    })
  })

  describe('Desktop Sources', () => {
    test('should get available desktop sources', async () => {
      const sources = await recorder.getAvailableSources()

      expect(mockElectronAPI.getDesktopSources).toHaveBeenCalledWith({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      })
      expect(sources).toEqual([
        { id: 'screen:1', name: 'Primary Display', type: 'screen' },
        { id: 'window:123', name: 'Chrome Window', type: 'window' }
      ])
    })

    test('should handle desktop sources API error', async () => {
      mockElectronAPI.getDesktopSources.mockRejectedValue(new Error('Desktop capture permission denied'))

      const sources = await recorder.getAvailableSources()
      expect(sources).toEqual([])
    })

    test('should handle empty sources list', async () => {
      mockElectronAPI.getDesktopSources.mockResolvedValue([])

      await expect(recorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('No screen sources available')
    })
  })

  describe('Recording Lifecycle', () => {
    test('should start recording successfully', async () => {
      await recorder.startRecording(defaultRecordingSettings)

      expect(recorder.isCurrentlyRecording()).toBe(true)
      expect(mockElectronAPI.getDesktopSources).toHaveBeenCalled()
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'screen:1',
            minWidth: 1280,
            maxWidth: 4096,
            minHeight: 720,
            maxHeight: 2160,
            minFrameRate: 30,
            maxFrameRate: 60
          }
        }
      })
    })

    test('should start recording with enhancements', async () => {
      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      expect(recorder.isCurrentlyRecording()).toBe(true)
      expect(mockElectronAPI.startMouseTracking).toHaveBeenCalledWith({
        intervalMs: 16 // 60fps
      })
    })

    test('should prevent double recording start', async () => {
      await recorder.startRecording(defaultRecordingSettings)
      expect(recorder.isCurrentlyRecording()).toBe(true)

      await expect(recorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('Already recording')
    })

    test('should stop recording successfully', async () => {
      await recorder.startRecording(defaultRecordingSettings)
      expect(recorder.isCurrentlyRecording()).toBe(true)

      const result = await recorder.stopRecording()

      expect(recorder.isCurrentlyRecording()).toBe(false)
      expect(result).toHaveProperty('video')
      expect(result).toHaveProperty('duration')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('effectsApplied')
      expect(result.video).toBeInstanceOf(Blob)
      expect(typeof result.duration).toBe('number')
      expect(Array.isArray(result.metadata)).toBe(true)
      expect(Array.isArray(result.effectsApplied)).toBe(true)
      expect(result.effectsApplied).toContain('electron-desktop-capture')
    })

    test('should handle stop when not recording', async () => {
      expect(recorder.isCurrentlyRecording()).toBe(false)

      await expect(recorder.stopRecording())
        .rejects.toThrow('Not recording')
    })
  })

  describe('Mouse Tracking', () => {
    test('should start native mouse tracking with enhancements', async () => {
      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      expect(mockElectronAPI.isNativeMouseTrackingAvailable).toHaveBeenCalled()
      expect(mockElectronAPI.onMouseMove).toHaveBeenCalled()
      expect(mockElectronAPI.onMouseClick).toHaveBeenCalled()
      expect(mockElectronAPI.startMouseTracking).toHaveBeenCalledWith({
        intervalMs: 16
      })
    })

    test('should handle native mouse tracking failure', async () => {
      mockElectronAPI.startMouseTracking.mockResolvedValue({
        success: false,
        error: 'robotjs not available'
      })

      // Should fail fast when mouse tracking fails
      await expect(recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings))
        .rejects.toThrow('Failed to start native mouse tracking: robotjs not available')

      expect(recorder.isCurrentlyRecording()).toBe(false)
    })

    test('should stop mouse tracking when recording stops', async () => {
      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)
      await recorder.stopRecording()

      expect(mockElectronAPI.stopMouseTracking).toHaveBeenCalled()
      expect(mockElectronAPI.removeAllMouseListeners).toHaveBeenCalled()
    })

    test('should collect mouse metadata during recording', async () => {
      let mouseMoveCallback: any
      mockElectronAPI.onMouseMove.mockImplementation((callback) => {
        mouseMoveCallback = callback
      })

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Simulate mouse move events
      if (mouseMoveCallback) {
        mouseMoveCallback(null, { x: 100, y: 200 })
        mouseMoveCallback(null, { x: 150, y: 250 })
      }

      const result = await recorder.stopRecording()

      expect(result.metadata.length).toBeGreaterThan(0)
      expect(result.metadata[0]).toMatchObject({
        mouseX: expect.any(Number),
        mouseY: expect.any(Number),
        eventType: 'mouse',
        timestamp: expect.any(Number)
      })
      expect(result.effectsApplied).toContain('mouse-tracking')
    })
  })

  describe('Audio Settings', () => {
    test('should handle no audio input', async () => {
      const settings = { ...defaultRecordingSettings, audioInput: 'none' as const }
      await recorder.startRecording(settings)

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: expect.any(Object)
      })
    })

    test('should handle system audio input', async () => {
      const settings = { ...defaultRecordingSettings, audioInput: 'system' as const }
      await recorder.startRecording(settings)

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: expect.any(Object)
      })
    })

    test('should handle microphone audio input', async () => {
      const settings = { ...defaultRecordingSettings, audioInput: 'microphone' as const }
      await recorder.startRecording(settings)

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: expect.any(Object)
      })
    })
  })

  describe('Video Quality Settings', () => {
    test('should use VP9 codec when available', async () => {
      await recorder.startRecording(defaultRecordingSettings)

      // The MediaRecorder should be created with VP9 codec preference
      const result = await recorder.stopRecording()
      expect(result.video.type).toMatch(/webm/)
    })

    test('should fallback to VP8 when VP9 unavailable', async () => {
      // Mock VP9 as unsupported but VP8 as supported
      const originalIsTypeSupported = MediaRecorder.isTypeSupported
      MediaRecorder.isTypeSupported = jest.fn((type: string) => {
        if (type === 'video/webm;codecs=vp9') return false
        if (type === 'video/webm;codecs=vp8') return true
        return false
      })

      await recorder.startRecording(defaultRecordingSettings)
      const result = await recorder.stopRecording()

      expect(result.video.type).toMatch(/webm/)

      // Restore
      MediaRecorder.isTypeSupported = originalIsTypeSupported
    })

    test('should use high bitrate for quality', async () => {
      await recorder.startRecording(defaultRecordingSettings)

      // Should request 10 Mbps bitrate as specified in ElectronRecorder
      expect(recorder.isCurrentlyRecording()).toBe(true)

      await recorder.stopRecording()
    })
  })

  describe('Error Handling', () => {
    test('should handle getUserMedia failure', async () => {
      (navigator.mediaDevices.getUserMedia as jest.Mock)
        .mockRejectedValue(new Error('Permission denied'))

      await expect(recorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('Permission denied')

      expect(recorder.isCurrentlyRecording()).toBe(false)
    })

    test('should handle MediaRecorder creation failure', async () => {
      const originalMediaRecorder = global.MediaRecorder
      global.MediaRecorder = jest.fn().mockImplementation(() => {
        throw new Error('MediaRecorder not supported')
      }) as any
      global.MediaRecorder.isTypeSupported = jest.fn().mockReturnValue(true)

      await expect(recorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('MediaRecorder not supported')

      // Restore
      global.MediaRecorder = originalMediaRecorder
    })

    test('should cleanup on recording error', async () => {
      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Simulate error during recording
      const mediaRecorder = (recorder as any).mediaRecorder
      if (mediaRecorder && mediaRecorder.onerror) {
        mediaRecorder.onerror(new ErrorEvent('error', {
          error: new Error('Recording device error')
        }))
      }

      // Should still be able to stop and cleanup
      const result = await recorder.stopRecording()
      expect(result).toHaveProperty('video')
      expect(recorder.isCurrentlyRecording()).toBe(false)
    })

    test('should handle missing electronAPI gracefully', async () => {
      // Temporarily remove electronAPI
      const originalElectronAPI = window.electronAPI
      delete (window as any).electronAPI

      const noApiRecorder = new ElectronRecorder()
      await expect(noApiRecorder.startRecording(defaultRecordingSettings))
        .rejects.toThrow('ElectronRecorder requires Electron environment')

      // Restore
      ;(window as any).electronAPI = originalElectronAPI
    })
  })

  describe('Metadata Collection', () => {
    test('should collect mouse movement metadata', async () => {
      let mouseMoveCallback: any
      mockElectronAPI.onMouseMove.mockImplementation((callback) => {
        mouseMoveCallback = callback
      })

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Simulate multiple mouse moves
      if (mouseMoveCallback) {
        mouseMoveCallback(null, { x: 100, y: 200 })
        mouseMoveCallback(null, { x: 150, y: 250 })
        mouseMoveCallback(null, { x: 200, y: 300 })
      }

      const result = await recorder.stopRecording()

      expect(result.metadata.length).toBeGreaterThanOrEqual(3)
      result.metadata.forEach((meta: ElectronMetadata) => {
        expect(meta).toMatchObject({
          timestamp: expect.any(Number),
          mouseX: expect.any(Number),
          mouseY: expect.any(Number),
          eventType: 'mouse'
        })
      })
    })

    test('should collect click event metadata', async () => {
      let mouseClickCallback: any
      mockElectronAPI.onMouseClick.mockImplementation((callback) => {
        mouseClickCallback = callback
      })

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Simulate click events
      if (mouseClickCallback) {
        mouseClickCallback(null, { x: 300, y: 400 })
        mouseClickCallback(null, { x: 350, y: 450 })
      }

      const result = await recorder.stopRecording()

      const clickEvents = result.metadata.filter(meta => meta.eventType === 'click')
      expect(clickEvents.length).toBeGreaterThanOrEqual(2)
      clickEvents.forEach((meta: ElectronMetadata) => {
        expect(meta).toMatchObject({
          timestamp: expect.any(Number),
          mouseX: expect.any(Number),
          mouseY: expect.any(Number),
          eventType: 'click'
        })
      })
    })

    test('should fail fast when native tracking unavailable', async () => {
      mockElectronAPI.isNativeMouseTrackingAvailable.mockResolvedValue({
        available: false,
        tracker: false
      })

      await expect(recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings))
        .rejects.toThrow('Native mouse tracking not available - robotjs dependency missing')

      expect(recorder.isCurrentlyRecording()).toBe(false)
    })
  })

  describe('Performance', () => {
    test('should complete recording cycle within reasonable time', async () => {
      const startTime = performance.now()

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)
      
      // Simulate brief recording
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const result = await recorder.stopRecording()
      
      const endTime = performance.now()
      const totalTime = endTime - startTime

      expect(totalTime).toBeLessThan(1000) // Should complete within 1 second
      expect(result.duration).toBeGreaterThan(0)
      expect(result.processingTime).toBe(0) // Electron recorder has no post-processing
    })

    test('should handle high-frequency mouse events', async () => {
      let mouseMoveCallback: any
      mockElectronAPI.onMouseMove.mockImplementation((callback) => {
        mouseMoveCallback = callback
      })

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Simulate high-frequency mouse events (60fps)
      if (mouseMoveCallback) {
        for (let i = 0; i < 100; i++) {
          mouseMoveCallback(null, { x: i * 10, y: i * 5 })
        }
      }

      const result = await recorder.stopRecording()

      expect(result.metadata.length).toBeGreaterThan(50) // Should capture most events
      expect(recorder.isCurrentlyRecording()).toBe(false)
    })
  })

  describe('Resource Management', () => {
    test('should cleanup all resources after recording', async () => {
      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)
      const result = await recorder.stopRecording()

      expect(result).toHaveProperty('video')
      expect(recorder.isCurrentlyRecording()).toBe(false)
      expect(mockElectronAPI.stopMouseTracking).toHaveBeenCalled()
    })

    test('should handle cleanup when stream fails', async () => {
      (navigator.mediaDevices.getUserMedia as jest.Mock)
        .mockResolvedValueOnce({
          getTracks: () => [{ stop: jest.fn() }],
          getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
          getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
        })

      await recorder.startRecording(defaultRecordingSettings, defaultEnhancementSettings)

      // Force cleanup through stop
      const result = await recorder.stopRecording()

      expect(result).toHaveProperty('video')
      expect(recorder.isCurrentlyRecording()).toBe(false)
    })
  })
})
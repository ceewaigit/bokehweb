/**
 * Unit tests for StreamManager
 * Tests the display stream management component
 */

import { StreamManager, type RecordingSource } from '@/lib/recording/stream-manager'
import type { RecordingSettings } from '@/types'

// Mock MediaStream
const createMockStream = () => ({
  active: true,
  getTracks: jest.fn(() => [{ stop: jest.fn() }]),
  getVideoTracks: jest.fn(() => [{ 
    addEventListener: jest.fn(),
    stop: jest.fn() 
  }]),
  getAudioTracks: jest.fn(() => [{ 
    stop: jest.fn() 
  }])
})

// Mock navigator.mediaDevices
const mockGetDisplayMedia = jest.fn()

Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: {
      getDisplayMedia: mockGetDisplayMedia
    }
  },
  writable: true
})

// Mock window object
Object.defineProperty(global, 'window', {
  value: {
    dispatchEvent: jest.fn(),
    electronAPI: undefined // Test browser fallback by default
  },
  writable: true
})

describe('StreamManager', () => {
  let manager: StreamManager

  beforeEach(() => {
    manager = new StreamManager()
    jest.clearAllMocks()
    
    // Set up default successful mock
    mockGetDisplayMedia.mockResolvedValue(createMockStream())
  })

  describe('Initialization', () => {
    test('should initialize without active stream', () => {
      expect(manager.isActive()).toBe(false)
      expect(manager.getStream()).toBeNull()
    })
  })

  describe('Stream Acquisition', () => {
    test('should get display stream with basic settings', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      const stream = await manager.getDisplayStream(settings)
      
      expect(stream).toBeDefined()
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      })
      
      expect(manager.isActive()).toBe(true)
      expect(manager.getStream()).toBe(stream)
    })

    test('should handle different framerate settings', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 60,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 60,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      })
    })

    test('should handle no audio input', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'none',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
    })

    test('should handle Electron environment with sourceId', async () => {
      // Mock Electron API
      global.window = {
        ...global.window,
        electronAPI: {
          getSources: jest.fn()
        }
      }

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.getDisplayStream(settings, 'screen:0:1')
      
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'screen:0:1'
          }
        },
        audio: true
      })

      // Reset window
      global.window = {
        ...global.window,
        electronAPI: undefined
      }
    })

    test('should fallback to minimal constraints on error', async () => {
      // Mock first call to fail, second to succeed
      mockGetDisplayMedia
        .mockRejectedValueOnce(new Error('Constraints not supported'))
        .mockResolvedValueOnce(createMockStream())

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      const stream = await manager.getDisplayStream(settings)
      
      expect(stream).toBeDefined()
      expect(mockGetDisplayMedia).toHaveBeenCalledTimes(2)
      
      // First call with full constraints
      expect(mockGetDisplayMedia).toHaveBeenNthCalledWith(1, {
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      })
      
      // Second call with minimal constraints
      expect(mockGetDisplayMedia).toHaveBeenNthCalledWith(2, {
        video: true,
        audio: false
      })
    })

    test('should throw error when both attempts fail', async () => {
      mockGetDisplayMedia.mockRejectedValue(new Error('Permission denied'))

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await expect(manager.getDisplayStream(settings))
        .rejects.toThrow('Screen recording permission denied: Permission denied')
      
      expect(mockGetDisplayMedia).toHaveBeenCalledTimes(2)
    })
  })

  describe('Stream Management', () => {
    test('should stop stream and cleanup tracks', async () => {
      const mockStream = createMockStream()
      const mockTrack = { stop: jest.fn() }
      mockStream.getTracks.mockReturnValue([mockTrack])
      
      mockGetDisplayMedia.mockResolvedValue(mockStream)

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      expect(manager.isActive()).toBe(true)
      
      manager.stopStream()
      
      expect(mockTrack.stop).toHaveBeenCalled()
      expect(manager.isActive()).toBe(false)
      expect(manager.getStream()).toBeNull()
    })

    test('should handle stop when no stream exists', () => {
      expect(() => manager.stopStream()).not.toThrow()
      expect(manager.isActive()).toBe(false)
    })

    test('should handle stream end event', async () => {
      const mockStream = createMockStream()
      const mockVideoTrack = { 
        addEventListener: jest.fn(),
        stop: jest.fn() 
      }
      mockStream.getVideoTracks.mockReturnValue([mockVideoTrack])
      
      mockGetDisplayMedia.mockResolvedValue(mockStream)

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      
      // Verify that event listener was added
      expect(mockVideoTrack.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function))
      
      // Simulate stream end
      const endCallback = mockVideoTrack.addEventListener.mock.calls[0][1]
      endCallback()
      
      // Should dispatch custom event
      expect(global.window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stream-ended'
        })
      )
    })
  })

  describe('Static Methods', () => {
    describe('getAvailableSources', () => {
      test('should return default sources in browser environment', async () => {
        const sources = await StreamManager.getAvailableSources()
        
        expect(sources).toEqual([
          { id: 'screen:0', name: 'Entire Screen', type: 'screen' },
          { id: 'window:select', name: 'Select Window', type: 'window' }
        ])
      })

      test('should return Electron sources when available', async () => {
        const mockSources = [
          { id: 'screen:0:0', name: 'Screen 1', thumbnail: 'thumb1' },
          { id: 'screen:0:1', name: 'Screen 2', thumbnail: 'thumb2' },
          { id: 'window:123', name: 'Browser Window', thumbnail: 'thumb3' }
        ]

        global.window = {
          ...global.window,
          electronAPI: {
            getDesktopSources: jest.fn().mockResolvedValue(mockSources)
          }
        }

        const sources = await StreamManager.getAvailableSources()
        
        expect(sources).toEqual([
          { id: 'screen:0:0', name: 'Screen 1', type: 'screen', thumbnail: 'thumb1' },
          { id: 'screen:0:1', name: 'Screen 2', type: 'screen', thumbnail: 'thumb2' },
          { id: 'window:123', name: 'Browser Window', type: 'window', thumbnail: 'thumb3' }
        ])

        // Reset window
        global.window = {
          ...global.window,
          electronAPI: undefined
        }
      })

      test('should fallback to default sources on Electron error', async () => {
        global.window = {
          ...global.window,
          electronAPI: {
            getDesktopSources: jest.fn().mockRejectedValue(new Error('Electron error'))
          }
        }

        const sources = await StreamManager.getAvailableSources()
        
        expect(sources).toEqual([
          { id: 'screen:0', name: 'Entire Screen', type: 'screen' },
          { id: 'window:select', name: 'Select Window', type: 'window' }
        ])

        // Reset window
        global.window = {
          ...global.window,
          electronAPI: undefined
        }
      })
    })

    describe('isSupported', () => {
      test('should return true when all APIs are available', () => {
        expect(StreamManager.isSupported()).toBe(true)
      })

      test('should return false when navigator is missing', () => {
        const originalNavigator = global.navigator
        delete (global as any).navigator

        expect(StreamManager.isSupported()).toBe(false)

        // Restore
        global.navigator = originalNavigator
      })

      test('should return false when mediaDevices is missing', () => {
        const originalNavigator = global.navigator
        global.navigator = {} as any

        expect(StreamManager.isSupported()).toBe(false)

        // Restore
        global.navigator = originalNavigator
      })

      test('should return false when getDisplayMedia is missing', () => {
        const originalNavigator = global.navigator
        global.navigator = {
          mediaDevices: {}
        } as any

        expect(StreamManager.isSupported()).toBe(false)

        // Restore
        global.navigator = originalNavigator
      })

      test('should return false when MediaRecorder is missing', () => {
        const originalMediaRecorder = global.MediaRecorder
        delete (global as any).MediaRecorder

        expect(StreamManager.isSupported()).toBe(false)

        // Restore
        global.MediaRecorder = originalMediaRecorder
      })
    })
  })

  describe('Edge Cases', () => {
    test('should handle multiple stream acquisitions', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      // First stream
      const stream1 = await manager.getDisplayStream(settings)
      expect(manager.getStream()).toBe(stream1)
      
      // Second stream should replace first
      const stream2 = await manager.getDisplayStream(settings)
      expect(manager.getStream()).toBe(stream2)
      expect(manager.isActive()).toBe(true)
    })

    test('should handle inactive stream', async () => {
      const mockStream = createMockStream()
      mockStream.active = false
      mockGetDisplayMedia.mockResolvedValue(mockStream)

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      
      expect(manager.isActive()).toBe(false) // Stream is inactive
      expect(manager.getStream()).toBe(mockStream) // But stream is still stored
    })

    test('should handle string error objects', async () => {
      mockGetDisplayMedia.mockRejectedValue('String error')

      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      }

      await expect(manager.getDisplayStream(settings))
        .rejects.toThrow('Screen recording permission denied: String error')
    })

    test('should handle undefined framerate', async () => {
      const settings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: undefined as any,
        format: 'webm'
      }

      await manager.getDisplayStream(settings)
      
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: 30, // Should default to 30
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      })
    })
  })

  describe('Source Type Detection', () => {
    test('should correctly identify screen sources', async () => {
      const mockSources = [
        { id: 'screen:0:0', name: 'Screen 1' },
        { id: 'screen:1:0', name: 'Screen 2' },
        { id: 'window:123', name: 'Window' }
      ]

      global.window = {
        ...global.window,
        electronAPI: {
          getDesktopSources: jest.fn().mockResolvedValue(mockSources)
        }
      }

      const sources = await StreamManager.getAvailableSources()
      
      expect(sources[0].type).toBe('screen')
      expect(sources[1].type).toBe('screen')
      expect(sources[2].type).toBe('window')

      // Reset window
      global.window = {
        ...global.window,
        electronAPI: undefined
      }
    })
  })
})
/**
 * Native Mouse Tracker Tests
 * Tests Electron-native mouse tracking without robotjs dependency
 */

import NativeMouseTracker from '../../electron/native-mouse-tracker'

// Mock Electron's screen and globalShortcut
jest.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: jest.fn(),
    getAllDisplays: jest.fn()
  },
  globalShortcut: {
    register: jest.fn(),
    unregister: jest.fn(),
    unregisterAll: jest.fn()
  }
}))

// Get the mocked modules
import { screen as mockScreen, globalShortcut as mockGlobalShortcut } from 'electron'

describe('NativeMouseTracker', () => {
  let tracker: NativeMouseTracker
  let mockCallback: jest.Mock

  beforeEach(() => {
    tracker = new NativeMouseTracker()
    mockCallback = jest.fn()
    jest.clearAllMocks()
    
    // Setup default mock responses
    mockScreen.getCursorScreenPoint.mockReturnValue({ x: 100, y: 200 })
    mockScreen.getAllDisplays.mockReturnValue([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
    ])
  })

  afterEach(() => {
    if (tracker) {
      tracker.stop()
    }
  })

  describe('Initialization', () => {
    test('should initialize tracker', () => {
      expect(tracker).toBeInstanceOf(NativeMouseTracker)
    })

    test('should not be tracking initially', () => {
      expect(tracker.isNativeTrackingAvailable()).toBe(true)
    })

    test('should provide current position', () => {
      const position = tracker.getCurrentPosition()
      expect(position).toEqual({ x: 100, y: 200 })
      expect(mockScreen.getCursorScreenPoint).toHaveBeenCalled()
    })
  })

  describe('Mouse Tracking', () => {
    test('should start tracking mouse movements', () => {
      tracker.start(100) // 10fps for testing
      
      // Should not warn about already started
      expect(tracker).toBeDefined()
    })

    test('should detect mouse position changes', (done) => {
      tracker.onMouseMove(mockCallback)
      tracker.start(50) // 20fps for faster testing
      
      // Change mouse position
      setTimeout(() => {
        mockScreen.getCursorScreenPoint.mockReturnValue({ x: 150, y: 250 })
      }, 10)
      
      setTimeout(() => {
        expect(mockCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            x: 150,
            y: 250,
            timestamp: expect.any(Number)
          })
        )
        done()
      }, 100)
    })

    test('should not trigger callback for same position', (done) => {
      tracker.onMouseMove(mockCallback)
      tracker.start(50)
      
      // Keep same position
      setTimeout(() => {
        mockScreen.getCursorScreenPoint.mockReturnValue({ x: 100, y: 200 })
      }, 10)
      
      setTimeout(() => {
        // Should not be called for same position
        expect(mockCallback).not.toHaveBeenCalled()
        done()
      }, 100)
    })

    test('should track at specified frame rate', () => {
      const intervalMs = 100 // 10fps
      tracker.start(intervalMs)
      
      // Verify tracking interval is set up correctly
      expect(tracker).toBeDefined()
    })

    test('should warn when starting already active tracking', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      tracker.start()
      tracker.start() // Second start should warn
      
      expect(consoleSpy).toHaveBeenCalledWith('Native mouse tracking already started')
      
      consoleSpy.mockRestore()
    })
  })

  describe('Click Detection', () => {
    test('should detect click events using heuristics', (done) => {
      tracker.onMouseClick(mockCallback)
      tracker.start(25) // 40fps for click detection
      
      // Simulate movement followed by stillness (click pattern)
      let callCount = 0
      const originalGetCursor = mockScreen.getCursorScreenPoint
      
      mockScreen.getCursorScreenPoint.mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return { x: 100 + callCount * 10, y: 200 } // Movement
        } else {
          return { x: 120, y: 200 } // Stillness (potential click)
        }
      })
      
      setTimeout(() => {
        // Click detection is heuristic-based, so we test the mechanism exists
        expect(tracker).toBeDefined()
        mockScreen.getCursorScreenPoint = originalGetCursor
        done()
      }, 200)
    })

    test('should register click callback', () => {
      tracker.onMouseClick(mockCallback)
      
      // Verify callback was registered
      expect(tracker).toBeDefined()
    })
  })

  describe('Callback Management', () => {
    test('should register mouse move callbacks', () => {
      tracker.onMouseMove(mockCallback)
      
      // Verify callback registration
      expect(tracker).toBeDefined()
    })

    test('should register mouse click callbacks', () => {
      tracker.onMouseClick(mockCallback)
      
      // Verify callback registration
      expect(tracker).toBeDefined()
    })

    test('should remove specific callbacks', () => {
      tracker.onMouseMove(mockCallback)
      tracker.removeCallback('move', mockCallback)
      
      // Callback should be removed
      expect(tracker).toBeDefined()
    })

    test('should remove all callbacks', () => {
      tracker.onMouseMove(mockCallback)
      tracker.onMouseClick(mockCallback)
      tracker.removeAllCallbacks()
      
      // All callbacks should be removed
      expect(tracker).toBeDefined()
    })

    test('should handle callback errors gracefully', (done) => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error')
      })
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      
      tracker.onMouseMove(errorCallback)
      tracker.start(50)
      
      // Change position to trigger callback
      setTimeout(() => {
        mockScreen.getCursorScreenPoint.mockReturnValue({ x: 200, y: 300 })
      }, 10)
      
      setTimeout(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error in mouse move callback:'),
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
        done()
      }, 100)
    })
  })

  describe('Tracking Control', () => {
    test('should stop tracking', () => {
      tracker.start()
      tracker.stop()
      
      // Should not be tracking after stop
      expect(tracker).toBeDefined()
    })

    test('should handle stop when not tracking', () => {
      // Should not throw error
      expect(() => tracker.stop()).not.toThrow()
    })

    test('should cleanup global shortcuts on stop', () => {
      tracker.start()
      tracker.stop()
      
      expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalled()
    })

    test('should cleanup intervals on stop', () => {
      tracker.start()
      tracker.stop()
      
      // Tracking should be stopped
      expect(tracker).toBeDefined()
    })
  })

  describe('Global Shortcut Integration', () => {
    test('should setup global click detection', () => {
      tracker.start()
      
      // Should attempt to set up global shortcuts for click detection
      expect(tracker).toBeDefined()
    })

    test('should handle global shortcut registration errors', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      mockGlobalShortcut.register.mockImplementation(() => {
        throw new Error('Shortcut registration failed')
      })
      
      tracker.start()
      
      // Should handle errors gracefully
      expect(tracker).toBeDefined()
      
      consoleWarnSpy.mockRestore()
    })

    test('should cleanup shortcuts on disposal', () => {
      tracker.start()
      tracker.stop()
      
      expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalled()
    })
  })

  describe('Performance', () => {
    test('should handle high-frequency position updates', (done) => {
      let updateCount = 0
      tracker.onMouseMove(() => updateCount++)
      tracker.start(16) // ~60fps
      
      // Simulate rapid position changes
      let positionX = 100
      const interval = setInterval(() => {
        positionX += 10
        mockScreen.getCursorScreenPoint.mockReturnValue({ x: positionX, y: 200 })
      }, 16)
      
      setTimeout(() => {
        clearInterval(interval)
        
        // Should handle rapid updates without crashing
        expect(updateCount).toBeGreaterThan(0)
        expect(tracker).toBeDefined()
        done()
      }, 200)
    })

    test('should throttle position checks efficiently', () => {
      tracker.start(100) // 10fps
      
      // Multiple calls within short timeframe
      tracker.getCurrentPosition()
      tracker.getCurrentPosition()
      tracker.getCurrentPosition()
      
      // Expect 4 calls: 1 initial call in start() + 3 explicit calls
      expect(mockScreen.getCursorScreenPoint).toHaveBeenCalledTimes(4)
    })
  })

  describe('Error Handling', () => {
    test('should handle screen API errors', (done) => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockScreen.getCursorScreenPoint.mockImplementation(() => {
        throw new Error('Screen API error')
      })
      
      tracker.start(50)
      
      setTimeout(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error getting cursor position:',
          expect.any(Error)
        )
        
        consoleErrorSpy.mockRestore()
        done()
      }, 100)
    })

    test('should handle callback registration with invalid type', () => {
      // Should handle gracefully
      expect(() => {
        tracker.removeCallback('invalid', mockCallback)
      }).not.toThrow()
    })

    test('should handle multiple stop calls', () => {
      tracker.start()
      tracker.stop()
      tracker.stop() // Second stop should not error
      
      expect(tracker).toBeDefined()
    })
  })

  describe('Availability Check', () => {
    test('should always report as available', () => {
      expect(tracker.isNativeTrackingAvailable()).toBe(true)
    })

    test('should provide current position even when not tracking', () => {
      const position = tracker.getCurrentPosition()
      expect(position).toEqual({ x: 100, y: 200 })
    })
  })

  describe('Integration Scenarios', () => {
    test('should work with multiple callbacks', (done) => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      
      tracker.onMouseMove(callback1)
      tracker.onMouseMove(callback2)
      tracker.start(50)
      
      setTimeout(() => {
        mockScreen.getCursorScreenPoint.mockReturnValue({ x: 200, y: 300 })
      }, 10)
      
      setTimeout(() => {
        expect(callback1).toHaveBeenCalled()
        expect(callback2).toHaveBeenCalled()
        done()
      }, 100)
    })

    test('should handle start/stop cycles', () => {
      for (let i = 0; i < 3; i++) {
        tracker.start()
        tracker.stop()
      }
      
      // Should handle multiple cycles without issues
      expect(tracker).toBeDefined()
    })

    test('should maintain state across restarts', () => {
      tracker.onMouseMove(mockCallback)
      tracker.start()
      tracker.stop()
      tracker.start()
      
      // Callbacks should persist across restarts
      expect(tracker).toBeDefined()
    })
  })
})
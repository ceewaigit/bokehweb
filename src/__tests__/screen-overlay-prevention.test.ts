/**
 * Screen Overlay Prevention Tests
 * Tests for the new simplified architecture that doesn't use DOM overlays
 */

import { ScreenRecorder } from '@/lib/recording'

// Track original DOM state
let originalDocumentBody: any
let originalDocumentChildren: number

describe('Screen Overlay Prevention Tests', () => {
  let screenRecorder: ScreenRecorder

  beforeEach(() => {
    // Store original DOM state
    originalDocumentBody = document.body
    originalDocumentChildren = document.body.children.length
    
    screenRecorder = new ScreenRecorder()
  })

  afterEach(() => {
    // Cleanup
    screenRecorder = null as any
  })

  describe('No DOM Interference', () => {
    test('should not add any DOM elements during recording', async () => {
      const childrenBefore = document.body.children.length
      
      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'none',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      })

      // The new architecture should not add any DOM elements
      const childrenAfter = document.body.children.length
      expect(childrenAfter).toBe(childrenBefore)
      
      await screenRecorder.stopRecording()
      
      // Should still have the same number of children after cleanup
      const childrenFinal = document.body.children.length
      expect(childrenFinal).toBe(childrenBefore)
    })

    test('should not modify document or body styles', async () => {
      const originalDocumentStyle = document.documentElement.style.cssText || ''
      const originalBodyStyle = document.body.style.cssText || ''

      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      })

      // Document and body styles should be unchanged
      expect(document.documentElement.style.cssText || '').toBe(originalDocumentStyle)
      expect(document.body.style.cssText || '').toBe(originalBodyStyle)
      
      await screenRecorder.stopRecording()
      
      // Still unchanged after recording
      expect(document.documentElement.style.cssText || '').toBe(originalDocumentStyle)
      expect(document.body.style.cssText || '').toBe(originalBodyStyle)
    })

    test('should not interfere with existing page elements', async () => {
      // Create a test element
      const testElement = document.createElement('div')
      testElement.id = 'test-element'
      testElement.style.position = 'absolute'
      testElement.style.top = '100px'
      testElement.style.left = '100px'
      document.body.appendChild(testElement)

      const originalPosition = testElement.style.position
      const originalTop = testElement.style.top
      const originalLeft = testElement.style.left
      const originalTransform = testElement.style.transform

      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'none',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      })

      // Element properties should be unchanged
      expect(testElement.style.position).toBe(originalPosition)
      expect(testElement.style.top).toBe(originalTop)
      expect(testElement.style.left).toBe(originalLeft)
      expect(testElement.style.transform).toBe(originalTransform)
      
      await screenRecorder.stopRecording()
      
      // Still unchanged after recording
      expect(testElement.style.position).toBe(originalPosition)
      expect(testElement.style.top).toBe(originalTop)
      expect(testElement.style.left).toBe(originalLeft)
      expect(testElement.style.transform).toBe(originalTransform)

      // Cleanup test element
      document.body.removeChild(testElement)
    })
  })

  describe('Clean Recording Process', () => {
    test('should handle recording lifecycle without side effects', async () => {
      const initialState = {
        isRecording: screenRecorder.isRecording(),
        documentChildren: document.body.children.length,
        windowEvents: Object.keys(window).filter(key => key.startsWith('on')).length
      }

      // Start recording
      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'medium',
        framerate: 30,
        format: 'webm'
      })

      expect(screenRecorder.isRecording()).toBe(true)
      expect(document.body.children.length).toBe(initialState.documentChildren)

      // Stop recording
      const result = await screenRecorder.stopRecording()
      
      expect(screenRecorder.isRecording()).toBe(false)
      expect(result).toBeDefined()
      expect(result?.video).toBeDefined()
      expect(document.body.children.length).toBe(initialState.documentChildren)
    })

    test('should support multiple recording cycles without accumulation', async () => {
      const initialChildren = document.body.children.length

      for (let i = 0; i < 3; i++) {
        await screenRecorder.startRecording({
          area: 'fullscreen',
          audioInput: 'none',
          quality: 'low',
          framerate: 30,
          format: 'webm'
        })

        expect(screenRecorder.isRecording()).toBe(true)
        expect(document.body.children.length).toBe(initialChildren)

        await screenRecorder.stopRecording()
        
        expect(screenRecorder.isRecording()).toBe(false)
        expect(document.body.children.length).toBe(initialChildren)

        // Create new recorder for next iteration
        if (i < 2) {
          screenRecorder = new ScreenRecorder()
        }
      }
    })
  })

  describe('Error Handling', () => {
    test('should not leave DOM artifacts on recording failure', async () => {
      const initialChildren = document.body.children.length

      // Mock a recording failure
      const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia
      navigator.mediaDevices.getDisplayMedia = jest.fn().mockRejectedValue(
        new Error('Permission denied')
      )

      try {
        await screenRecorder.startRecording({
          area: 'fullscreen',
          audioInput: 'none',
          quality: 'high',
          framerate: 30,
          format: 'webm'
        })
      } catch (error) {
        // Expected to fail
      }

      // Should not have added any DOM elements even on failure
      expect(document.body.children.length).toBe(initialChildren)
      expect(screenRecorder.isRecording()).toBe(false)

      // Restore mock
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia
    })

    test('should handle cleanup gracefully when not recording', () => {
      const initialChildren = document.body.children.length
      
      // Should not throw when calling methods on non-recording instance
      expect(() => {
        screenRecorder.pauseRecording()
        screenRecorder.resumeRecording()
      }).not.toThrow()

      expect(document.body.children.length).toBe(initialChildren)
      expect(screenRecorder.isRecording()).toBe(false)
    })
  })
})
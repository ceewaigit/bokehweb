/**
 * Canvas Recording Visual Tests
 * Tests for the new simplified recording architecture
 * Since the new architecture doesn't use canvas overlays, these tests verify clean recording
 */

import { ScreenRecorder } from '@/lib/recording'

describe('Canvas Recording Visual Tests', () => {
  let screenRecorder: ScreenRecorder

  beforeEach(() => {
    screenRecorder = new ScreenRecorder()
  })

  afterEach(() => {
    // Cleanup
    screenRecorder = null as any
  })

  describe('Simplified Recording Architecture', () => {
    test('should not create any visual elements during recording', async () => {
      const initialChildren = document.body.children.length
      
      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'none',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      })

      // New architecture should not add any DOM elements
      expect(document.body.children.length).toBe(initialChildren)
      
      await screenRecorder.stopRecording()
      
      // Still no DOM elements added
      expect(document.body.children.length).toBe(initialChildren)
    })

    test('should handle different recording qualities without visual artifacts', async () => {
      const qualities = ['low', 'medium', 'high'] as const
      const initialChildren = document.body.children.length

      for (const quality of qualities) {
        await screenRecorder.startRecording({
          area: 'fullscreen',
          audioInput: 'system',
          quality,
          framerate: 30,
          format: 'webm'
        })

        expect(document.body.children.length).toBe(initialChildren)
        expect(screenRecorder.isRecording()).toBe(true)

        const result = await screenRecorder.stopRecording()
        expect(result).toBeDefined()
        expect(result?.video).toBeDefined()
        expect(document.body.children.length).toBe(initialChildren)

        // Create new recorder for next iteration
        if (quality !== 'high') {
          screenRecorder = new ScreenRecorder()
        }
      }
    })

    test('should handle different formats without visual interference', async () => {
      const formats = ['webm', 'mp4'] as const
      const initialChildren = document.body.children.length

      for (const format of formats) {
        await screenRecorder.startRecording({
          area: 'fullscreen',
          audioInput: 'none',
          quality: 'medium',
          framerate: 30,
          format
        })

        expect(document.body.children.length).toBe(initialChildren)
        expect(screenRecorder.isRecording()).toBe(true)

        await screenRecorder.stopRecording()
        expect(document.body.children.length).toBe(initialChildren)

        // Create new recorder for next iteration
        if (format !== 'mp4') {
          screenRecorder = new ScreenRecorder()
        }
      }
    })
  })

  describe('Clean State Management', () => {
    test('should maintain clean state throughout recording lifecycle', async () => {
      const initialState = {
        isRecording: screenRecorder.isRecording(),
        documentChildren: document.body.children.length
      }

      // Verify initial state
      expect(initialState.isRecording).toBe(false)

      // Start recording
      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'medium',
        framerate: 30,
        format: 'webm'
      })

      // Recording state
      expect(screenRecorder.isRecording()).toBe(true)
      expect(document.body.children.length).toBe(initialState.documentChildren)

      // Pause/resume (testing state management)
      screenRecorder.pauseRecording()
      expect(screenRecorder.getRecordingState().isPaused).toBe(true)
      expect(document.body.children.length).toBe(initialState.documentChildren)

      screenRecorder.resumeRecording()
      expect(screenRecorder.getRecordingState().isPaused).toBe(false)
      expect(document.body.children.length).toBe(initialState.documentChildren)

      // Stop recording
      const result = await screenRecorder.stopRecording()
      
      expect(screenRecorder.isRecording()).toBe(false)
      expect(result).toBeDefined()
      expect(document.body.children.length).toBe(initialState.documentChildren)
    })

    test('should handle rapid start/stop cycles cleanly', async () => {
      const initialChildren = document.body.children.length

      for (let i = 0; i < 5; i++) {
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
        if (i < 4) {
          screenRecorder = new ScreenRecorder()
        }
      }
    })
  })

  describe('Error Handling', () => {
    test('should maintain clean state on recording errors', async () => {
      const initialChildren = document.body.children.length

      // Mock a failure
      const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia
      navigator.mediaDevices.getDisplayMedia = jest.fn().mockRejectedValue(
        new Error('Mock permission denied')
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

      // Should not have added any DOM elements or left recording state dirty
      expect(document.body.children.length).toBe(initialChildren)
      expect(screenRecorder.isRecording()).toBe(false)

      // Restore
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia
    })

    test('should handle invalid settings gracefully', async () => {
      const initialChildren = document.body.children.length

      // Test with invalid settings - should either work or fail cleanly
      try {
        await screenRecorder.startRecording({
          area: 'fullscreen',
          audioInput: 'invalid' as any,
          quality: 'invalid' as any,
          framerate: -1,
          format: 'invalid' as any
        })

        // If it succeeds, should still be clean
        expect(document.body.children.length).toBe(initialChildren)
        
        if (screenRecorder.isRecording()) {
          await screenRecorder.stopRecording()
        }
      } catch (error) {
        // If it fails, should still be clean
        expect(document.body.children.length).toBe(initialChildren)
        expect(screenRecorder.isRecording()).toBe(false)
      }

      expect(document.body.children.length).toBe(initialChildren)
    })
  })

  describe('Metadata Collection', () => {
    test('should collect metadata without visual interference', async () => {
      const initialChildren = document.body.children.length

      await screenRecorder.startRecording({
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 30,
        format: 'webm'
      })

      // Wait a bit for potential metadata collection
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(document.body.children.length).toBe(initialChildren)
      expect(screenRecorder.isRecording()).toBe(true)

      const result = await screenRecorder.stopRecording()
      
      expect(result).toBeDefined()
      expect(result?.metadata).toBeDefined()
      expect(Array.isArray(result?.metadata)).toBe(true)
      expect(document.body.children.length).toBe(initialChildren)
    })
  })
})
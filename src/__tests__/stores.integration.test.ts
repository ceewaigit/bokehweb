/**
 * Integration tests for Zustand stores
 * Tests actual store functionality, not mocks
 */

import { useRecordingStore } from '@/stores/recording-store'
import { useTimelineStore } from '@/stores/timeline-store'
import { useAnimationStore } from '@/stores/animation-store'

describe('Store Integration Tests', () => {
  beforeEach(() => {
    // Reset all stores to initial state
    useRecordingStore.setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      status: 'idle',
      settings: {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 60,
        format: 'webm'
      }
    })

    useTimelineStore.setState({
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      zoom: 1,
      selectedClips: [],
      project: null
    })

    useAnimationStore.setState({
      animations: [],
      activeAnimations: new Map(),
      isPlaying: false,
      currentTime: 0
    })
  })

  describe('Recording Store', () => {
    test('should update recording state correctly', () => {
      const store = useRecordingStore.getState()
      
      // Start recording
      store.setRecording(true)
      const state1 = useRecordingStore.getState()
      expect(state1.isRecording).toBe(true)
      expect(state1.status).toBe('recording')

      // Pause recording
      store.setPaused(true)
      const state2 = useRecordingStore.getState()
      expect(state2.isPaused).toBe(true)
      expect(state2.status).toBe('paused')

      // Stop recording
      store.setRecording(false)
      store.setPaused(false)
      const state3 = useRecordingStore.getState()
      expect(state3.isRecording).toBe(false)
      expect(state3.isPaused).toBe(false)
      expect(state3.status).toBe('idle')
    })

    test('should update duration', () => {
      const store = useRecordingStore.getState()
      
      store.setDuration(5000)
      expect(useRecordingStore.getState().duration).toBe(5000)
    })

    test('should update settings', () => {
      const store = useRecordingStore.getState()
      
      store.updateSettings({ quality: 'low', framerate: 30 })
      const settings = useRecordingStore.getState().settings
      expect(settings.quality).toBe('low')
      expect(settings.framerate).toBe(30)
      expect(settings.area).toBe('fullscreen') // Should keep existing values
    })

    test('should reset state correctly', () => {
      const store = useRecordingStore.getState()
      
      // Set some state
      store.setRecording(true)
      store.setDuration(10000)
      store.setStatus('recording')
      
      // Reset
      store.reset()
      const state = useRecordingStore.getState()
      
      expect(state.isRecording).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.duration).toBe(0)
      expect(state.status).toBe('idle')
      // Settings should NOT be reset
      expect(state.settings).toBeDefined()
    })
  })

  describe('Timeline Store', () => {
    test('should create and manage projects', () => {
      const store = useTimelineStore.getState()
      
      store.createNewProject('Test Project')
      const project = useTimelineStore.getState().project
      
      expect(project).toBeTruthy()
      expect(project!.name).toBe('Test Project')
      expect(project!.clips).toHaveLength(0)
      expect(project!.animations).toHaveLength(0)
    })

    test('should add and manage clips', () => {
      const store = useTimelineStore.getState()
      
      // Create project first
      store.createNewProject('Test Project')
      
      // Add clip
      const clip = {
        id: 'clip1',
        name: 'Test Clip',
        type: 'video' as const,
        source: 'test.mp4',
        startTime: 0,
        duration: 5000,
        trackIndex: 0
      }
      
      store.addClip(clip)
      const project = useTimelineStore.getState().project
      
      expect(project!.clips).toHaveLength(1)
      expect(project!.clips[0]).toEqual(clip)
    })

    test('should not add clips without project', () => {
      const store = useTimelineStore.getState()
      
      const clip = {
        id: 'clip1',
        name: 'Test Clip',
        type: 'video' as const,
        source: 'test.mp4',
        startTime: 0,
        duration: 5000,
        trackIndex: 0
      }
      
      store.addClip(clip)
      const project = useTimelineStore.getState().project
      
      expect(project).toBeNull()
    })

    test('should handle clip selection', () => {
      const store = useTimelineStore.getState()
      
      // Select clip
      store.selectClip('clip1', false)
      expect(useTimelineStore.getState().selectedClips).toEqual(['clip1'])
      
      // Multi-select
      store.selectClip('clip2', true)
      expect(useTimelineStore.getState().selectedClips).toEqual(['clip1', 'clip2'])
      
      // Deselect in multi-select
      store.selectClip('clip1', true)
      expect(useTimelineStore.getState().selectedClips).toEqual(['clip2'])
      
      // Clear selection
      store.clearSelection()
      expect(useTimelineStore.getState().selectedClips).toEqual([])
    })

    test('should constrain zoom levels', () => {
      const store = useTimelineStore.getState()
      
      store.setZoom(0.05) // Too low
      expect(useTimelineStore.getState().zoom).toBe(0.1)
      
      store.setZoom(15) // Too high
      expect(useTimelineStore.getState().zoom).toBe(10)
      
      store.setZoom(2) // Valid
      expect(useTimelineStore.getState().zoom).toBe(2)
    })
  })

  describe('Animation Store', () => {
    test('should add and manage animations', () => {
      const store = useAnimationStore.getState()
      
      const animation = {
        id: 'anim1',
        target: '.test',
        property: 'transform',
        keyframes: [
          { time: 0, value: { x: 0 } },
          { time: 1000, value: { x: 100 } }
        ]
      }
      
      store.addAnimation(animation)
      const animations = useAnimationStore.getState().animations
      
      expect(animations).toHaveLength(1)
      expect(animations[0]).toEqual(animation)
    })

    test('should remove animations', () => {
      const store = useAnimationStore.getState()
      
      // Add animations
      store.addAnimation({
        id: 'anim1',
        target: '.test1',
        property: 'opacity',
        keyframes: [{ time: 0, value: { opacity: 0 } }]
      })
      
      store.addAnimation({
        id: 'anim2', 
        target: '.test2',
        property: 'transform',
        keyframes: [{ time: 0, value: { x: 0 } }]
      })
      
      // Remove one
      store.removeAnimation('anim1')
      const animations = useAnimationStore.getState().animations
      
      expect(animations).toHaveLength(1)
      expect(animations[0].id).toBe('anim2')
    })

    test('should update animations', () => {
      const store = useAnimationStore.getState()
      
      store.addAnimation({
        id: 'anim1',
        target: '.test',
        property: 'transform',
        keyframes: [{ time: 0, value: { x: 0 } }]
      })
      
      store.updateAnimation('anim1', { property: 'opacity' })
      const animation = useAnimationStore.getState().animations[0]
      
      expect(animation.property).toBe('opacity')
      expect(animation.target).toBe('.test') // Should keep other properties
    })

    test('should manage playback state', () => {
      const store = useAnimationStore.getState()
      
      // Test seek
      store.seek(500)
      expect(useAnimationStore.getState().currentTime).toBe(500)
      
      // Test negative seek (should clamp to 0)
      store.seek(-100)
      expect(useAnimationStore.getState().currentTime).toBe(0)
    })
  })

  describe('Cross-Store Integration', () => {
    test('should work together for recording workflow', () => {
      const recordingStore = useRecordingStore.getState()
      const timelineStore = useTimelineStore.getState()
      
      // Create project
      timelineStore.createNewProject('Recording Test')
      
      // Start recording
      recordingStore.setRecording(true)
      recordingStore.setStatus('recording')
      
      // Simulate recording duration
      recordingStore.setDuration(5000)
      
      // Stop recording  
      recordingStore.setRecording(false)
      recordingStore.setStatus('idle')
      
      // Add recorded clip to timeline
      timelineStore.addClip({
        id: 'recorded-clip',
        name: 'Recording',
        type: 'video',
        source: 'recording.webm',
        startTime: 0,
        duration: 5000,
        trackIndex: 0
      })
      
      // Verify final state
      const finalRecording = useRecordingStore.getState()
      const finalTimeline = useTimelineStore.getState()
      
      expect(finalRecording.isRecording).toBe(false)
      expect(finalRecording.status).toBe('idle')
      expect(finalTimeline.project!.clips).toHaveLength(1)
      expect(finalTimeline.project!.clips[0].duration).toBe(5000)
    })
  })
})
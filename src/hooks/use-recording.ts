"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRecordingStore } from '@/stores/recording-store'
import { useTimelineStore } from '@/stores/timeline-store'
import { ScreenRecorder, type RecordingResult } from '@/lib/recording/screen-recorder'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
// Processing progress type
interface ProcessingProgress {
  progress: number
  phase: string
  message?: string
  currentFrame?: number
  totalFrames?: number
}

// Constants for better maintainability
const RECORDING_CONSTANTS = {
  METADATA_TIMEOUT: 3000,
  DURATION_SYNC_THRESHOLD: 2000,
  TIMER_INTERVAL: 1000,
} as const

const RECORDING_EVENTS = {
  STARTED: 'screen-recorder-recording-started',
  STOPPED: 'screen-recorder-recording-stopped',
  ERROR: 'screen-recorder-error',
} as const

// Types for better type safety
interface EnhancementSettings {
  enableAutoZoom?: boolean
  zoomSensitivity?: number
  maxZoom?: number
  showCursor?: boolean
  cursorSize?: number
  cursorColor?: string
  showClickEffects?: boolean
  clickEffectColor?: string
  [key: string]: any
}

export function useRecording() {
  const recorderRef = useRef<ScreenRecorder | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const [isTimerSynced, setIsTimerSynced] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null)
  
  const { 
    isRecording, 
    isPaused, 
    settings, 
    setRecording, 
    setPaused, 
    setDuration, 
    setStatus 
  } = useRecordingStore()

  const { addClip, project, createNewProject } = useTimelineStore()

  // Simple duration validation - no longer needed with proper MediaRecorder
  const validateResult = useCallback((result: RecordingResult): boolean => {
    // Basic validation - just check that we have a video blob
    return result && result.video && result.video.size > 0
  }, [])

  // Better error handling - replace alerts with logging for now
  const handleRecordingError = useCallback((error: unknown) => {
    console.error('❌ Recording error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isPermissionError = errorMessage.toLowerCase().includes('permission')
    
    if (isPermissionError) {
      console.warn('🔒 Permission error detected')
      
      // Check if it's our special permission required message
      if (errorMessage.startsWith('PERMISSION_REQUIRED:')) {
        // Extract the actual message after the prefix
        const userMessage = errorMessage.replace('PERMISSION_REQUIRED: ', '')
        alert(`🔓 Screen Recording Permission\n\n${userMessage}`)
      } else if (errorMessage.startsWith('PERMISSION_WAITING:')) {
        // This is the waiting for permission message
        const userMessage = errorMessage.replace('PERMISSION_WAITING: ', '')
        alert(`⏳ Waiting for Permission\n\n${userMessage}`)
      } else if (errorMessage.startsWith('PERMISSION_TIMEOUT:')) {
        // Permission check timed out
        const userMessage = errorMessage.replace('PERMISSION_TIMEOUT: ', '')
        alert(`⏱️ Permission Timeout\n\n${userMessage}`)
      } else {
        alert(`🎥 Screen Recording Permission Required\n\nPlease enable screen recording for Screen Studio:\n\n1. System Preferences will open automatically\n2. Check the box next to "Screen Studio"\n3. You may need to restart the app\n4. Then click "Record" again`)
      }
    } else if (errorMessage.includes('electron desktopCapturer not available')) {
      console.error('📹 Electron not available')
      alert(`⚠️ Desktop Recording Not Available\n\nScreen Studio requires the Electron desktop app for screen recording.\n\nPlease make sure you're running the desktop version of the app.`)
    } else {
      console.error('📹 Recording failed:', errorMessage)
      alert(`Failed to start recording: ${errorMessage}`)
    }
  }, [])

  // Initialize recorder with hot reload protection
  useEffect(() => {
    // Check if there's already a global recorder instance to prevent hot reload issues
    if (typeof window !== 'undefined' && (window as any).__screenRecorder) {
      console.log('♻️ Reusing existing ScreenRecorder instance (hot reload protection)')
      recorderRef.current = (window as any).__screenRecorder
      
      // CRITICAL: If the existing recorder is actively recording, don't allow any new setup
      if (recorderRef.current?.isRecording()) {
        console.log('🔒 Existing recorder is actively recording - blocking any new initialization')
        return
      }
    } else if (!recorderRef.current) {
      // Only create new recorder if there's no global instance AND we're not recording
      if (typeof window !== 'undefined' && (window as any).__screenRecorderActive) {
        console.log('🔒 Recording active globally, preventing new ScreenRecorder creation')
        return
      }
      
      try {
        recorderRef.current = new ScreenRecorder()
        // Store globally to persist across hot reloads
        if (typeof window !== 'undefined') {
          (window as any).__screenRecorder = recorderRef.current
        }
        console.log('✅ Screen recorder initialized')
      } catch (error) {
        console.error('❌ Failed to initialize screen recorder:', error)
        recorderRef.current = null
      }
    }
    
    // Debug: Check if we're in the middle of a recording when component reinitializes
    if (isRecording) {
      console.log('⚠️ Component reinitialized while recording - preserving existing recording state')
      console.log('⏱️ Current duration:', useRecordingStore.getState().duration, 'ms')
      
      // If we have an active recording but no timer, we need to restore it
      if (!durationIntervalRef.current && !isTimerSynced) {
        console.log('⏱️ Restoring timer for ongoing recording')
        const currentDuration = useRecordingStore.getState().duration
        startTimeRef.current = Date.now() - currentDuration
        setIsTimerSynced(true)
        
        durationIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current
          setDuration(elapsed)
          console.log(`⏱️ Timer tick (restored): ${Math.floor(elapsed / 1000)}s (${elapsed}ms)`)
        }, RECORDING_CONSTANTS.TIMER_INTERVAL)
        
        console.log('⏱️ Timer restored for ongoing recording')
      }
    }
    
      // Cleanup on unmount
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
    }
  }, [setDuration, isRecording, isTimerSynced]) // Include all dependencies

  const startRecording = useCallback(async (sourceId?: string, enhancementSettings?: any) => {
    if (!recorderRef.current || isRecording) {
      if (isRecording) {
        console.log('⚠️ Recording already in progress')
      }
      return
    }

    try {
      setStatus('preparing')
      setIsTimerSynced(false)
      
      // Enable enhancements if provided
      if (enhancementSettings) {
        console.log('🎨 Enabling Screen Studio effects:', enhancementSettings)
        recorderRef.current.enableEnhancements(enhancementSettings)
        
      }
      
      // Start recording with simplified approach
      await recorderRef.current.startRecording(settings, sourceId)

      setRecording(true)
      setStatus('recording')
      
      // Mark recording as globally active
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = true
      }

      console.log('✅ Recording started successfully')
      
    } catch (error) {
      handleRecordingError(error)
      setStatus('idle')
      setRecording(false)
      setIsTimerSynced(false)
    }
  }, [isRecording, setRecording, setStatus, settings, handleRecordingError])

  const stopRecording = useCallback(async () => {
    console.log('🎯 useRecording.stopRecording called')
    
    // Check store state first to prevent double-stops
    const currentState = useRecordingStore.getState()
    if (!currentState.isRecording) {
      console.log('🔒 useRecording: Not currently recording according to store - ignoring stop call')
      return null
    }
    
    const recorder = recorderRef.current
    if (!recorder?.isRecording()) {
      console.log('🔒 useRecording: Recorder not in recording state - ignoring stop call')
      return null
    }

    try {
      console.log('🛑 Stopping recording...')
      
      // Immediately update state to prevent double-stops
      setRecording(false)
      setStatus('processing')
      
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }

      // Stop recording and get result
      const result = await recorder.stopRecording()
      if (!result || !validateResult(result)) {
        throw new Error('Invalid recording result')
      }

      // Clear processing progress when done
      setProcessingProgress(null)

      console.log(`📹 Recording complete: ${result.duration}ms, ${result.video.size} bytes, ${result.metadata.length} events`)
      
      if (result.enhancedVideo) {
        console.log(`✨ Enhanced video available: ${result.enhancedVideo.size} bytes, effects: ${result.effectsApplied?.join(', ')}, processing: ${result.processingTime?.toFixed(2)}ms`)
      }

      // Reset remaining state (recording already set to false above)
      setPaused(false)
      setStatus('idle')
      setIsTimerSynced(false)
      
      // Clear global recording state
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      // Add to timeline
      if (result.video) {
        let currentProject = project
        
        if (!currentProject) {
          createNewProject(`Recording ${new Date().toLocaleDateString()}`)
          currentProject = useTimelineStore.getState().project
        }
        
        if (currentProject) {
          const clipId = `recording-${Date.now()}`
          // Use enhanced video if available, otherwise use original
          const videoToUse = result.enhancedVideo || result.video
          const videoUrl = globalBlobManager.create(videoToUse)
          
          // Also store original video for backup
          const originalVideoUrl = globalBlobManager.create(result.video)
          
          // Save metadata to localStorage for cursor rendering
          if (result.metadata && result.metadata.length > 0) {
            try {
              localStorage.setItem(`clip-metadata-${clipId}`, JSON.stringify(result.metadata))
              console.log(`💾 Saved ${result.metadata.length} metadata events for clip ${clipId}`)
            } catch (e) {
              console.error('Failed to save metadata:', e)
            }
          }
          
          const clipName = result.enhancedVideo 
            ? `Enhanced Recording ${new Date().toLocaleTimeString()}`
            : `Recording ${new Date().toLocaleTimeString()}`
          
          addClip({
            id: clipId,
            name: clipName,
            type: 'video',
            source: videoUrl,
            startTime: 0,
            duration: result.duration,
            trackIndex: 0,
            thumbnail: '',
            originalSource: originalVideoUrl,
          })
          
          if (result.enhancedVideo) {
            console.log('✅ Enhanced clip added to timeline')
          } else {
            console.log('✅ Clip added to timeline')
          }
        }
      }

      return result
    } catch (error) {
      console.error('❌ Failed to stop recording:', error)
      
      // Reset state on error
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      setRecording(false)
      setPaused(false)
      setStatus('idle')
      setIsTimerSynced(false)
      
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }
      
      // Clear processing progress on error
      setProcessingProgress(null)
      
      return null
    }
  }, [project, setRecording, setPaused, setStatus, addClip, createNewProject, validateResult])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.pauseRecording()
      setPaused(true)
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
    }
  }, [isRecording, setPaused])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && isPaused) {
      recorderRef.current.resumeRecording()
      setPaused(false)
      
      // Resume duration timer from current duration
      const currentDurationMs = useRecordingStore.getState().duration
      startTimeRef.current = Date.now() - currentDurationMs
      
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        setDuration(elapsed)
      }, RECORDING_CONSTANTS.TIMER_INTERVAL)
    }
  }, [isPaused, setPaused, setDuration])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [])

  return {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    isRecording,
    isPaused,
    processingProgress,
    screenRecorder: recorderRef.current,
    isSupported: typeof navigator !== 'undefined' && 
                 typeof navigator.mediaDevices !== 'undefined' &&
                 typeof navigator.mediaDevices.getDisplayMedia === 'function',
    getAvailableSources: async () => [
      { id: 'screen', name: 'Screen', type: 'screen' },
      { id: 'window', name: 'Window', type: 'window' }
    ],
    duration: 0 // Duration is managed by the store
  }
}
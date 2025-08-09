"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRecordingStore } from '@/stores/recording-store'
import { useProjectStore } from '@/stores/project-store'
import { ScreenRecorder, type RecordingResult } from '@/lib/recording/screen-recorder'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { logger } from '@/lib/utils/logger'
import { createProject, type Recording, type MouseEvent as ProjectMouseEvent } from '@/types/project'
import type { EnhancementSettings } from '@/lib/recording/screen-recorder'
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

  const { project, createNewProject } = useProjectStore()

  // Simple duration validation - no longer needed with proper MediaRecorder
  const validateResult = useCallback((result: RecordingResult): boolean => {
    // Basic validation - just check that we have a video blob
    return result && result.video && result.video.size > 0
  }, [])

  // Better error handling - replace alerts with logging for now
  const handleRecordingError = useCallback((error: unknown) => {
    logger.error('Recording error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isPermissionError = errorMessage.toLowerCase().includes('permission')
    
    if (isPermissionError) {
      logger.warn('Permission error detected')
      
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
      logger.error('Electron not available')
      alert(`⚠️ Desktop Recording Not Available\n\nScreen Studio requires the Electron desktop app for screen recording.\n\nPlease make sure you're running the desktop version of the app.`)
    } else {
      logger.error('Recording failed:', errorMessage)
      alert(`Failed to start recording: ${errorMessage}`)
    }
  }, [])

  // Initialize recorder with hot reload protection
  useEffect(() => {
    // Check if there's already a global recorder instance to prevent hot reload issues
    if (typeof window !== 'undefined' && (window as any).__screenRecorder) {
      logger.debug('Reusing existing ScreenRecorder instance (hot reload protection)')
      recorderRef.current = (window as any).__screenRecorder
      
      // CRITICAL: If the existing recorder is actively recording, don't allow any new setup
      if (recorderRef.current?.isRecording()) {
        logger.debug('Existing recorder is actively recording - blocking any new initialization')
        return
      }
    } else if (!recorderRef.current) {
      // Only create new recorder if there's no global instance AND we're not recording
      if (typeof window !== 'undefined' && (window as any).__screenRecorderActive) {
        logger.debug('Recording active globally, preventing new ScreenRecorder creation')
        return
      }
      
      try {
        recorderRef.current = new ScreenRecorder()
        // Store globally to persist across hot reloads
        if (typeof window !== 'undefined') {
          (window as any).__screenRecorder = recorderRef.current
        }
        logger.info('Screen recorder initialized')
      } catch (error) {
        logger.error('Failed to initialize screen recorder:', error)
        recorderRef.current = null
      }
    }
    
    // Debug: Check if we're in the middle of a recording when component reinitializes
    if (isRecording) {
      logger.debug('Component reinitialized while recording - preserving existing recording state')
      logger.debug('Current duration:', useRecordingStore.getState().duration, 'ms')
      
      // If we have an active recording but no timer, we need to restore it
      if (!durationIntervalRef.current && !isTimerSynced) {
        logger.debug('Restoring timer for ongoing recording')
        const currentDuration = useRecordingStore.getState().duration
        startTimeRef.current = Date.now() - currentDuration
        setIsTimerSynced(true)
        
        durationIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current
          setDuration(elapsed)
          logger.debug(`Timer tick (restored): ${Math.floor(elapsed / 1000)}s (${elapsed}ms)`)
        }, RECORDING_CONSTANTS.TIMER_INTERVAL)
        
        logger.debug('Timer restored for ongoing recording')
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

  const startRecording = useCallback(async (_sourceId?: string, enhancementSettings?: EnhancementSettings) => {
    if (!recorderRef.current || isRecording) {
      if (isRecording) {
        logger.debug('Recording already in progress')
      }
      return
    }

    try {
      setStatus('preparing')
      setIsTimerSynced(false)
      
      // Start recording with enhancements if provided
      await recorderRef.current.startRecording(settings, enhancementSettings)

      setRecording(true)
      setStatus('recording')
      
      // Start duration timer
      startTimeRef.current = Date.now()
      setDuration(0) // Reset duration to 0
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        setDuration(elapsed)
        logger.debug(`Timer tick: ${Math.floor(elapsed / 1000)}s (${elapsed}ms)`)
      }, RECORDING_CONSTANTS.TIMER_INTERVAL)
      setIsTimerSynced(true)
      
      // Mark recording as globally active
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = true
      }

      logger.info('Recording started successfully with timer')
      
    } catch (error) {
      handleRecordingError(error)
      setStatus('idle')
      setRecording(false)
      setIsTimerSynced(false)
    }
  }, [isRecording, setRecording, setStatus, settings, handleRecordingError])

  const stopRecording = useCallback(async () => {
    logger.debug('useRecording.stopRecording called')
    
    // Check store state first to prevent double-stops
    const currentState = useRecordingStore.getState()
    if (!currentState.isRecording) {
      logger.debug('useRecording: Not currently recording according to store - ignoring stop call')
      return null
    }
    
    const recorder = recorderRef.current
    if (!recorder?.isRecording()) {
      logger.debug('useRecording: Recorder not in recording state - ignoring stop call')
      return null
    }

    try {
      logger.info('Stopping recording...')
      
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

      logger.info(`Recording complete: ${result.duration}ms, ${result.video.size} bytes, ${result.metadata.length} events`)
      
      if (result.enhancedVideo) {
        logger.info(`Enhanced video available: ${result.enhancedVideo.size} bytes, effects: ${result.effectsApplied?.join(', ')}, processing: ${result.processingTime?.toFixed(2)}ms`)
      }

      // Reset remaining state (recording already set to false above)
      setPaused(false)
      setStatus('idle')
      setIsTimerSynced(false)
      
      // Clear global recording state
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      // Create and save project file with recording
      if (result.video) {
        const recordingId = `recording-${Date.now()}`
        const projectName = `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
        
        // First save the raw video file
        let videoFilePath: string | undefined
        if (window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
          try {
            const recordingsDir = await window.electronAPI.getRecordingsDirectory()
            const videoFileName = `${recordingId}.webm`
            videoFilePath = `${recordingsDir}/${videoFileName}`
            const buffer = await result.video.arrayBuffer()
            await window.electronAPI.saveRecording(videoFilePath, buffer)
            logger.info(`Video saved to: ${videoFilePath}`)
          } catch (error) {
            logger.error('Failed to save video file:', error)
          }
        }
        
        // Create a new project in our custom format
        const newProject = createProject(projectName)
        
        // Get actual screen dimensions
        const screenWidth = typeof window !== 'undefined' ? window.screen.width : 1920
        const screenHeight = typeof window !== 'undefined' ? window.screen.height : 1080
        
        // Convert metadata to project format
        const mouseEvents: ProjectMouseEvent[] = result.metadata
          .filter(m => m.eventType === 'mouse')
          .map(m => ({
            timestamp: m.timestamp,
            x: m.mouseX,
            y: m.mouseY,
            screenWidth,
            screenHeight
          }))
        
        // Add recording to project
        const recording: Recording = {
          id: recordingId,
          filePath: videoFilePath || '',
          duration: result.duration,
          width: screenWidth,
          height: screenHeight,
          frameRate: settings.framerate || 60,
          metadata: {
            mouseEvents,
            keyboardEvents: result.metadata
              .filter(m => m.eventType === 'keypress')
              .map(m => ({
                timestamp: m.timestamp,
                key: m.key || '',
                modifiers: []
              })),
            clickEvents: result.metadata
              .filter(m => m.eventType === 'click')
              .map(m => ({
                timestamp: m.timestamp,
                x: m.mouseX,
                y: m.mouseY,
                button: 'left' as const
              })),
            screenEvents: []
          }
        }
        
        newProject.recordings.push(recording)
        
        // Add clip to timeline with default effects
        newProject.timeline.tracks[0].clips.push({
          id: `clip-${Date.now()}`,
          recordingId,
          startTime: 0,
          duration: result.duration,
          sourceIn: 0,
          sourceOut: result.duration,
          effects: {
            zoom: {
              enabled: true,
              keyframes: [],
              sensitivity: 1.0,
              maxZoom: 2.0,
              smoothing: 0.1
            },
            cursor: {
              visible: true,
              style: 'macOS',
              size: 1.2,
              color: '#ffffff',
              clickEffects: true,
              motionBlur: true
            },
            background: {
              type: 'gradient',
              gradient: {
                colors: ['#1a1a2e', '#0f0f1e'],
                angle: 135
              },
              padding: 40
            },
            video: {
              cornerRadius: 12,
              shadow: {
                enabled: true,
                blur: 40,
                color: '#000000',
                offset: { x: 0, y: 20 }
              }
            },
            annotations: []
          }
        })
        
        // Update timeline duration
        newProject.timeline.duration = result.duration
        
        // Save the project as .ssproj file
        if (window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
          try {
            const recordingsDir = await window.electronAPI.getRecordingsDirectory()
            const projectFileName = `${recordingId}.ssproj`
            const projectFilePath = `${recordingsDir}/${projectFileName}`
            const projectData = JSON.stringify(newProject, null, 2)
            
            // Save as text file with our custom extension
            await window.electronAPI.saveRecording(
              projectFilePath,
              new TextEncoder().encode(projectData).buffer
            )
            logger.info(`Project saved to: ${projectFilePath}`)
            
            // Also save to localStorage for quick access
            localStorage.setItem(`project-${newProject.id}`, projectData)
          } catch (error) {
            logger.error('Failed to save project file:', error)
          }
        }
        
        // Update the project store with the new recording
        let currentProject = project
        if (!currentProject) {
          createNewProject(projectName)
          currentProject = useProjectStore.getState().project
        }
        
        if (currentProject && result.video) {
          // Store the video blob for preview
          const videoUrl = globalBlobManager.create(result.video)
          localStorage.setItem(`recording-blob-${recordingId}`, videoUrl)
          
          // Save metadata for preview rendering
          localStorage.setItem(`recording-metadata-${recordingId}`, JSON.stringify(result.metadata))
          
          // Add the recording to the project with all metadata
          const projectStore = useProjectStore.getState()
          projectStore.addRecording(recording, result.video)
          
          logger.info(`Added recording ${recordingId} to project with ${mouseEvents.length} mouse events`)  
        }
      }

      return result
    } catch (error) {
      logger.error('Failed to stop recording:', error)
      
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
  }, [project, setRecording, setPaused, setStatus, createNewProject, validateResult])

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
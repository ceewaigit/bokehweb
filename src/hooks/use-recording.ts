"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRecordingStore } from '@/stores/recording-store'
import { useProjectStore } from '@/stores/project-store'
import { ElectronRecorder, type ElectronRecordingResult } from '@/lib/recording'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { logger } from '@/lib/utils/logger'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useRecordingTimer } from './use-recording-timer'
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
  const recorderRef = useRef<ElectronRecorder | null>(null)
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

  const { currentProject, newProject } = useProjectStore()

  // Use the recording timer hook
  const timer = useRecordingTimer({
    onTick: setDuration,
    interval: RECORDING_CONSTANTS.TIMER_INTERVAL
  })

  // Simple duration validation - no longer needed with proper MediaRecorder
  const validateResult = useCallback((result: ElectronRecordingResult): boolean => {
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

  // Initialize recorder
  useEffect(() => {
    if (!recorderRef.current) {
      try {
        recorderRef.current = new ElectronRecorder()
        logger.info('Screen recorder initialized')
      } catch (error) {
        logger.error('Failed to initialize screen recorder:', error)
        recorderRef.current = null
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!recorderRef.current || isRecording) {
      if (isRecording) {
        logger.debug('Recording already in progress')
      }
      return
    }

    try {
      setStatus('preparing')

      // Get the current settings from the store to ensure we have the latest values
      const currentSettings = useRecordingStore.getState().settings

      // Start recording (enhancements are now applied during export, not recording)
      await recorderRef.current.startRecording(currentSettings)

      setRecording(true)
      setStatus('recording')

      // Start duration timer
      setDuration(0) // Reset duration to 0
      timer.start(0)
      logger.debug('Timer started for recording')

      // Mark recording as globally active
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = true
      }

      logger.info('Recording started successfully with timer')

    } catch (error) {
      handleRecordingError(error)
      setStatus('idle')
      setRecording(false)
      timer.stop()
    }
  }, [isRecording, setRecording, setStatus, handleRecordingError, timer, setDuration])

  const stopRecording = useCallback(async () => {
    logger.debug('useRecording.stopRecording called')

    // Check store state first to prevent double-stops
    const currentState = useRecordingStore.getState()
    if (!currentState.isRecording) {
      logger.debug('useRecording: Not currently recording according to store - ignoring stop call')
      return null
    }

    const recorder = recorderRef.current
    if (!recorder?.isCurrentlyRecording()) {
      logger.debug('useRecording: Recorder not in recording state - ignoring stop call')
      return null
    }

    try {
      logger.info('Stopping recording...')

      // Immediately update state to prevent double-stops
      setRecording(false)
      setStatus('processing')

      // Stop duration timer
      timer.stop()

      // Stop recording and get result
      const result = await recorder.stopRecording()
      if (!result || !validateResult(result)) {
        throw new Error('Invalid recording result')
      }

      // Clear processing progress when done
      setProcessingProgress(null)

      logger.info(`Recording complete: ${result.duration}ms, ${result.video.size} bytes, ${result.metadata.length} events`)

      // Reset remaining state (recording already set to false above)
      setPaused(false)
      setStatus('idle')

      // Clear global recording state
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      // Use consolidated project saving
      if (result.video) {
        // Create a safe filename without slashes or colons
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const projectName = `Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`

        // Save recording with project using consolidated function
        const saved = await RecordingStorage.saveRecordingWithProject(result.video, result.metadata, projectName, result.captureArea)

        if (saved) {
          logger.info(`Recording saved: video=${saved.videoPath}, project=${saved.projectPath}`)

          // Update the project store
          const projectStore = useProjectStore.getState()
          if (!projectStore.currentProject) {
            projectStore.setProject(saved.project)
          } else {
            // Add to existing project
            const recording = saved.project.recordings[0]
            projectStore.addRecording(recording, result.video)
          }

          // Store video blob for preview with proper description
          const recordingId = saved.project.recordings[0].id
          const videoUrl = globalBlobManager.create(result.video, `recording-${recordingId}`)
          RecordingStorage.setBlobUrl(recordingId, videoUrl)
        }
      }

      return result
    } catch (error) {
      logger.error('Failed to stop recording:', error)

      // Reset state on error
      timer.stop()
      setRecording(false)
      setPaused(false)
      setStatus('idle')

      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      // Clear processing progress on error
      setProcessingProgress(null)

      return null
    }
  }, [setRecording, setPaused, setStatus, validateResult, timer])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.pauseRecording()
      setPaused(true)
      timer.pause()
    }
  }, [isRecording, setPaused, timer])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && isPaused) {
      recorderRef.current.resumeRecording()
      setPaused(false)

      // Resume duration timer from current duration
      const currentDurationMs = useRecordingStore.getState().duration
      timer.resume(currentDurationMs)
    }
  }, [isPaused, setPaused, timer])


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
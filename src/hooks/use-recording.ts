"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { useProjectStore } from '@/stores/project-store'
import { ElectronRecorder, type ElectronRecordingResult } from '@/lib/recording'
import { RecordingError, RecordingErrorCode, PermissionError, ElectronError } from '@/lib/core/errors'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { logger } from '@/lib/utils/logger'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { useTimer } from './use-timer'

export function useRecording() {
  const recorderRef = useRef<ElectronRecorder | null>(null)

  const {
    isRecording,
    isPaused,
    settings,
    setRecording,
    setPaused,
    setDuration,
    setStatus
  } = useRecordingSessionStore()

  // Use the simplified timer hook
  const timer = useTimer((elapsedMs) => {
    setDuration(elapsedMs)
  })

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      timer.stop()
    }
  }, [])


  // Error handling with proper error types
  const handleRecordingError = useCallback((error: unknown) => {
    logger.error('Recording error:', error)

    let userMessage = 'Failed to start recording'
    
    if (error instanceof PermissionError) {
      switch (error.code) {
        case RecordingErrorCode.PERMISSION_WAITING:
          userMessage = `⏳ Waiting for Permission\n\n${error.message}`
          break
        case RecordingErrorCode.PERMISSION_TIMEOUT:
          userMessage = `⏱️ Permission Timeout\n\n${error.message}`
          break
        default:
          userMessage = `🔓 Screen Recording Permission\n\n${error.message}`
      }
    } else if (error instanceof ElectronError) {
      userMessage = `⚠️ Desktop Recording Not Available\n\nScreen Studio requires the Electron desktop app for screen recording.\n\nPlease make sure you're running the desktop version of the app.`
    } else if (error instanceof RecordingError) {
      userMessage = `Recording Error: ${error.message}`
    } else if (error instanceof Error) {
      userMessage = `Failed to start recording: ${error.message}`
    }
    
    alert(userMessage)
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
      const currentSettings = useRecordingSessionStore.getState().settings

      // Start recording (enhancements are now applied during export, not recording)
      await recorderRef.current.startRecording(currentSettings)

      setRecording(true)
      setStatus('recording')

      // Start duration timer only after recording has successfully started
      setDuration(0) // Reset duration to 0

      // Verify recording is actually active before starting timer
      if (recorderRef.current.isCurrentlyRecording()) {
        timer.start(0)
        logger.debug('Timer started for recording')
      } else {
        logger.warn('Recording not active after start, timer not started')
      }

      // Mark recording as globally active
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = true
      }

      logger.info('Recording started successfully with timer')

    } catch (error) {
      handleRecordingError(error)
      setStatus('idle')
      setRecording(false)
      // Ensure timer is stopped on any error
      timer.stop()
      setDuration(0)
    }
  }, [isRecording, setRecording, setStatus, handleRecordingError, timer, setDuration])

  const stopRecording = useCallback(async () => {
    logger.debug('useRecording.stopRecording called')

    // Check store state first to prevent double-stops
    const currentState = useRecordingSessionStore.getState()
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
      if (!result || !result.video || result.video.size === 0) {
        throw new Error('Invalid recording result')
      }


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
        // Pass either the video blob or the video path
        const videoSource = result.videoPath || result.video
        if (!videoSource) {
          throw new Error('No video source available from recording')
        }
        const saved = await RecordingStorage.saveRecordingWithProject(videoSource, result.metadata, projectName, result.captureArea, result.hasAudio, result.duration)

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
          const videoUrl = globalBlobManager.create(result.video, `recording-${recordingId}`, 'video', 10)
          RecordingStorage.setBlobUrl(recordingId, videoUrl)
        }

      }

      return result
    } catch (error) {
      logger.error('Failed to stop recording:', error)

      // Reset state on error - ensure complete cleanup
      timer.stop()
      setDuration(0)
      setRecording(false)
      setPaused(false)
      setStatus('idle')

      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      return null
    }
  }, [setRecording, setPaused, setStatus, timer, setDuration])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && isRecording && !isPaused) {
      try {
        recorderRef.current.pauseRecording()
        setPaused(true)
        timer.pause()
        logger.info('Recording paused')
      } catch (error) {
        logger.error('Failed to pause recording:', error)
      }
    } else {
      logger.debug(`Cannot pause - recording: ${isRecording}, paused: ${isPaused}`)
    }
  }, [isRecording, isPaused, setPaused, timer])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && isPaused && isRecording) {
      try {
        recorderRef.current.resumeRecording()
        setPaused(false)
        timer.resume()
        logger.info('Recording resumed')
      } catch (error) {
        logger.error('Failed to resume recording:', error)
        // On resume failure, try to maintain consistent state
        setPaused(true)
      }
    } else {
      logger.debug(`Cannot resume - recording: ${isRecording}, paused: ${isPaused}`)
    }
  }, [isPaused, isRecording, setPaused, timer])


  return {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    isRecording,
    isPaused,
    screenRecorder: recorderRef.current,
    isSupported: typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function',
    duration: 0 // Duration is managed by the store
  }
}
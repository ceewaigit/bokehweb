"use client"

import { useState, useEffect, useCallback } from 'react'
import { RecordingOverlay, RecordingIndicator, RecordingStatusBar } from '../recording-overlay'
import { ProcessingIndicator } from '../processing-indicator'
import { CountdownTimer } from '../countdown-timer'
import { useRecordingStore } from '@/stores/recording-store'
import { useRecording } from '@/hooks/use-recording'
import { logger } from '@/lib/utils/logger'
import type { RecordingEnhancementSettings } from '@/types/effects'

export function RecordingController() {
  // Modal State
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdownSeconds] = useState(3)

  // Enhancement Settings for Screen Studio effects
  const [enhancementSettings] = useState<RecordingEnhancementSettings | null>({
    // Enable Screen Studio effects by default
    enableAutoZoom: true,
    zoomSensitivity: 1.0,
    maxZoom: 2.5,
    zoomSpeed: 1.0,
    showCursor: true,
    cursorSize: 1.5,
    cursorColor: '#ffffff',
    showClickEffects: true,
    clickEffectSize: 1.0,
    clickEffectColor: '#3b82f6',
    showCursorHighlight: false,
    highlightColor: '#3b82f6',
    motionSensitivity: 1.0,
    enableSmartPanning: true,
    panSpeed: 1.0,
    enableSmoothAnimations: true,
    animationQuality: 'balanced',
    showKeystrokes: false,
    keystrokePosition: 'bottom-right',
  })

  // Hooks
  const { isRecording, isPaused } = useRecordingStore()
  const { startRecording, stopRecording, pauseRecording, resumeRecording, processingProgress } = useRecording()

  // Simple recorder doesn't need enhancement settings applied separately
  // Enhancement settings are used during recording start

  const handleStartRecording = useCallback(async () => {
    // Show countdown timer first
    setShowCountdown(true)
  }, [])

  const handleCountdownComplete = useCallback(async () => {
    setShowCountdown(false)
    try {
      logger.info('Starting recording with Screen Studio effects:', enhancementSettings)
      await startRecording(undefined, enhancementSettings) // Pass enhancement settings
    } catch (error) {
      logger.error('Failed to start recording:', error)
      // Reset recording state on start failure
      try {
        useRecordingStore.getState().reset()
      } catch (resetError) {
        logger.error('Failed to reset recording state after start failure:', resetError)
      }
    }
  }, [startRecording, enhancementSettings])

  const handleCountdownCancel = useCallback(() => {
    setShowCountdown(false)
  }, [])

  const handleStopRecording = useCallback(async () => {
    // Prevent double-stop by checking current state
    const currentState = useRecordingStore.getState()
    if (!currentState.isRecording) {
      logger.debug('Stop recording called but not currently recording - ignoring')
      return
    }

    try {
      logger.info('Stopping recording from controller...')
      const result = await stopRecording()
      if (result) {
        logger.info('Recording completed successfully - clip handled by useRecording hook')
        // useRecording hook handles all clip creation and timeline management
      } else {
        // If no result returned, something went wrong
        logger.error('Stop recording returned null - resetting state')
        useRecordingStore.getState().reset()
      }
    } catch (error) {
      logger.error('Failed to stop recording:', error)
      // Reset recording state on error
      try {
        useRecordingStore.getState().reset()
      } catch (resetError) {
        logger.error('Failed to reset recording state:', resetError)
      }
    }
  }, [stopRecording])

  const handlePauseRecording = useCallback(() => {
    pauseRecording()
  }, [pauseRecording])

  const handleResumeRecording = useCallback(() => {
    resumeRecording()
  }, [resumeRecording])

  // Listen for recording events from other components
  useEffect(() => {
    const handleStartEvent = () => handleStartRecording()
    const handleStopEvent = () => handleStopRecording()
    const handlePauseEvent = () => handlePauseRecording()
    const handleResumeEvent = () => handleResumeRecording()

    window.addEventListener('start-recording', handleStartEvent)
    window.addEventListener('stop-recording', handleStopEvent)
    window.addEventListener('pause-recording', handlePauseEvent)
    window.addEventListener('resume-recording', handleResumeEvent)

    return () => {
      window.removeEventListener('start-recording', handleStartEvent)
      window.removeEventListener('stop-recording', handleStopEvent)
      window.removeEventListener('pause-recording', handlePauseEvent)
      window.removeEventListener('resume-recording', handleResumeEvent)
    }
  }, [handleStartRecording, handleStopRecording, handlePauseRecording, handleResumeRecording])

  // Keyboard shortcuts for recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl key combinations
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault()
            if (!isRecording) {
              handleStartRecording()
            }
            break
          case ' ':
            e.preventDefault()
            if (isRecording) {
              if (isPaused) {
                handleResumeRecording()
              } else {
                handlePauseRecording()
              }
            }
            break
          case 's':
            e.preventDefault()
            if (isRecording) {
              handleStopRecording()
            }
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isRecording, isPaused, handleStartRecording, handlePauseRecording, handleResumeRecording, handleStopRecording])

  return (
    <>
      {/* Countdown Timer */}
      <CountdownTimer
        seconds={countdownSeconds}
        onComplete={handleCountdownComplete}
        onCancel={handleCountdownCancel}
        isVisible={showCountdown}
      />

      {/* Recording Overlays */}
      {isRecording && (
        <>
          <RecordingOverlay
            isVisible={isRecording}
            onStop={handleStopRecording}
            onPause={handlePauseRecording}
            onResume={handleResumeRecording}
            onSettings={() => { }}
          />
          <RecordingIndicator />
          <RecordingStatusBar />
        </>
      )}


      {/* Processing Indicator */}
      <ProcessingIndicator
        isVisible={!!processingProgress}
        progress={processingProgress?.progress || 0}
        phase={processingProgress?.phase || 'processing'}
        message={processingProgress?.message}
        currentFrame={processingProgress?.currentFrame}
        totalFrames={processingProgress?.totalFrames}
      />

      {/* Additional modals can be added here as needed */}

    </>
  )
}
"use client"

import { useState, useEffect, useCallback } from 'react'
import { RecordingOverlay, RecordingIndicator, RecordingStatusBar } from '../recording-overlay'
import { ProcessingIndicator } from '../processing-indicator'
import { CountdownTimer } from '../countdown-timer'
import { useRecordingStore } from '@/stores/recording-store'
import { useRecording } from '@/hooks/use-recording'
import { useConfigStore } from '@/stores/config-store'
import { useEventListener, useDocumentEvent } from '@/hooks/use-event-listener'
import { logger } from '@/lib/utils/logger'
import { safeResetRecording } from '@/lib/utils/recording-helpers'

export function RecordingController() {
  // Modal State
  const [showCountdown, setShowCountdown] = useState(false)
  
  // Get settings from config store
  const { enhancementSettings, defaultCountdown } = useConfigStore()
  const countdownSeconds = defaultCountdown

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
      safeResetRecording()
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
        safeResetRecording()
      }
    } catch (error) {
      logger.error('Failed to stop recording:', error)
      // Reset recording state on error
      safeResetRecording()
    }
  }, [stopRecording])

  const handlePauseRecording = useCallback(() => {
    pauseRecording()
  }, [pauseRecording])

  const handleResumeRecording = useCallback(() => {
    resumeRecording()
  }, [resumeRecording])

  // Listen for recording events from other components
  useEventListener('start-recording' as any, handleStartRecording)
  useEventListener('stop-recording' as any, handleStopRecording)
  useEventListener('pause-recording' as any, handlePauseRecording)
  useEventListener('resume-recording' as any, handleResumeRecording)

  // Keyboard shortcuts for recording
  useDocumentEvent('keydown', useCallback((e: KeyboardEvent) => {
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
  }, [isRecording, isPaused, handleStartRecording, handlePauseRecording, handleResumeRecording, handleStopRecording]))

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
"use client"

import { useCallback } from 'react'
import { RecordingOverlay, RecordingIndicator, RecordingStatusBar } from '../recording-overlay'
import { ProcessingIndicator } from '../processing-indicator'
import { useRecordingStore } from '@/stores/recording-store'
import { useRecording } from '@/hooks/use-recording'
import { useEventListener, useDocumentEvent } from '@/hooks/use-event-listener'
import { logger } from '@/lib/utils/logger'
import { safeResetRecording } from '@/lib/utils/recording-helpers'

export function RecordingController() {
  // Hooks
  const { isRecording, isPaused } = useRecordingStore()
  const { stopRecording, pauseRecording, resumeRecording, processingProgress } = useRecording()

  // RecordingController in workspace should only handle ongoing recordings
  // Starting recordings is handled by the Record Button window

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
  // Note: start-recording is not handled here - only the Record Button window can start recordings
  useEventListener('stop-recording' as any, handleStopRecording)
  useEventListener('pause-recording' as any, handlePauseRecording)
  useEventListener('resume-recording' as any, handleResumeRecording)

  // Keyboard shortcuts for recording control (no start recording - only control existing recordings)
  useDocumentEvent('keydown', useCallback((e: KeyboardEvent) => {
    // Command/Ctrl key combinations
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        // Removed 'r' key for starting recording - recordings should only start from Record Button window
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
  }, [isRecording, isPaused, handlePauseRecording, handleResumeRecording, handleStopRecording]))

  return (
    <>
      {/* Recording Overlays - only shown when actively recording */}
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
    </>
  )
}
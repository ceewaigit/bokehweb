"use client"

import { useState, useEffect, useCallback } from 'react'
import { RecordingOverlay, RecordingIndicator, RecordingStatusBar } from '../recording-overlay'
import { RecordingCompleteModal } from '../recording-complete-modal'
import { ProcessingIndicator } from '../processing-indicator'
import { useTimelineStore } from '@/stores/timeline-store'
import { useRecordingStore } from '@/stores/recording-store'
import { useRecording } from '@/hooks/use-recording'
import type { RecordingEnhancementSettings } from '@/types/effects'

export function RecordingController() {
  // Modal State
  const [showRecordingComplete, setShowRecordingComplete] = useState(false)

  // Recording State
  const [lastRecordingBlob, setLastRecordingBlob] = useState<Blob | null>(null)
  const [lastRecordingDuration, setLastRecordingDuration] = useState(0)
  const [enhancementSettings, setEnhancementSettings] = useState<RecordingEnhancementSettings | null>({
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
  const { project } = useTimelineStore()
  const { isRecording, status } = useRecordingStore()
  const { startRecording, stopRecording, pauseRecording, processingProgress, screenRecorder } = useRecording()

  // Simple recorder doesn't need enhancement settings applied separately
  // Enhancement settings are used during recording start

  const handleStartRecording = useCallback(async () => {
    try {
      console.log('🎬 Starting recording with Screen Studio effects:', enhancementSettings)
      await startRecording(undefined, enhancementSettings) // Pass enhancement settings
    } catch (error) {
      console.error('Failed to start recording:', error)
      // Reset recording state on start failure
      try {
        useRecordingStore.getState().reset()
      } catch (resetError) {
        console.error('Failed to reset recording state after start failure:', resetError)
      }
    }
  }, [startRecording, enhancementSettings])

  const handleStopRecording = useCallback(async () => {
    // Prevent double-stop by checking current state
    const currentState = useRecordingStore.getState()
    if (!currentState.isRecording) {
      console.log('🔒 Stop recording called but not currently recording - ignoring')
      return
    }
    
    try {
      console.log('🛑 Stopping recording from controller...')
      const result = await stopRecording()
      if (result) {
        console.log('✅ Recording completed successfully - clip handled by useRecording hook')
        // useRecording hook handles all clip creation and timeline management
      } else {
        // If no result returned, something went wrong
        console.error('Stop recording returned null - resetting state')
        useRecordingStore.getState().reset()
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
      // Reset recording state on error
      try {
        useRecordingStore.getState().reset()
      } catch (resetError) {
        console.error('Failed to reset recording state:', resetError)
      }
    }
  }, [stopRecording])

  const handlePauseRecording = useCallback(() => {
    pauseRecording()
  }, [pauseRecording])

  // Listen for recording events from other components
  useEffect(() => {
    const handleStartEvent = () => handleStartRecording()
    const handleStopEvent = () => handleStopRecording()
    const handlePauseEvent = () => handlePauseRecording()

    window.addEventListener('start-recording', handleStartEvent)
    window.addEventListener('stop-recording', handleStopEvent)
    window.addEventListener('pause-recording', handlePauseEvent)

    return () => {
      window.removeEventListener('start-recording', handleStartEvent)
      window.removeEventListener('stop-recording', handleStopEvent)
      window.removeEventListener('pause-recording', handlePauseEvent)
    }
  }, [handleStartRecording, handleStopRecording, handlePauseRecording])

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
              handlePauseRecording()
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
  }, [isRecording, handleStartRecording, handlePauseRecording, handleStopRecording])

  return (
    <>
      {/* Recording Overlays */}
      {isRecording && (
        <>
          <RecordingOverlay
            isVisible={isRecording}
            onStop={handleStopRecording}
            onPause={handlePauseRecording}
            onResume={handlePauseRecording}
            onSettings={() => { }}
          />
          <RecordingIndicator />
          <RecordingStatusBar />
        </>
      )}

      {/* Recording Complete Modal */}
      {showRecordingComplete && lastRecordingBlob && (
        <RecordingCompleteModal
          isOpen={showRecordingComplete}
          recordingBlob={lastRecordingBlob}
          duration={lastRecordingDuration}
          onClose={() => setShowRecordingComplete(false)}
          onDownload={() => {
            // Handle download
          }}
          onEdit={() => {
            setShowRecordingComplete(false)
            // Navigate to editor
          }}
        />
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
import { useRecordingStore } from '@/stores/recording-store'
import { logger } from './logger'

/**
 * Safely reset recording state with error handling
 */
export function safeResetRecording(): void {
  try {
    useRecordingStore.getState().reset()
    logger.debug('Recording state reset successfully')
  } catch (error) {
    logger.error('Failed to reset recording state:', error)
  }
}

/**
 * Check if recording is safe to start
 */
export function canStartRecording(): boolean {
  const state = useRecordingStore.getState()

  if (state.isRecording) {
    logger.debug('Cannot start recording: already recording')
    return false
  }

  if (state.status === 'processing') {
    logger.debug('Cannot start recording: processing in progress')
    return false
  }

  return true
}

/**
 * Check if recording is safe to stop
 */
export function canStopRecording(): boolean {
  const state = useRecordingStore.getState()

  if (!state.isRecording) {
    logger.debug('Cannot stop recording: not currently recording')
    return false
  }

  if (state.status === 'processing') {
    logger.debug('Cannot stop recording: already processing')
    return false
  }

  return true
}
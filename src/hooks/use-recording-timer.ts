import { useRef, useCallback, useEffect } from 'react'

interface UseRecordingTimerOptions {
  onTick: (elapsed: number) => void
  interval?: number
}

export function useRecordingTimer({ onTick, interval = 1000 }: UseRecordingTimerOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback((initialDuration = 0) => {
    stop() // Clear any existing timer
    
    startTimeRef.current = Date.now() - initialDuration
    
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      onTick(elapsed)
    }, interval)
  }, [onTick, interval, stop])

  const pause = useCallback(() => {
    stop()
  }, [stop])

  const resume = useCallback((currentDuration: number) => {
    start(currentDuration)
  }, [start])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return {
    start,
    stop,
    pause,
    resume,
    isRunning: () => intervalRef.current !== null
  }
}
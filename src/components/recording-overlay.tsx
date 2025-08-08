"use client"

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { 
  Square, 
  Pause, 
  Play, 
  Settings, 
  Minimize2,
  Volume2,
  VolumeX,
  Mic,
  MicOff
} from 'lucide-react'
import { useRecordingStore } from '@/stores/recording-store'
import { formatTime } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface RecordingOverlayProps {
  isVisible: boolean
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onSettings: () => void
}

export function RecordingOverlay({ 
  isVisible, 
  onStop, 
  onPause, 
  onResume, 
  onSettings 
}: RecordingOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const { isRecording, isPaused, settings } = useRecordingStore()

  // Update timer
  useEffect(() => {
    if (!isRecording || isPaused) return

    const startTime = Date.now()
    const interval = setInterval(() => {
      setCurrentTime((Date.now() - startTime) / 1000)
    }, 100)

    return () => clearInterval(interval)
  }, [isRecording, isPaused])

  // Reset timer when recording starts
  useEffect(() => {
    if (isRecording && !isPaused) {
      setCurrentTime(0)
    }
  }, [isRecording, isPaused])

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.3 }}
        className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50"
      >
        <div className="bg-black/95 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
          {isMinimized ? (
            // Ultra-minimal view - just timer and record dot
            <motion.div 
              className="flex items-center space-x-3 px-4 py-2"
              layout
              onClick={() => setIsMinimized(false)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-sm font-mono tabular-nums">
                {formatTime(currentTime)}
              </span>
            </motion.div>
          ) : (
            // Compact horizontal layout
            <motion.div 
              className="flex items-center space-x-4 px-5 py-3"
              layout
            >
              {/* Status indicator */}
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">
                  {isPaused ? 'PAUSED' : 'REC'}
                </span>
              </div>

              {/* Timer */}
              <div className="text-white font-mono text-sm tabular-nums">
                {formatTime(currentTime)}
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={isPaused ? onResume : onPause}
                  className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                >
                  {isPaused ? (
                    <Play className="w-3 h-3" />
                  ) : (
                    <Pause className="w-3 h-3" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onStop}
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full"
                >
                  <Square className="w-3 h-3 fill-current" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMinimized(true)}
                  className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                >
                  <Minimize2 className="w-3 h-3" />
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// Recording indicator for when recording is active
export function RecordingIndicator() {
  const { isRecording } = useRecordingStore()

  if (!isRecording) return null

  return (
    <div className="fixed top-4 right-4 z-40">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-2"
      >
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <span>REC</span>
      </motion.div>
    </div>
  )
}

// Global recording status in system tray style
export function RecordingStatusBar() {
  const { isRecording, isPaused, duration } = useRecordingStore()
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    if (!isRecording) return

    const interval = setInterval(() => {
      setCurrentTime(duration)
    }, 1000)

    return () => clearInterval(interval)
  }, [isRecording, duration])

  if (!isRecording) return null

  return (
    <motion.div
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      exit={{ y: -100 }}
      className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-1 text-xs font-medium z-30"
    >
      {isPaused ? 'Recording Paused' : 'Recording'} • {formatTime(currentTime)}
    </motion.div>
  )
}
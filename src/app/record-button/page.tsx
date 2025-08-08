'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Monitor,
  Camera,
  CameraOff,
  Settings,
  Square,
  Circle,
  Pause,
  Play,
  X
} from 'lucide-react'

export default function RecordingDock() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [duration, setDuration] = useState(0)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout>()
  const recorderRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCountdown = () => {
    setCountdown(3)
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval)
          actuallyStartRecording()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  const actuallyStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 3840, max: 3840 },
          height: { ideal: 2160, max: 2160 },
          frameRate: { ideal: 60, max: 60 }
        },
        audio: micEnabled
      })

      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000
      })

      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const recordingsDir = await window.electronAPI?.getRecordingsDirectory?.()

        if (recordingsDir) {
          const fileName = `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
          const filePath = `${recordingsDir}/${fileName}`
          const buffer = await blob.arrayBuffer()
          await window.electronAPI?.saveRecording?.(filePath, buffer)
          await window.electronAPI?.openWorkspace?.()
        }
      }

      recorderRef.current = recorder
      recorder.start(1000)

      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        if (!isPaused) {
          setDuration(Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000))
        }
      }, 100)

      setIsRecording(true)
      setIsExpanded(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      setCountdown(null)
    }
  }

  const startRecording = () => {
    startCountdown()
  }

  const pauseRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause()
      pausedTimeRef.current = Date.now()
      setIsPaused(true)
    }
  }

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume()
      pausedTimeRef.current += Date.now() - pausedTimeRef.current
      setIsPaused(false)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (timerRef.current) clearInterval(timerRef.current)

    setIsRecording(false)
    setIsPaused(false)
    setDuration(0)
    setIsExpanded(false)
    pausedTimeRef.current = 0
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-white text-9xl font-bold"
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording Dock */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-40"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`
            bg-gradient-to-b from-gray-900 to-gray-800 
            backdrop-blur-xl 
            rounded-2xl 
            shadow-2xl 
            border border-gray-700
            overflow-hidden
          `}
        >
          <div className="flex items-center p-3 gap-2">
            {/* Main Record Button */}
            {!isRecording ? (
              <motion.button
                onClick={startRecording}
                className="relative group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 transition-colors">
                  <Circle className="w-4 h-4 text-white fill-white" />
                  <span className="text-white font-medium text-sm">Start Recording</span>
                </div>
              </motion.button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Stop Button */}
                <motion.button
                  onClick={stopRecording}
                  className="relative group"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 transition-colors">
                    <Square className="w-4 h-4 text-white fill-white" />
                  </div>
                </motion.button>

                {/* Pause/Resume Button */}
                <motion.button
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="relative group"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors">
                    {isPaused ? (
                      <Play className="w-4 h-4 text-white fill-white" />
                    ) : (
                      <Pause className="w-4 h-4 text-white fill-white" />
                    )}
                  </div>
                </motion.button>

                {/* Timer Display */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700/50">
                  <motion.div
                    className="w-2 h-2 bg-red-500 rounded-full"
                    animate={isPaused ? {} : { scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-white font-mono text-sm">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="w-px h-8 bg-gray-600 mx-1" />

            {/* Quick Controls */}
            <div className="flex items-center gap-1">
              {/* Microphone Toggle */}
              <motion.button
                onClick={() => setMicEnabled(!micEnabled)}
                className={`
                  p-2 rounded-lg transition-colors
                  ${micEnabled
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'}
                `}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {micEnabled ? (
                  <Mic className="w-4 h-4" />
                ) : (
                  <MicOff className="w-4 h-4" />
                )}
              </motion.button>

              {/* Camera Toggle */}
              <motion.button
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className={`
                  p-2 rounded-lg transition-colors
                  ${cameraEnabled
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'}
                `}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {cameraEnabled ? (
                  <Camera className="w-4 h-4" />
                ) : (
                  <CameraOff className="w-4 h-4" />
                )}
              </motion.button>

              {/* Screen Source */}
              <motion.button
                className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Monitor className="w-4 h-4" />
              </motion.button>

              {/* Settings */}
              <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Settings className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Minimize Button */}
            <motion.button
              onClick={() => window.electronAPI?.minimizeRecordButton?.()}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors ml-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Expanded Settings Panel */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-700"
              >
                <div className="p-4 space-y-3">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Recording Settings</div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Quality</label>
                      <select className="w-full px-2 py-1 rounded bg-gray-700 text-white text-sm border border-gray-600 focus:border-blue-500 outline-none">
                        <option>4K 60fps</option>
                        <option>1080p 60fps</option>
                        <option>1080p 30fps</option>
                        <option>720p 30fps</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Audio Source</label>
                      <select className="w-full px-2 py-1 rounded bg-gray-700 text-white text-sm border border-gray-600 focus:border-blue-500 outline-none">
                        <option>System + Mic</option>
                        <option>System Only</option>
                        <option>Microphone Only</option>
                        <option>No Audio</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Show Cursor</label>
                    <input type="checkbox" defaultChecked className="rounded" />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Show Clicks</label>
                    <input type="checkbox" defaultChecked className="rounded" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  )
}
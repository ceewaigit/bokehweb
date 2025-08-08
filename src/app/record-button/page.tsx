'use client'

import './page.css'
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
    // Force transparent background for this component
    document.body.style.backgroundColor = 'transparent'
    document.body.style.background = 'transparent'
    document.documentElement.style.backgroundColor = 'transparent'
    document.documentElement.style.background = 'transparent'
    
    // Remove any background classes
    document.body.classList.remove('bg-background')
    
    // Check screen recording permission on macOS
    const checkPermission = async () => {
      const result = await window.electronAPI?.checkScreenRecordingPermission()
      if (result && !result.granted && result.status !== 'not-applicable') {
        console.warn('Screen recording permission not granted:', result.status)
      }
    }
    checkPermission()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCountdown = async () => {
    let count = 3
    setCountdown(count)

    // Hide the dock during countdown for cleaner experience
    await window.electronAPI?.minimizeRecordButton?.()

    // Show fullscreen countdown
    if (window.electronAPI?.showCountdown) {
      await window.electronAPI.showCountdown(count)
    }

    const countdownInterval = setInterval(async () => {
      count--

      if (count <= 0) {
        clearInterval(countdownInterval)
        setCountdown(null)

        // Hide countdown
        if (window.electronAPI?.hideCountdown) {
          await window.electronAPI.hideCountdown()
        }
        
        // Show dock again and start recording
        await window.electronAPI?.showRecordButton?.()
        actuallyStartRecording()
      } else {
        setCountdown(count)

        // Update countdown display
        if (window.electronAPI?.showCountdown) {
          await window.electronAPI.showCountdown(count)
        }
      }
    }, 1000)
  }

  const actuallyStartRecording = async () => {
    try {
      // Use Electron's desktop capture API instead of browser's getDisplayMedia
      const sources = await window.electronAPI?.getDesktopSources({
        types: ['screen'],
        thumbnailSize: { width: 150, height: 150 }
      })

      if (!sources || sources.length === 0) {
        throw new Error('No screen sources available')
      }

      // Use the first screen (primary display)
      const source = sources[0]
      console.log('Using screen source:', source.name)

      // Get the stream with proper constraints for Electron
      // Must use mandatory constraints for Electron desktop capture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micEnabled ? {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true }
        } : false,
        video: {
          // @ts-ignore - Electron-specific mandatory constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id
          }
        } as any
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
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 100)

      setIsRecording(true)
      setIsExpanded(false)
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
      // Calculate total paused duration
      const pauseDuration = Date.now() - pausedTimeRef.current
      startTimeRef.current += pauseDuration
      pausedTimeRef.current = 0
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

  // Show prominent control panel during recording
  if (isRecording) {
    return (
      <div
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-gray-900 to-gray-800 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-600"
        >
          {/* Recording indicator */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-3 h-3 bg-red-500 rounded-full shadow-lg shadow-red-500/50"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-white text-sm font-semibold">Recording</span>
          </div>

          {/* Timer display */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-black/30 rounded-lg">
            <span className="text-white font-mono text-base font-medium">{formatTime(duration)}</span>
          </div>

          {/* Pause/Resume button */}
          <motion.button
            onClick={isPaused ? resumeRecording : pauseRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors group"
            title={isPaused ? "Resume recording" : "Pause recording"}
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-white group-hover:text-green-400 transition-colors" />
            ) : (
              <Pause className="w-4 h-4 text-white group-hover:text-yellow-400 transition-colors" />
            )}
          </motion.button>

          {/* Stop button */}
          <motion.button
            onClick={stopRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 bg-red-600 hover:bg-red-500 rounded-lg transition-colors group shadow-lg shadow-red-600/30"
            title="Stop recording"
          >
            <Square className="w-4 h-4 text-white fill-white" />
          </motion.button>

          {/* Optional: Quick settings */}
          <div className="flex items-center gap-1 ml-2 pl-3 border-l border-gray-600">
            <button
              className={`p-2 rounded-lg transition-colors ${micEnabled ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500'}`}
              onClick={() => {/* Toggle mic during recording */ }}
              title={micEnabled ? "Microphone on" : "Microphone off"}
            >
              {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-40"
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
          style={{ 
            // @ts-ignore
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          <div className="flex items-center p-3 gap-2">
            {/* Main Record Button */}
            {!isRecording ? (
              <motion.button
                onClick={startRecording}
                className="relative group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{ 
                  // @ts-ignore
                  WebkitAppRegion: 'no-drag'
                }}
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
            <div className="flex items-center gap-1" style={{ 
              // @ts-ignore
              WebkitAppRegion: 'no-drag'
            }}>
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
              style={{ 
                // @ts-ignore
                WebkitAppRegion: 'no-drag'
              }}
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
  )
}
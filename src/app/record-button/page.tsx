'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecording } from '@/hooks/use-recording'
import { useRecordingStore } from '@/stores/recording-store'
import { formatTime } from '@/lib/utils'
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
  ChevronDown,
  Folder,
  Minimize2,
  Maximize2,
  MonitorDown,
  GripHorizontal
} from 'lucide-react'

export default function RecordingDock() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [selectedSource, setSelectedSource] = useState<'fullscreen' | 'window' | 'region'>('fullscreen')

  // Reference to the dock container for measuring
  const dockContainerRef = useRef<HTMLDivElement>(null)

  // Use the centralized recording hook and store
  const {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording
  } = useRecording()

  const {
    isRecording,
    isPaused,
    duration,
    updateSettings
  } = useRecordingStore()

  // Force transparent background on mount
  useEffect(() => {
    const styles = `
      html, body {
        background: transparent !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .bg-background {
        background: transparent !important;
      }
    `

    const styleEl = document.createElement('style')
    styleEl.textContent = styles
    document.head.appendChild(styleEl)

    return () => styleEl.remove()
  }, [])

  // Update recording settings when audio or source changes
  useEffect(() => {
    updateSettings({
      audioInput: micEnabled ? 'system' : 'none',
      area: selectedSource
    })
  }, [micEnabled, selectedSource, updateSettings])

  // Dynamically size window based on actual content dimensions
  useEffect(() => {
    const dockElement = dockContainerRef.current
    if (!dockElement || !window.electronAPI?.setWindowContentSize) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      // Add small buffer for shadows
      const buffer = 20

      window.electronAPI?.setWindowContentSize?.({
        width: Math.ceil(width + buffer),
        height: Math.ceil(height + buffer)
      })
    })

    observer.observe(dockElement)
    return () => observer.disconnect()
  }, [])

  const handleStartRecording = () => {
    // Show countdown
    let count = 3
    setCountdown(count)

    // Hide the dock during countdown for cleaner experience
    window.electronAPI?.minimizeRecordButton?.()

    // Show fullscreen countdown
    window.electronAPI?.showCountdown?.(count)

    const countdownInterval = setInterval(() => {
      count--

      if (count <= 0) {
        clearInterval(countdownInterval)
        setCountdown(null)

        // Hide countdown and show dock again
        window.electronAPI?.hideCountdown?.()
        window.electronAPI?.showRecordButton?.()

        // Start recording
        startRecording()
        setIsExpanded(false)
      } else {
        setCountdown(count)
        // Update countdown display
        window.electronAPI?.showCountdown?.(count)
      }
    }, 1000)
  }

  const handleStopRecording = () => {
    stopRecording()
    // Open workspace after recording stops
    window.electronAPI?.openWorkspace?.()
  }

  return (
    <>
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 grid place-items-center bg-black/20 backdrop-blur-sm z-[2147483646]"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[120px] leading-none font-bold text-white drop-shadow-2xl"
            >
              {countdown === 0 ? 'Go!' : countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Dock */}
      <div className="fixed inset-0 flex items-start justify-center pointer-events-none z-[2147483647]">
        <motion.div
          ref={dockContainerRef}
          className="pointer-events-auto"
          style={{ marginTop: '16px' }}
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Dock Container */}
          <div className={`
            relative flex flex-col
            bg-black/80 backdrop-blur-2xl backdrop-saturate-150
            rounded-2xl border border-white/10
            shadow-[0_20px_70px_rgba(0,0,0,0.55)]
            ${isRecording ? 'ring-2 ring-red-500/50' : ''}
          `}>
            {/* Drag Handle Area */}
            <div className={`drag-region flex items-center justify-center py-2 cursor-move`}>
              <GripHorizontal className="text-white/30" size={20} />
            </div>

            {/* Controls Container - Make buttons non-draggable */}
            <div className={`no-drag flex items-center gap-1 px-2 pb-1.5`}>
              {!isRecording ? (
                <>
                  {/* Settings Button */}
                  <button
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    onClick={() => {
                      setIsExpanded(!isExpanded)
                    }}
                    title="Settings"
                  >
                    <Settings size={18} />
                  </button>

                  {/* Source Selector */}
                  <div className="flex items-center gap-1 px-2">
                    <button
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${selectedSource === 'fullscreen'
                        ? 'bg-white/20 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      onClick={() => setSelectedSource('fullscreen')}
                    >
                      <Monitor size={16} />
                      <span className="text-sm font-medium">Screen</span>
                    </button>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${selectedSource === 'window'
                        ? 'bg-white/20 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      onClick={() => setSelectedSource('window')}
                    >
                      <Maximize2 size={16} />
                      <span className="text-sm font-medium">Window</span>
                    </button>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${selectedSource === 'region'
                        ? 'bg-white/20 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      onClick={() => setSelectedSource('region')}
                    >
                      <MonitorDown size={16} />
                      <span className="text-sm font-medium">Area</span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-white/20" />

                  {/* Audio Controls */}
                  <button
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${micEnabled
                      ? 'bg-white/20 text-white'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/10'
                      }`}
                    onClick={() => setMicEnabled(!micEnabled)}
                    title={micEnabled ? 'Disable Microphone' : 'Enable Microphone'}
                  >
                    {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                  </button>

                  {/* Camera Control */}
                  <button
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${cameraEnabled
                      ? 'bg-white/20 text-white'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/10'
                      }`}
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                    title={cameraEnabled ? 'Disable Camera' : 'Enable Camera'}
                  >
                    {cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                  </button>

                  {/* Divider */}
                  <div className="w-px h-8 bg-white/20" />

                  {/* Record Button */}
                  <button
                    className="relative flex items-center justify-center w-12 h-12 mx-1 rounded-full bg-red-500 hover:bg-red-600 transition-all group"
                    onClick={handleStartRecording}
                    title="Start Recording"
                  >
                    <div className="absolute inset-0 rounded-full bg-red-400 animate-pulse opacity-30 pointer-events-none scale-90" />
                    <Circle size={20} className="text-white fill-white relative z-10" />
                  </button>

                  {/* Workspace Button */}
                  <button
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    onClick={() => window.electronAPI?.openWorkspace?.()}
                    title="Open Workspace"
                  >
                    <Folder size={18} />
                  </button>
                </>
              ) : (
                <>
                  {/* Recording Timer */}
                  <div className="flex items-center gap-2 px-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white font-medium tabular-nums">
                      {formatTime(duration)}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-white/20" />

                  {/* Pause/Resume Button */}
                  {!isPaused ? (
                    <button
                      className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
                      onClick={pauseRecording}
                      title="Pause Recording"
                    >
                      <Pause size={18} />
                    </button>
                  ) : (
                    <button
                      className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
                      onClick={resumeRecording}
                      title="Resume Recording"
                    >
                      <Play size={18} />
                    </button>
                  )}

                  {/* Stop Button */}
                  <button
                    className="flex items-center justify-center w-12 h-12 mx-1 rounded-xl bg-red-500 hover:bg-red-600 transition-all"
                    onClick={handleStopRecording}
                    title="Stop Recording"
                  >
                    <Square size={16} className="text-white fill-white" />
                  </button>

                  {/* Minimize Button */}
                  <button
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    onClick={() => window.electronAPI?.minimizeRecordButton?.()}
                    title="Minimize"
                  >
                    <Minimize2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Expanded Options */}
          <AnimatePresence>
            {isExpanded && !isRecording && (
              <motion.div
                className="absolute top-full left-0 right-0 mt-2 p-3 bg-black/80 backdrop-blur-2xl rounded-xl border border-white/10 shadow-2xl"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-2">
                  <div className="text-white/60 text-xs font-medium uppercase tracking-wider">Recording Options</div>
                  <div className="flex items-center gap-2">
                    <label className="text-white/80 text-sm">Quality:</label>
                    <select className="bg-white/10 text-white text-sm px-2 py-1 rounded-lg border border-white/20 outline-none focus:border-white/40">
                      <option>4K 60fps</option>
                      <option>1080p 60fps</option>
                      <option>720p 30fps</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-white/80 text-sm">Countdown:</label>
                    <select className="bg-white/10 text-white text-sm px-2 py-1 rounded-lg border border-white/20 outline-none focus:border-white/40">
                      <option>3 seconds</option>
                      <option>5 seconds</option>
                      <option>None</option>
                    </select>
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
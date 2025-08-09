'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecording } from '@/hooks/use-recording'
import { useRecordingStore } from '@/stores/recording-store'
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
  X,
  Folder
} from 'lucide-react'

export default function RecordingDock() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

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

  useEffect(() => {
    // Force transparent background for this component
    document.body.style.backgroundColor = 'transparent'
    document.body.style.background = 'transparent'
    document.documentElement.style.backgroundColor = 'transparent'
    document.documentElement.style.background = 'transparent'

    // Remove any background classes
    document.body.classList.remove('bg-background')

    // Update recording settings
    updateSettings({
      audioInput: micEnabled ? 'system' : 'none'
    })
  }, [micEnabled, updateSettings])

  const handleStartRecording = async () => {
    // Show countdown
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

        // Use the centralized recording hook
        await startRecording()
        setIsExpanded(false)
      } else {
        setCountdown(count)

        // Update countdown display
        if (window.electronAPI?.showCountdown) {
          await window.electronAPI.showCountdown(count)
        }
      }
    }, 1000)
  }

  const handleStopRecording = async () => {
    await stopRecording()
    // Open workspace after recording stops
    await window.electronAPI?.openWorkspace?.()
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Convert duration from milliseconds to seconds for display
  const displayDuration = Math.floor(duration / 1000)

  return (
    <div className="fixed inset-x-0 top-3 flex justify-center items-start pointer-events-auto z-[2147483647]">
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 grid place-items-center bg-slate-900/25 z-[2147483647]"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[144px] leading-none font-extrabold text-white drop-shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
            >
              {countdown === 0 ? 'Go!' : countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={`text-slate-900 bg-white/90 backdrop-blur-xl backdrop-saturate-150 rounded-2xl border border-slate-900/10 px-3 py-2 w-[640px] max-w-[calc(100vw-24px)] shadow-[0_10px_25px_rgba(2,6,23,0.18),0_4px_8px_rgba(2,6,23,0.12)] ${isRecording ? 'border-red-600/30 shadow-[0_12px_28px_rgba(220,38,38,0.18),0_4px_10px_rgba(220,38,38,0.14)]' : ''} ${isExpanded ? '' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {!isRecording ? (
              <>
                <button
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title="Options"
                >
                  <Settings size={20} />
                </button>

                <button
                  className="inline-flex items-center justify-center w-[52px] h-[52px] rounded-full bg-red-500 text-white shadow-[inset_0_0_0_4px_rgba(255,255,255,0.6),0_8px_16px_rgba(239,68,68,0.35)] hover:bg-red-600"
                  onClick={handleStartRecording}
                  title="Start Recording"
                >
                  <Circle size={24} />
                </button>

                <button
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                  onClick={() => window.electronAPI?.openWorkspace?.()}
                  title="Open Workspace"
                >
                  <Folder size={20} />
                </button>
              </>
            ) : (
              <>
                <div className="font-semibold tabular-nums min-w-[60px] text-center">
                  {formatDuration(displayDuration)}
                </div>

                <div className="flex items-center gap-2.5">
                  {!isPaused ? (
                    <button
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                      onClick={pauseRecording}
                      title="Pause Recording"
                    >
                      <Pause size={20} />
                    </button>
                  ) : (
                    <button
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                      onClick={resumeRecording}
                      title="Resume Recording"
                    >
                      <Play size={20} />
                    </button>
                  )}

                  <button
                    className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-red-500 text-white hover:bg-red-600"
                    onClick={handleStopRecording}
                    title="Stop Recording"
                  >
                    <Square size={20} />
                  </button>
                </div>

                <button
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                  onClick={() => window.electronAPI?.minimizeRecordButton?.()}
                  title="Minimize"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>

          <AnimatePresence>
            {isExpanded && !isRecording && (
              <motion.div
                className="mt-2 pt-2 border-t border-slate-900/10"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2">
                  <button
                    className={`inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10 ${micEnabled ? 'bg-slate-900/10' : ''}`}
                    onClick={() => setMicEnabled(!micEnabled)}
                  >
                    {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                    <span>Microphone</span>
                  </button>

                  <button
                    className={`inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl bg-slate-900/5 text-slate-900 hover:bg-slate-900/10 ${cameraEnabled ? 'bg-slate-900/10' : ''}`}
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                  >
                    {cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                    <span>Camera</span>
                  </button>

                  <button className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl bg-slate-900/10 text-slate-900">
                    <Monitor size={18} />
                    <span>Full Screen</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
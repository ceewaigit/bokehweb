'use client'

import './page.css'
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
    <div className="recording-dock-container">
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="countdown-overlay"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="countdown-number"
            >
              {countdown === 0 ? 'Go!' : countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={`recording-dock ${isRecording ? 'recording' : ''} ${isExpanded ? 'expanded' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <div className="dock-content">
          <div className="main-controls">
            {!isRecording ? (
              <>
                <button
                  className="control-button expand-button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title="Options"
                >
                  <Settings size={20} />
                </button>

                <button
                  className="record-button"
                  onClick={handleStartRecording}
                  title="Start Recording"
                >
                  <Circle size={24} />
                </button>

                <button
                  className="control-button"
                  onClick={() => window.electronAPI?.openWorkspace?.()}
                  title="Open Workspace"
                >
                  <Folder size={20} />
                </button>
              </>
            ) : (
              <>
                <div className="duration-display">
                  {formatDuration(displayDuration)}
                </div>

                <div className="recording-controls">
                  {!isPaused ? (
                    <button
                      className="control-button pause-button"
                      onClick={pauseRecording}
                      title="Pause Recording"
                    >
                      <Pause size={20} />
                    </button>
                  ) : (
                    <button
                      className="control-button resume-button"
                      onClick={resumeRecording}
                      title="Resume Recording"
                    >
                      <Play size={20} />
                    </button>
                  )}

                  <button
                    className="stop-button"
                    onClick={handleStopRecording}
                    title="Stop Recording"
                  >
                    <Square size={20} />
                  </button>
                </div>

                <button
                  className="control-button close-button"
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
                className="expanded-controls"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="control-row">
                  <button
                    className={`option-button ${micEnabled ? 'active' : ''}`}
                    onClick={() => setMicEnabled(!micEnabled)}
                  >
                    {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                    <span>Microphone</span>
                  </button>

                  <button
                    className={`option-button ${cameraEnabled ? 'active' : ''}`}
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                  >
                    {cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                    <span>Camera</span>
                  </button>

                  <button className="option-button active">
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
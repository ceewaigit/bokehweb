'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useRecording } from '@/hooks/use-recording'
import { useRecordingStore } from '@/stores/recording-store'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { SourcePicker } from '@/components/source-picker'
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Square,
  Circle,
  Pause,
  Play,
  X
} from 'lucide-react'

export function RecordButtonDock() {
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)

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

  // Make entire window transparent and size to content
  useEffect(() => {
    // Set transparent background
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '8px' // Small padding for shadow
    document.body.style.display = 'flex'
    document.body.style.alignItems = 'flex-start'
    document.body.style.justifyContent = 'center'
    
    // Remove any default styles
    const root = document.getElementById('root')
    if (root) {
      root.style.background = 'transparent'
      root.style.width = 'auto'
      root.style.height = 'auto'
    }
  }, [])

  // Update recording settings when audio changes
  useEffect(() => {
    updateSettings({
      audioInput: micEnabled ? 'system' : 'none'
    })
  }, [micEnabled, updateSettings])

  // Dynamically size window based on actual content dimensions
  useEffect(() => {
    if (!showSourcePicker) {
      // Only auto-size for the dock, not when source picker is open
      const dockElement = dockContainerRef.current
      if (!dockElement || !window.electronAPI?.setWindowContentSize) return

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return

        const { width, height } = entry.contentRect
        // Add small buffer for shadows
        const buffer = 16

        window.electronAPI?.setWindowContentSize?.({
          width: Math.ceil(width + buffer),
          height: Math.ceil(height + buffer)
        })
      })

      observer.observe(dockElement)
      return () => observer.disconnect()
    }
  }, [showSourcePicker])

  const handleStartRecording = () => {
    // Show the source picker inline
    setShowSourcePicker(true)
  }

  const startCountdownAndRecord = () => {
    // Show countdown
    let count = 3

    // Hide the dock during countdown for cleaner experience
    window.electronAPI?.minimizeRecordButton?.()

    // Show fullscreen countdown
    window.electronAPI?.showCountdown?.(count)

    const countdownInterval = setInterval(() => {
      count--

      if (count <= 0) {
        clearInterval(countdownInterval)

        // Hide countdown and show dock again
        window.electronAPI?.hideCountdown?.()
        window.electronAPI?.showRecordButton?.()

        // Start recording
        startRecording()
      } else {
        // Update countdown display
        window.electronAPI?.showCountdown?.(count)
      }
    }, 1000)
  }

  const handleSourceSelect = (sourceId: string) => {
    setShowSourcePicker(false)
    
    // Determine the area type and sourceId based on selection
    if (sourceId === 'area:selection') {
      updateSettings({ area: 'region' })
    } else if (sourceId.startsWith('screen:')) {
      updateSettings({ area: 'fullscreen', sourceId })
    } else {
      // Window selection
      updateSettings({ area: 'window', sourceId })
    }
    
    // Start recording immediately after source selection
    startCountdownAndRecord()
  }

  const handleStopRecording = async () => {
    await stopRecording()
    // Open workspace after recording stops
    window.electronAPI?.openWorkspace?.()
  }

  return (
    <>
      {/* Dock Container - No wrapper divs, just the dock itself */}
      <motion.div
        ref={dockContainerRef}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className={cn(
          "relative flex items-center gap-1 p-1.5",
          "bg-background/80 backdrop-blur-2xl backdrop-saturate-150",
          "rounded-2xl border border-border/50",
          "shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
          isRecording && "ring-2 ring-destructive/30 ring-offset-2 ring-offset-transparent"
        )}
      >
        {!isRecording ? (
          <>
            {/* Audio & Camera Controls */}
            <div className="flex items-center gap-1">
              <button
                className={cn(
                  "relative p-2 rounded-lg transition-all duration-200",
                  micEnabled
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                onClick={() => setMicEnabled(!micEnabled)}
                title={micEnabled ? 'Microphone On' : 'Microphone Off'}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {micEnabled && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </button>

              <button
                className={cn(
                  "relative p-2 rounded-lg transition-all duration-200",
                  cameraEnabled
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                onClick={() => setCameraEnabled(!cameraEnabled)}
                title={cameraEnabled ? 'Camera On' : 'Camera Off'}
              >
                {cameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                {cameraEnabled && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </button>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-border/50" />

            {/* Record Button - Prominent */}
            <button
              className={cn(
                "relative group",
                "flex items-center justify-center",
                "w-10 h-10 mx-1",
                "bg-destructive hover:bg-destructive/90",
                "rounded-full shadow-lg",
                "transition-all duration-200 hover:scale-105",
                "active:scale-95"
              )}
              onClick={handleStartRecording}
              title="Start Recording"
            >
              <div className="absolute inset-0 rounded-full bg-destructive/20 animate-pulse" />
              <Circle className="w-5 h-5 text-destructive-foreground fill-current relative z-10" />
            </button>

            {/* Open Workspace */}
            <button
              className={cn(
                "p-2 rounded-lg transition-all duration-200",
                "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              onClick={() => window.electronAPI?.openWorkspace?.()}
              title="Open Workspace"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                />
              </svg>
            </button>
          </>
        ) : (
          <>
            {/* Recording Timer - Clean Display */}
            <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 dark:bg-destructive/20 rounded-lg">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-2 h-2 bg-destructive rounded-full animate-ping" />
                <div className="w-2 h-2 bg-destructive rounded-full" />
              </div>
              <span className="text-destructive font-mono text-sm font-medium tabular-nums">
                {formatTime(duration)}
              </span>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-border/50" />

            {/* Pause/Resume */}
            <button
              className={cn(
                "p-2 rounded-lg transition-all duration-200",
                "text-foreground hover:text-foreground hover:bg-accent"
              )}
              onClick={isPaused ? resumeRecording : pauseRecording}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>

            {/* Stop Button */}
            <button
              className={cn(
                "flex items-center justify-center",
                "px-3 py-1.5 mx-1",
                "bg-destructive/10 hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
                "text-destructive-foreground",
                "rounded-lg border border-destructive/50 dark:border-destructive/30",
                "transition-all duration-200",
                "active:scale-95"
              )}
              onClick={handleStopRecording}
              title="Stop Recording"
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              <span className="text-[11px] font-medium">Stop</span>
            </button>

            {/* Close/Minimize */}
            <button
              className={cn(
                "p-1.5 rounded-lg transition-all duration-200",
                "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              onClick={() => window.electronAPI?.minimizeRecordButton?.()}
              title="Hide"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </motion.div>

      {/* Source Picker Dialog */}
      {showSourcePicker && (
        <SourcePicker
          isOpen={showSourcePicker}
          onClose={() => setShowSourcePicker(false)}
          onSelect={handleSourceSelect}
        />
      )}
    </>
  )
}
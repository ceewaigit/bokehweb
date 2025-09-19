'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecording } from '@/hooks/use-recording'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { RecordingSourceType } from '@/types/project'
import { AudioInput } from '@/types'
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Square,
  Circle,
  Pause,
  Play,
  X,
  Monitor,
  AppWindow,
  Maximize2,
  ChevronLeft,
  AlertCircle,
  Shield
} from 'lucide-react'

interface Source {
  id: string
  name: string
  type: RecordingSourceType
  displayInfo?: {
    id: number
    isPrimary: boolean
    isInternal: boolean
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
  }
}

export function RecordButtonDock() {
  const [audioEnabled, setAudioEnabled] = useState(true)  // System audio, not microphone
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [sources, setSources] = useState<Source[]>([])
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown')

  // Use the centralized recording hook and store
  const {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    canPause,
    canResume
  } = useRecording()

  const {
    isRecording,
    isPaused,
    duration,
    updateSettings,
    startCountdown,
    prepareRecording
  } = useRecordingSessionStore()

  // Configure window for overlay mode
  useEffect(() => {
    // Set transparent background
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.userSelect = 'none'
    document.body.style.width = '100vw'
    document.body.style.height = '100vh'

    // Remove any default styles
    const root = document.getElementById('root')
    if (root) {
      root.style.background = 'transparent'
      root.style.width = '100%'
      root.style.height = '100%'
    }
  }, [])

  // Initialize default wallpaper on mount
  useEffect(() => {
    initializeDefaultWallpaper()
  }, [])

  // Check screen recording permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      if (window.electronAPI?.checkScreenRecordingPermission) {
        const result = await window.electronAPI.checkScreenRecordingPermission()
        setPermissionStatus(result.granted ? 'granted' : 'denied')
        logger.info('Screen recording permission:', result)
      }
    }
    checkPermission()
  }, [])

  // Load sources when picker opens
  const loadSources = useCallback(async () => {
    const startTime = performance.now()

    if (!window.electronAPI?.getDesktopSources) {
      logger.error('Desktop sources API not available')
      return
    }

    try {

      const desktopSources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }  // We don't show thumbnails, so minimize size
      })


      const mappedSources: Source[] = desktopSources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window,
        displayInfo: source.displayInfo
      }))

      logger.info('Mapped sources:', mappedSources.filter(s => s.type === RecordingSourceType.Screen).map(s => ({
        id: s.id,
        name: s.name,
        displayInfo: s.displayInfo
      })))

      // Filter out system windows
      const filteredSources = mappedSources.filter(source => {
        const lowercaseName = source.name.toLowerCase()
        return !lowercaseName.includes('dock') &&
          !lowercaseName.includes('menubar') &&
          !lowercaseName.includes('notification') &&
          !lowercaseName.includes('screen studio - record')
      })

      // Add area selection option at the beginning
      const allSources: Source[] = [
        {
          id: 'area:selection',
          name: 'Select Area',
          type: RecordingSourceType.Area
        },
        ...filteredSources
      ]

      setSources(allSources)

      // Pre-select the primary display (instead of first screen)
      const primaryDisplay = allSources.find(s => s.type === RecordingSourceType.Screen && s.displayInfo?.isPrimary)
      const defaultScreen = primaryDisplay || allSources.find(s => s.type === RecordingSourceType.Screen)

      if (defaultScreen) {
        setSelectedSourceId(defaultScreen.id)
        // Don't show overlay on app start - only when user clicks record button
      }

    } catch (error) {
      logger.error('Failed to load desktop sources:', error)
    }
  }, [])

  // Preload sources on component mount for instant display
  useEffect(() => {
    loadSources()
  }, [loadSources])

  // Manage window size based on state
  useEffect(() => {
    const resizeWindow = async () => {
      if (!window.electronAPI?.setWindowContentSize) return

      let targetSize = { width: 200, height: 67 }  // Default button size

      if (showSourcePicker) {
        targetSize = { width: 380, height: 320 }  // Source picker size
      } else if (isRecording) {
        targetSize = { width: 250, height: 67 }   // Recording size (wider for timer)
      }

      await window.electronAPI.setWindowContentSize(targetSize)
    }

    resizeWindow()
  }, [showSourcePicker, isRecording])

  // Update recording settings when audio changes
  useEffect(() => {
    updateSettings({
      audioInput: audioEnabled ? AudioInput.System : AudioInput.None  // System audio from desktop
    })
  }, [audioEnabled, updateSettings])

  // No hardcoded dimensions - let the content determine size
  // The window auto-sizes based on content via ResizeObserver in main process

  const handleStartRecording = () => {
    // Show the source picker inline
    setShowSourcePicker(true)

    // Show overlay for the currently selected source (which should be primary display)
    if (selectedSourceId) {
      const selectedSource = sources.find(s => s.id === selectedSourceId)
      if (selectedSource?.type === RecordingSourceType.Screen && selectedSource.displayInfo?.id !== undefined) {
        logger.info('Showing overlay for default selection:', selectedSource.displayInfo.id)
        window.electronAPI?.showMonitorOverlay?.(selectedSource.displayInfo.id)
      }
    }
  }

  // Handle screen selection with immediate overlay display
  const handleScreenSelection = (source: Source) => {
    logger.info('Screen selection:', {
      id: source.id,
      type: source.type,
      displayInfo: source.displayInfo
    })

    // Hide any existing overlay
    window.electronAPI?.hideMonitorOverlay?.()

    // Set the selected source
    setSelectedSourceId(source.id)

    // Show overlay on the selected monitor immediately for screens
    if (source.type === RecordingSourceType.Screen && source.displayInfo?.id !== undefined) {
      logger.info('Showing overlay on display:', source.displayInfo.id)
      window.electronAPI?.showMonitorOverlay?.(source.displayInfo.id)
    } else {
      logger.warn('Not showing overlay:', {
        isScreen: source.type === RecordingSourceType.Screen,
        hasDisplayInfo: !!source.displayInfo,
        displayId: source.displayInfo?.id
      })
    }
  }

  // Handle window selection with overlay for the specific application
  const handleWindowSelection = (source: Source) => {
    logger.info('Window selection:', {
      id: source.id,
      type: source.type,
      name: source.name
    })

    // Hide any existing overlay
    window.electronAPI?.hideMonitorOverlay?.()

    // Set the selected source
    setSelectedSourceId(source.id)

    // Show overlay for the specific window
    if (source.type === RecordingSourceType.Window) {
      logger.info('Showing window overlay for:', source.name)
      window.electronAPI?.showWindowOverlay?.(source.id)
    }
  }

  const handleSourceSelect = async () => {
    if (!selectedSourceId) return

    // Find the selected source to get display info
    const selectedSource = sources.find(s => s.id === selectedSourceId)
    const displayId = selectedSource?.displayInfo?.id

    // Hide the overlay as we're about to start recording
    window.electronAPI?.hideMonitorOverlay?.()

    // Ensure wallpaper is loaded before starting recording
    await initializeDefaultWallpaper()

    // Close picker immediately for smooth transition
    setShowSourcePicker(false)

    // Small delay to let the window resize animation complete
    await new Promise(resolve => setTimeout(resolve, 150))

    if (selectedSourceId === 'area:selection') {
      // Handle area selection
      if (window.electronAPI?.selectScreenArea) {
        try {
          const result = await window.electronAPI.selectScreenArea()
          if (result?.success && result.area) {
            const areaSourceId = `area:${result.area.x},${result.area.y},${result.area.width},${result.area.height}`
            prepareRecording(areaSourceId, displayId)
            setTimeout(() => startCountdown(startRecording, displayId), 100)
          }
        } catch (error) {
          logger.error('Failed to select screen area:', error)
        }
      }
    } else {
      prepareRecording(selectedSourceId, displayId)
      setTimeout(() => startCountdown(startRecording, displayId), 100)
    }
  }

  const handleStopRecording = async () => {
    await stopRecording()
    // Open workspace after recording stops
    window.electronAPI?.openWorkspace?.()
  }

  const screens = sources.filter(s => s.type === RecordingSourceType.Screen)
  const windows = sources.filter(s => s.type === RecordingSourceType.Window)
  const areaOption = sources.find(s => s.type === RecordingSourceType.Area)

  return (
    <div className="w-full h-full flex flex-col items-center justify-start" style={{ padding: '8px' }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          duration: 0.15,
          ease: [0.4, 0, 0.2, 1]
        }}
        layout
        className={cn(
          "relative flex flex-col",
          "bg-background",
          "rounded-xl border border-border",
          "shadow-lg dark:shadow-2xl",
          isRecording && "ring-2 ring-destructive/40",
          "w-full"
        )}
        style={{
          // Make the dock draggable
          ['WebkitAppRegion' as any]: 'drag',
          cursor: 'move',
          // GPU acceleration
          transform: 'translateZ(0)',
          willChange: 'transform'
        }}
      >
        {/* Permission Warning */}
        {permissionStatus === 'denied' && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-t-lg px-2 py-1">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-orange-500" />
              <span className="text-[10px] text-orange-500 font-medium">
                Screen recording permission required
              </span>
            </div>
          </div>
        )}

        {/* Main Dock Bar - Compact Design */}
        <div className="inline-flex items-center justify-center gap-1 p-2" style={{ width: 'auto' }}>
          {!isRecording ? (
            <>
              {/* Audio & Camera Controls */}
              <div className="flex items-center justify-center gap-1">
                <button
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className={cn(
                    "relative p-1.5 rounded-lg transition-colors duration-100",
                    audioEnabled
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  title={audioEnabled
                    ? 'System Audio On (Records computer audio)'
                    : 'System Audio Off (No audio will be captured)'}
                >
                  {audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  {audioEnabled && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </button>

                <button
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className={cn(
                    "relative p-1.5 rounded-lg transition-colors duration-100",
                    cameraEnabled
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => setCameraEnabled(!cameraEnabled)}
                  title={cameraEnabled ? 'Camera On' : 'Camera Off'}
                >
                  {cameraEnabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                  {cameraEnabled && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </button>
              </div>

              {/* Separator */}
              <div className="w-px h-5 bg-border/40" />

              {/* Record Button - Prominent */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                className={cn(
                  "relative group",
                  "flex items-center justify-center",
                  "w-10 h-10",
                  permissionStatus === 'denied'
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-destructive hover:bg-destructive/90",
                  "rounded-full shadow-lg",
                  "transition-transform duration-150 hover:scale-105",
                  "active:scale-95"
                )}
                onClick={permissionStatus === 'denied' ? async () => {
                  // Request permission
                  if (window.electronAPI?.requestScreenRecordingPermission) {
                    await window.electronAPI.requestScreenRecordingPermission()
                    // Re-check permission after user potentially grants it
                    setTimeout(async () => {
                      if (window.electronAPI?.checkScreenRecordingPermission) {
                        const result = await window.electronAPI.checkScreenRecordingPermission()
                        setPermissionStatus(result.granted ? 'granted' : 'denied')
                      }
                    }, 1000)
                  }
                } : handleStartRecording}
                title={permissionStatus === 'denied'
                  ? "Screen Recording Permission Required - Click to Open Settings"
                  : "Start Recording"}
              >
                {permissionStatus === 'denied' ? (
                  <>
                    <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-pulse" />
                    <Shield className="w-5 h-5 text-white relative z-10" />
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 rounded-full bg-destructive/20 animate-pulse" />
                    <Circle className="w-5 h-5 text-destructive-foreground fill-current relative z-10" />
                  </>
                )}
              </button>

              {/* Open Workspace */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                className={cn(
                  "p-1.5 rounded-lg transition-colors duration-150",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                onClick={() => window.electronAPI?.openWorkspace?.()}
                title="Open Workspace"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
            </>
          ) : (
            <>
              {/* Recording Timer - Compact Display */}
              <div className="flex items-center justify-center gap-2 px-3 py-1 bg-destructive/10 dark:bg-destructive/20 rounded-lg">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-2 h-2 bg-destructive rounded-full animate-ping" />
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                </div>
                <span className="text-destructive font-mono text-xs font-medium tabular-nums">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Separator */}
              <div className="w-px h-5 bg-border/40" />

              {/* Pause/Resume - Only show if supported */}
              {(canPause() || canResume()) && (
                <button
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors duration-150",
                    "text-foreground hover:text-foreground hover:bg-accent",
                    !canPause() && !canResume() && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  disabled={!canPause() && !canResume()}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Stop Button */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                className={cn(
                  "flex items-center justify-center",
                  "px-2.5 py-1 mx-0.5",
                  "bg-destructive/10 hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
                  "text-destructive-foreground",
                  "rounded-lg border border-destructive/50 dark:border-destructive/30",
                  "transition-colors duration-200",
                  "active:scale-95"
                )}
                onClick={handleStopRecording}
                title="Stop Recording"
              >
                <Square className="w-3 h-3 mr-1" />
                <span className="text-[10px] font-medium">Stop</span>
              </button>

              {/* Close/Minimize */}
              <button
                style={{ WebkitAppRegion: 'no-drag' } as any}
                className={cn(
                  "p-1.5 rounded-lg transition-colors duration-200",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                onClick={() => window.electronAPI?.minimizeRecordButton?.()}
                title="Hide"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Inline Source Picker - Expands below when shown */}
        <AnimatePresence mode="wait">
          {showSourcePicker && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                duration: 0.1,
                ease: 'easeOut'
              }}
              style={{ overflow: 'hidden' }}
            >
              <div className="p-3 border-t border-border/30">
                {/* Quick source selection */}
                <div className="flex flex-wrap gap-2 mb-3 justify-center">
                  {/* Area Selection */}
                  {areaOption && (
                    <button
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      onClick={() => {
                        window.electronAPI?.hideMonitorOverlay?.()
                        setSelectedSourceId(areaOption.id)
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-colors min-w-[80px]",
                        selectedSourceId === areaOption.id
                          ? "border-primary bg-primary/10"
                          : "border-border/50 hover:border-primary/50 hover:bg-accent/50"
                      )}
                    >
                      <Maximize2 className="w-4 h-4 text-primary" />
                      <span className="text-[10px] font-medium">Select Area</span>
                    </button>
                  )}

                  {/* Screens - sorted alphabetically */}
                  {screens
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((screen) => (
                      <button
                        key={screen.id}
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                        onClick={() => handleScreenSelection(screen)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-colors min-w-[80px]",
                          selectedSourceId === screen.id
                            ? "border-primary bg-primary/10"
                            : "border-border/50 hover:border-primary/50 hover:bg-accent/50"
                        )}
                      >
                        <Monitor className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-medium truncate w-full text-center">
                          {screen.name}
                        </span>
                      </button>
                    ))}
                </div>

                {/* Windows section if there are any */}
                {windows.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <AppWindow className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Applications</span>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>
                    <div className="grid grid-cols-4 gap-0.5 max-h-24 overflow-y-auto">
                      {windows.slice(0, 8).map((source) => (
                        <button
                          style={{ WebkitAppRegion: 'no-drag' } as any}
                          key={source.id}
                          onClick={() => handleWindowSelection(source)}
                          className={cn(
                            "p-1 rounded border text-[9px] truncate transition-colors",
                            selectedSourceId === source.id
                              ? "border-primary bg-primary/10"
                              : "border-border/30 hover:border-primary/50 hover:bg-accent/50"
                          )}
                          title={source.name}
                        >
                          {source.name.split(' - ')[0]}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                  <button
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    onClick={() => {
                      window.electronAPI?.hideMonitorOverlay?.()
                      setShowSourcePicker(false)
                      setSelectedSourceId(null)
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3 inline mr-1" />
                    Back
                  </button>
                  <button
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    onClick={handleSourceSelect}
                    disabled={!selectedSourceId}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      selectedSourceId
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    Start Recording
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
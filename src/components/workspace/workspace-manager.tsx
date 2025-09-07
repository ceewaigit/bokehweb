"use client"

import { useCallback, useEffect, useState, useRef, startTransition } from 'react'
import { Toolbar } from '../toolbar'
import { PreviewAreaRemotion } from '../preview-area-remotion'
import dynamic from 'next/dynamic'

const TimelineCanvas = dynamic(
  () => import('../timeline/timeline-canvas').then(mod => mod.TimelineCanvas),
  { ssr: false }
)
import { EffectsSidebar } from '../effects-sidebar'
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import type { Effect, ZoomBlock, ZoomEffectData } from '@/types/project'
import { CommandManager, DefaultCommandContext, UpdateZoomBlockCommand } from '@/lib/commands'
import { TimeConverter } from '@/lib/timeline/time-converter'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'

// Extract project loading logic to reduce component complexity
async function loadProjectRecording(
  recording: any,
  setIsLoading: (loading: boolean) => void,
  setLoadingMessage: (message: string) => void,
  newProject: (name: string) => void,
  setLastSavedAt: (timestamp: string | null) => void
) {
  if (!recording.project) {
    alert('This recording does not have an associated project. Please try loading a different .ssproj file.')
    return false
  }

  // Initialize wallpaper if not already done
  await initializeDefaultWallpaper()

  const project = recording.project

  setLoadingMessage('Creating project...')
  newProject(project.name)

  // Get project directory for resolving relative paths
  const projectDir = recording.path.substring(0, recording.path.lastIndexOf('/'))

  // Set last saved timestamp to the project's modified time
  setLastSavedAt(project.modifiedAt || new Date().toISOString())

  // Load each recording from the project
  for (let i = 0; i < project.recordings.length; i++) {
    const rec = project.recordings[i]
    setLoadingMessage(`Setting up video ${i + 1} of ${project.recordings.length}...`)

    if (rec.filePath) {
      try {
        // Resolve video path relative to project file location
        let videoPath = rec.filePath
        if (!videoPath.startsWith('/')) {
          videoPath = `${projectDir}/${videoPath}`
        }

        // Update the recording's filePath to be absolute
        rec.filePath = videoPath

        // Verify and fix recording duration and dimensions if needed
        if (!rec.duration || rec.duration <= 0 || !isFinite(rec.duration) || !rec.width || !rec.height) {
          setLoadingMessage('Detecting video properties...')

          // Use blob manager to load the video safely with high priority
          const blobUrl = await globalBlobManager.loadVideo(rec.id, videoPath)

          if (blobUrl) {
            const tempVideo = document.createElement('video')
            tempVideo.src = blobUrl

            await new Promise<void>((resolve) => {
              tempVideo.addEventListener('loadedmetadata', () => {
                if (tempVideo.duration > 0 && isFinite(tempVideo.duration)) {
                  rec.duration = tempVideo.duration * 1000
                }

                // Also detect video dimensions if missing
                if (!rec.width || !rec.height) {
                  rec.width = tempVideo.videoWidth
                  rec.height = tempVideo.videoHeight
                }

                resolve()
              }, { once: true })

              tempVideo.addEventListener('error', () => {
                resolve()
              }, { once: true })

              tempVideo.load()
            })

            tempVideo.remove()
          } else {
            console.error('Failed to load video for property detection')
          }
        }

        // Fix clip durations if recording duration was updated
        for (const track of project.timeline.tracks) {
          for (const clip of track.clips) {
            if (clip.recordingId === rec.id && rec.duration && rec.duration > 0) {
              clip.duration = Math.min(clip.duration, rec.duration)
              clip.sourceOut = Math.min(clip.sourceOut, rec.duration)
            }
          }
        }

        // Load video and metadata together
        if (rec.filePath || rec.metadata) {
          setLoadingMessage(`Loading video ${i + 1}...`)
          await globalBlobManager.loadVideos([{
            id: rec.id,
            filePath: rec.filePath,
            metadata: rec.metadata
          }])
        }
      } catch (error) {
        console.error('Failed to load recording from project:', error)
      }
    }
  }

  // Initialize effects array if it doesn't exist
  if (!project.timeline.effects) {
    project.timeline.effects = []
  }

  // Ensure global background and cursor effects exist
  const hasGlobalBackground = project.timeline.effects.some((e: any) => e.type === 'background')
  const hasGlobalCursor = project.timeline.effects.some((e: any) => e.type === 'cursor')

  // Update existing background effect with wallpaper if needed
  const existingBg = project.timeline.effects.find((e: any) => e.type === 'background')
  if (existingBg && existingBg.data?.type === 'wallpaper' && !existingBg.data?.wallpaper) {
    const { getDefaultWallpaper } = await import('@/lib/constants/default-effects')
    const defaultWallpaper = getDefaultWallpaper()
    if (defaultWallpaper) {
      existingBg.data.wallpaper = defaultWallpaper
    }
  }

  if (!hasGlobalBackground) {
    const { getDefaultWallpaper } = await import('@/lib/constants/default-effects')
    const defaultWallpaper = getDefaultWallpaper()

    project.timeline.effects.push({
      id: 'background-global',
      type: 'background',
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        type: 'wallpaper',
        gradient: {
          colors: ['#2D3748', '#1A202C'],
          angle: 135
        },
        wallpaper: defaultWallpaper,
        padding: 40,
        cornerRadius: 15,
        shadowIntensity: 85
      },
      enabled: true
    })
  }

  if (!hasGlobalCursor) {
    project.timeline.effects.push({
      id: 'cursor-global',
      type: 'cursor',
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        style: 'macOS',
        size: 4.0,
        color: '#ffffff',
        clickEffects: true,
        motionBlur: true,
        hideOnIdle: true,
        idleTimeout: 3000
      },
      enabled: true
    })
  }

  // Set the project ONCE after all recordings are processed
  useProjectStore.getState().setProject(project)

  // Calculate and set optimal zoom for the timeline
  const viewportWidth = window.innerWidth
  const optimalZoom = TimeConverter.calculateOptimalZoom(project.timeline.duration, viewportWidth)
  useProjectStore.getState().setAutoZoom(optimalZoom)

  const firstClip = project.timeline.tracks
    .flatMap((t: any) => t.clips)
    .sort((a: any, b: any) => a.startTime - b.startTime)[0]
  if (firstClip) {
    useProjectStore.getState().selectClip(firstClip.id)
  }

  return true
}

export function WorkspaceManager() {
  // Store hooks - using reactive state from single source of truth
  const {
    currentProject,
    newProject,
    selectedClipId,
    selectedEffectLayer,
    currentTime,
    isPlaying,
    playheadClip,        // Reactive from store
    playheadRecording,   // Reactive from store
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    selectClip,
    updateEffect,
    addEffect,
    saveCurrentProject,
    openProject,
    setZoom,
    zoom
  } = useProjectStore()

  // Initialize default wallpaper once on mount
  useEffect(() => {
    initializeDefaultWallpaper()
  }, [])


  const {
    isPropertiesOpen,
    isExportOpen,
    propertiesPanelWidth,
    toggleProperties,
    setExportOpen
  } = useWorkspaceStore()


  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  // Local effects state - tracks unsaved changes as Effect[]
  const [localEffects, setLocalEffects] = useState<Effect[] | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Command manager for undo/redo support
  const commandManagerRef = useRef<CommandManager | null>(null)
  const commandContextRef = useRef<DefaultCommandContext | null>(null)

  // Initialize command manager
  useEffect(() => {
    const store = useProjectStore.getState()
    commandContextRef.current = new DefaultCommandContext(store)
    commandManagerRef.current = CommandManager.getInstance(commandContextRef.current)
  }, [])

  // Get selected clip (only needed for timeline editing operations)
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null

  // Effects for preview are derived per-clip inside PreviewAreaRemotion
  const handleZoomBlockUpdate = useCallback((blockId: string, updates: Partial<ZoomBlock>) => {
    if (commandManagerRef.current) {
      const currentStore = useProjectStore.getState()
      const freshContext = new DefaultCommandContext(currentStore)
      const command = new UpdateZoomBlockCommand(freshContext, blockId, updates)
      commandManagerRef.current.execute(command)
    }
  }, [])

  // Playback control ref
  const playbackIntervalRef = useRef<NodeJS.Timeout>()

  // Track unsaved changes by comparing saved timestamp with current
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Simple check: if project modifiedAt differs from lastSavedAt, we have unsaved changes
  useEffect(() => {
    if (currentProject?.modifiedAt && lastSavedAt) {
      setHasUnsavedChanges(currentProject.modifiedAt !== lastSavedAt)
    }
  }, [currentProject?.modifiedAt, lastSavedAt])

  // Consolidated save function
  const handleSaveProject = useCallback(async () => {
    // If there are local unsaved effect changes, merge them into the project store
    if (localEffects) {
      // Get current project effects
      const projectEffects = currentProject?.timeline?.effects || []

      // For each local effect, update or add it to the project store
      localEffects.forEach(localEffect => {
        const existingInProject = projectEffects.find(e => e.id === localEffect.id)

        if (existingInProject) {
          // Update existing effect in the store (only mutable fields to avoid clobbering timing)
          updateEffect(localEffect.id, { data: (localEffect as any).data, enabled: localEffect.enabled })
        } else {
          // Add new effect to the store
          addEffect(localEffect)
        }
      })

      // Clear local effects after merging
      setLocalEffects(null)
    }

    // Extra safety: ensure any selected new screen block changes are flushed
    if (selectedEffectLayer?.type === 'screen' && selectedEffectLayer?.id) {
      const baseEffects = currentProject?.timeline?.effects || []
      const local = (localEffects || [])
        .find(e => e.id === selectedEffectLayer.id)
      if (local) {
        const exists = baseEffects.find(e => e.id === local.id)
        if (exists) {
          updateEffect(local.id, { data: (local as any).data, enabled: local.enabled })
        } else {
          addEffect(local)
        }
      }
    }

    await saveCurrentProject()

    // Use the project's modifiedAt timestamp after saving
    const savedProject = useProjectStore.getState().currentProject
    if (savedProject?.modifiedAt) {
      setLastSavedAt(savedProject.modifiedAt)
    }
    setHasUnsavedChanges(false)
  }, [localEffects, playheadClip, updateEffect, addEffect, saveCurrentProject, selectedEffectLayer, currentProject])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        await handleSaveProject()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveProject])

  // Playhead recording now comes directly from store's reactive state
  // No need to calculate - store maintains this


  // Define handlePause first since it's used in useEffect
  const handlePause = useCallback(() => {
    storePause()
  }, [storePause])

  // Monitor clip boundaries during playback - use reactive playhead clip from store
  useEffect(() => {
    if (!playheadClip || !isPlaying) return

    const syncInterval = setInterval(() => {
      if (!isPlaying || !playheadClip) return

      const clipProgress = Math.max(0, currentTime - playheadClip.startTime)
      const sourceTime = (playheadClip.sourceIn + clipProgress) / 1000
      const maxTime = playheadClip.sourceOut / 1000

      if (sourceTime > maxTime) {
        handlePause()
      }
    }, 100)

    playbackIntervalRef.current = syncInterval

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
    }
  }, [isPlaying, currentTime, playheadClip, handlePause])

  // Centralized playback control - no selection required for playback
  const handlePlay = useCallback(() => {
    storePlay()
  }, [storePlay])

  const handleSeek = useCallback((time: number) => {
    storeSeek(time)
  }, [storeSeek])

  const handleClipSelect = useCallback((clipId: string) => {
    setHasUnsavedChanges(false)
    selectClip(clipId)
  }, [selectClip])

  const handleEffectChange = useCallback((type: 'zoom' | 'cursor' | 'background' | 'keystroke' | 'annotation' | 'screen', data: any) => {
    // Always operate on the full effect list for correctness
    const baseEffects = localEffects || currentProject?.timeline.effects || []

    let newEffects: Effect[]

    // Zoom-specific handling
    if (type === 'zoom' && (data.enabled !== undefined || data.regenerate)) {
      // Global zoom operations regardless of selection
      if (data.enabled !== undefined) {
        newEffects = baseEffects.map(effect => (
          effect.type === 'zoom' ? { ...effect, enabled: data.enabled } : effect
        ))

        // Also update store so timeline reflects the state immediately
        baseEffects.forEach(effect => {
          if (effect.type === 'zoom') {
            updateEffect(effect.id, { enabled: data.enabled })
          }
        })
      } else {
        newEffects = [...baseEffects]
      }
    } else if (type === 'zoom' && selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id) {
      // Update a specific zoom block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        newEffects = [...baseEffects]
        newEffects[existingEffectIndex] = {
          ...newEffects[existingEffectIndex],
          data: {
            ...newEffects[existingEffectIndex].data,
            ...data
          }
        }
      } else {
        return
      }
    } else if (type === 'zoom') {
      newEffects = [...baseEffects]
    } else if (type === 'screen' && selectedEffectLayer?.type === 'screen' && selectedEffectLayer?.id) {
      // Update a specific screen block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        newEffects = [...baseEffects]
        newEffects[existingEffectIndex] = {
          ...newEffects[existingEffectIndex],
          data: {
            ...newEffects[existingEffectIndex].data,
            ...data
          }
        }
      } else {
        return
      }
    } else if (type === 'annotation') {
      // Screen effects and cinematic scroll as annotations
      const kind = data?.kind
      if (!kind) return
      const existsIndex = baseEffects.findIndex(e => e.type === 'annotation' && (e as any).data?.kind === kind)
      let newEffectsArr = [...baseEffects]
      if (existsIndex >= 0) {
        const prev = newEffectsArr[existsIndex]
        const enabled = data.enabled !== undefined ? data.enabled : prev.enabled
        const mergedData = { ...(prev as any).data, ...(data.data || {}), kind }
        newEffectsArr[existsIndex] = { ...prev, enabled, data: mergedData }
      } else {
        // Create new annotation spanning current clip or entire timeline fallback
        const clip = selectedClip
        const startTime = clip ? clip.startTime : 0
        const endTime = clip ? clip.startTime + clip.duration : (currentProject?.timeline.duration || Number.MAX_SAFE_INTEGER)
        const newEffect: Effect = {
          id: `anno-${kind}-${Date.now()}`,
          type: 'annotation',
          startTime,
          endTime,
          enabled: data.enabled !== undefined ? data.enabled : true,
          data: { kind, ...(data.data || {}) }
        }
        newEffectsArr.push(newEffect)
      }
      newEffects = newEffectsArr
    } else {
      // Background, cursor, and keystroke are global effects
      const existingEffectIndex = baseEffects.findIndex(e => e.type === type)

      if (existingEffectIndex >= 0) {
        const enabled = data.enabled !== undefined ? data.enabled : baseEffects[existingEffectIndex].enabled
        const { enabled: _dataEnabled, ...effectData } = data

        newEffects = [...baseEffects]
        newEffects[existingEffectIndex] = {
          ...newEffects[existingEffectIndex],
          data: {
            ...newEffects[existingEffectIndex].data,
            ...effectData
          },
          enabled
        }
      } else {
        const { enabled: dataEnabled, ...effectData } = data
        const newEffect: Effect = {
          id: `${type}-global-${Date.now()}`,
          type,
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: effectData,
          enabled: dataEnabled !== undefined ? dataEnabled : true
        }
        newEffects = [...baseEffects, newEffect]
      }
    }

    startTransition(() => {
      setLocalEffects(newEffects)
      setHasUnsavedChanges(true)
    })
  }, [localEffects, currentProject, selectedEffectLayer])



  // Show loading screen when processing
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50">
        <div className="text-center space-y-6">
          {/* Single animated spinner */}
          <div className="w-16 h-16 border-4 border-primary/20 rounded-full border-t-primary animate-spin" />

          {/* Loading message */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">{loadingMessage}</h3>
            <p className="text-sm text-muted-foreground">Please wait while we set everything up...</p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 justify-center">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  // Show recordings library when no active project
  if (!currentProject) {
    return (
      <>
        <div className="fixed inset-0 flex flex-col">
          <RecordingsLibrary
            onSelectRecording={async (recording) => {
              setIsLoading(true)
              setLoadingMessage('Loading recording...')

              try {
                // Clean up library resources before loading project
                ThumbnailGenerator.clearCache()
                globalBlobManager.cleanupByType('thumbnail')

                const success = await loadProjectRecording(
                  recording,
                  setIsLoading,
                  setLoadingMessage,
                  newProject,
                  setLastSavedAt
                )

                if (!success) {
                  setIsLoading(false)
                  setLoadingMessage('')
                  return
                }

                // Hide record button when entering workspace
                if (window.electronAPI?.minimizeRecordButton) {
                  window.electronAPI.minimizeRecordButton()
                }

                setIsLoading(false)
              } catch (error) {
                console.error('Failed to load recording:', error)
                setIsLoading(false)
              }
            }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 flex flex-col bg-background" style={{ width: '100vw', height: '100vh' }}>
        {/* Top Toolbar - Compact with macOS traffic light padding */}
        <div className="flex-shrink-0 bg-background/60 backdrop-blur-sm overflow-hidden border-b border-border/50" style={{ height: '48px', paddingLeft: '80px' }}>
          <Toolbar
            project={currentProject}
            onToggleProperties={toggleProperties}
            onExport={() => setExportOpen(true)}
            onSaveProject={handleSaveProject}
            onBackToLibrary={() => {
              // Clean up resources and navigate back to library
              const cleanupAndReturn = () => {
                // Clean up local state
                setLocalEffects(null)
                setHasUnsavedChanges(false)

                // Clean up stores
                useProjectStore.getState().cleanupProject()
                useWorkspaceStore.getState().resetWorkspace()

                // Hide record button when returning to library (main window visible)
                if (window.electronAPI?.minimizeRecordButton) {
                  window.electronAPI.minimizeRecordButton()
                }
              }

              // If there are unsaved changes, confirm before leaving
              if (hasUnsavedChanges) {
                if (confirm('You have unsaved changes. Do you want to leave without saving?')) {
                  cleanupAndReturn()
                }
              } else {
                cleanupAndReturn()
              }
            }}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>

        {/* Main Content Area - Use remaining height */}
        <div className="flex flex-col" style={{ height: 'calc(100vh - 48px)' }}>
          {/* Top Section - Preview and Sidebar (60% height) */}
          <div className="flex" style={{ height: '60%' }}>
            {/* Preview Area */}
            <div className="overflow-hidden" style={{ width: isPropertiesOpen ? `calc(100vw - ${propertiesPanelWidth}px)` : '100vw' }}>
              <PreviewAreaRemotion
                playheadClip={playheadClip}
                playheadRecording={playheadRecording}
                currentTime={currentTime}
                isPlaying={isPlaying}
                localEffects={localEffects}
              />
            </div>

            {/* Properties Panel - Fixed width when open, same height as preview */}
            {isPropertiesOpen && (
              <div
                className="bg-background/40 backdrop-blur-sm overflow-hidden"
                style={{ width: `${propertiesPanelWidth}px` }}
              >
                <EffectsSidebar
                  className="h-full w-full"
                  selectedClip={selectedClip}
                  effects={localEffects || currentProject?.timeline.effects || []}
                  selectedEffectLayer={selectedEffectLayer}
                  onEffectChange={handleEffectChange}
                />
              </div>
            )}
          </div>

          {/* Timeline Section - Full width at bottom (40% height) */}
          <div className="bg-background/60 backdrop-blur-sm overflow-hidden border-t border-border/50" style={{ height: '40%', width: '100vw' }}>
            <TimelineCanvas
              className="h-full w-full"
              currentProject={currentProject}
              currentTime={currentTime}
              isPlaying={isPlaying}
              zoom={zoom}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onClipSelect={handleClipSelect}
              onZoomChange={setZoom}
              onZoomBlockUpdate={handleZoomBlockUpdate}
            />
          </div>
        </div>

        {/* Dialogs and Modals */}
        <ExportDialog
          isOpen={isExportOpen}
          onClose={() => setExportOpen(false)}
        />
      </div>

    </>
  )
}
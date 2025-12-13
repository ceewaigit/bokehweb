"use client"

import { useCallback, useEffect, useState, useRef, startTransition, useMemo } from 'react'
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
import type { Effect, ZoomBlock, ZoomEffectData } from '@/types/project'
import { EffectType, BackgroundType, CursorStyle } from '@/types/project'
import { CommandManager, DefaultCommandContext, UpdateZoomBlockCommand } from '@/lib/commands'
import { TimeConverter, timelineToSource, getSourceDuration } from '@/lib/timeline/time-space-converter'
import { TimelineConfig } from '@/lib/timeline/config'
import { initializeDefaultWallpaper } from '@/lib/constants/default-effects'
import { EffectLayerType } from '@/types/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { migrationRunner } from '@/lib/migrations'

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

  // Deep clone the project to allow mutations (JSON objects are frozen/read-only)
  let project = structuredClone(recording.project)

  // Run migrations to convert old source-space zoom effects to timeline-space
  if ((project as any).schemaVersion == null) {
    console.warn('[WorkspaceManager] schemaVersion missing; assuming v0 and migrating')
      ; (project as any).schemaVersion = 0
  }
  project = migrationRunner.migrateProject(project)

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

            // Properly release video resources before removing
            tempVideo.pause()
            tempVideo.src = ''
            tempVideo.load()
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
              // Prevent NaN corruption: only update sourceOut if it exists and is valid
              if (clip.sourceOut != null && isFinite(clip.sourceOut)) {
                clip.sourceOut = Math.min(clip.sourceOut, rec.duration)
              } else {
                // Initialize sourceOut if missing or invalid
                clip.sourceOut = rec.duration
              }
            }
          }
        }

        // Load metadata from chunk files when not bundled in project
        if (!rec.metadata && rec.metadataChunks && rec.folderPath) {
          try {
            setLoadingMessage(`Loading interactions ${i + 1} of ${project.recordings.length}...`)
            const loadedMetadata = await RecordingStorage.loadMetadataChunks(
              rec.folderPath,
              rec.metadataChunks
            )

            rec.metadata = loadedMetadata
            RecordingStorage.setMetadata(rec.id, loadedMetadata)
          } catch (error) {
            console.error('Failed to load metadata chunks for recording:', error)
          }
        }

        // Regenerate effects if metadata exists but effects are empty
        if (rec.metadata && (!rec.effects || rec.effects.length === 0)) {
          if (!rec.effects) {
            rec.effects = []
          }
          EffectsFactory.createInitialEffectsForRecording(rec)
        }

        // Load video and metadata together
        if (rec.filePath || rec.metadata) {
          setLoadingMessage(`Loading video ${i + 1}...`)
          await globalBlobManager.loadVideos([{
            id: rec.id,
            filePath: rec.filePath,
            folderPath: rec.folderPath,
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

  // NOTE: Zoom effects are now stored in timeline.effects[] (timeline-space).
  // They are migrated from recording.effects[] on project load.
  // This preserves backward compatibility via the migration system.

  // Ensure global background/cursor effects exist (SSOT: EffectsFactory + default-effects).
  EffectsFactory.ensureGlobalEffects(project)

  // Set the project ONCE after all recordings are processed
  useProjectStore.getState().setProject(project)

  // Verify after setting
  const storedProject = useProjectStore.getState().currentProject

  // Calculate adaptive zoom limits based on zoom blocks
  const viewportWidth = window.innerWidth
  const allZoomEffects = project.recordings.flatMap((r: any) =>
    EffectsFactory.getZoomEffects(r.effects || [])
  )
  const zoomBlocks = allZoomEffects.map((e: any) => ({
    startTime: e.startTime,
    endTime: e.endTime
  }))
  const adaptiveLimits = TimeConverter.calculateAdaptiveZoomLimits(
    project.timeline.duration,
    viewportWidth,
    zoomBlocks,
    TimelineConfig.ZOOM_EFFECT_MIN_VISUAL_WIDTH_PX
  )

  // Calculate optimal zoom and clamp to adaptive limits
  const optimalZoom = TimeConverter.calculateOptimalZoom(project.timeline.duration, viewportWidth)
  const clampedZoom = Math.max(adaptiveLimits.min, Math.min(adaptiveLimits.max, optimalZoom))
  useProjectStore.getState().setAutoZoom(clampedZoom)

  // Don't auto-select first clip - let sidebar show default tab

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
    playheadClip,
    playheadRecording,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    selectClip,
    updateEffect,
    addEffect,
    saveCurrentProject,
    openProject,
    setZoom,
    zoom,
    setProject
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

  // SINGLE SOURCE OF TRUTH: Get all effects for the current context
  // Merges timeline.effects (zoom, background, cursor) + recording.effects (recording-scoped non-zoom)
  const contextEffects = useMemo((): Effect[] => {
    if (!currentProject) return []

    const effects: Effect[] = []

    // Add timeline effects (background, cursor, keystroke)
    if (currentProject.timeline.effects) {
      effects.push(...currentProject.timeline.effects)
    }

    // Add recording-scoped non-zoom effects from playhead recording or selected clip's recording
    const targetRecording = playheadRecording || (selectedClip && currentProject.recordings.find(r => r.id === selectedClip.recordingId))
    if (targetRecording?.effects) {
      effects.push(...targetRecording.effects)
    }

    return effects
  }, [currentProject, playheadRecording, selectedClip])

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
    // All changes are now stored directly in Zustand store
    // No need to sync local effects since we removed that state

    await saveCurrentProject()

    // Use the project's modifiedAt timestamp after saving
    const savedProject = useProjectStore.getState().currentProject
    if (savedProject?.modifiedAt) {
      setLastSavedAt(savedProject.modifiedAt)
    }
    setHasUnsavedChanges(false)
  }, [saveCurrentProject])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        await handleSaveProject()
      }

      // Cmd+Z or Ctrl+Z for Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (commandManagerRef.current?.canUndo()) {
          await commandManagerRef.current.undo()
        }
      }

      // Cmd+Shift+Z or Ctrl+Shift+Z (or Ctrl+Y) for Redo
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault()
        if (commandManagerRef.current?.canRedo()) {
          await commandManagerRef.current.redo()
        }
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

      // Convert timeline time to source time using the shared converter (respects playbackRate + remaps).
      const sourceTimeMs = timelineToSource(currentTime, playheadClip)
      const sourceOutMs =
        playheadClip.sourceOut ??
        ((playheadClip.sourceIn || 0) + getSourceDuration(playheadClip))

      if (sourceTimeMs > sourceOutMs) {
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

  const handleClipSelect = useCallback((_clipId: string) => {
    setHasUnsavedChanges(false)
  }, [])

  const handleEffectChange = useCallback((type: EffectType, data: any) => {
    // Get effects from single source of truth
    const baseEffects = contextEffects
    const commandManager = commandManagerRef.current

    if (!commandManager) return

    // Helper to execute commands
    const executeCommand = (commandName: string, ...args: any[]) => {
      commandManager.executeByName(commandName, ...args)
    }

    // Zoom-specific handling
    if (type === EffectType.Zoom && (data.enabled !== undefined || data.regenerate)) {
      // Global zoom operations regardless of selection
      if (data.enabled !== undefined) {
        const existingZoomEffects = baseEffects.filter(e => e.type === EffectType.Zoom)

        // If enabling zoom but no zoom effects exist, generate them
        if (data.enabled && existingZoomEffects.length === 0) {
          // Generate zoom effects from recording's mouse events
          const recording = playheadRecording || currentProject?.recordings[0]
          if (recording && currentProject) {
            // Import zoom detector dynamically to generate zoom blocks
            import('@/lib/effects/utils/zoom-detector').then(({ ZoomDetector }) => {
              const zoomDetector = new ZoomDetector()
              const zoomBlocks = zoomDetector.detectZoomBlocks(
                recording.metadata?.mouseEvents || [],
                recording.width || 1920,
                recording.height || 1080,
                recording.duration
              )

              // Find the first clip that uses this recording for timeline conversion
              const allClips = currentProject.timeline.tracks.flatMap(t => t.clips)
              const clipForRecording = allClips.find(c => c.recordingId === recording.id)

              if (clipForRecording) {
                // Convert each zoom block from source-space to timeline-space
                zoomBlocks.forEach((block, index) => {
                  const sourceIn = clipForRecording.sourceIn || 0
                  const playbackRate = clipForRecording.playbackRate || 1
                  const clipStart = clipForRecording.startTime

                  const timelineStart = clipStart + (block.startTime - sourceIn) / playbackRate
                  const timelineEnd = clipStart + (block.endTime - sourceIn) / playbackRate

                  // Create timeline-space effect
                  const timelineEffect: Effect = {
                    id: `zoom-timeline-${Date.now()}-${index}`,
                    type: EffectType.Zoom,
                    startTime: Math.max(0, timelineStart),
                    endTime: Math.max(timelineStart + 100, timelineEnd),
                    data: {
                      scale: block.scale,
                      targetX: block.targetX,
                      targetY: block.targetY,
                      screenWidth: block.screenWidth,
                      screenHeight: block.screenHeight,
                      introMs: block.introMs || 300,
                      outroMs: block.outroMs || 300,
                      smoothing: 0.1
                    } as ZoomEffectData,
                    enabled: true
                  }

                  executeCommand('AddEffect', timelineEffect)
                })
              }
            })
          }
        } else {
          // Update existing zoom effects
          baseEffects.forEach(effect => {
            if (effect.type === EffectType.Zoom) {
              executeCommand('UpdateEffect', effect.id, { enabled: data.enabled })
            }
          })
        }
      }
    } else if (type === EffectType.Zoom && selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id) {
      // Update a specific zoom block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        const effect = baseEffects[existingEffectIndex]
        executeCommand('UpdateEffect', effect.id, {
          data: {
            ...effect.data,
            ...data
          }
        })
      }
      return
    } else if (type === EffectType.Zoom) {
      // No specific zoom block selected, maybe just toggling?
      // Original code did nothing here: newEffects = [...baseEffects]
    } else if (type === EffectType.Screen && selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id) {
      // Update a specific screen block
      const existingEffectIndex = baseEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        const effect = baseEffects[existingEffectIndex]
        executeCommand('UpdateEffect', effect.id, {
          data: {
            ...effect.data,
            ...data
          }
        })
      }
      return
    } else if (type === EffectType.Annotation) {
      // Screen effects and cinematic scroll as annotations
      const kind = data?.kind
      if (!kind) return
      const existsIndex = baseEffects.findIndex(e => e.type === EffectType.Annotation && (e as any).data?.kind === kind)

      if (existsIndex >= 0) {
        const prev = baseEffects[existsIndex]
        const enabled = data.enabled !== undefined ? data.enabled : prev.enabled
        const mergedData = { ...(prev as any).data, ...(data.data || {}), kind }

        executeCommand('UpdateEffect', prev.id, {
          enabled,
          data: mergedData
        })
      } else {
        // Create new annotation spanning current clip or entire timeline fallback
        const clip = selectedClip
        const startTime = clip ? clip.startTime : 0
        const endTime = clip ? clip.startTime + clip.duration : (currentProject?.timeline.duration || Number.MAX_SAFE_INTEGER)
        const newEffect: Effect = {
          id: `anno-${kind}-${Date.now()}`,
          type: EffectType.Annotation,
          startTime,
          endTime,
          enabled: data.enabled !== undefined ? data.enabled : true,
          data: { kind, ...(data.data || {}) }
        }
        executeCommand('AddEffect', newEffect)
      }
      return
    } else {
      // Background, cursor, and keystroke are global effects
      const existingEffectIndex = baseEffects.findIndex(e => e.type === type)

      if (existingEffectIndex >= 0) {
        const effect = baseEffects[existingEffectIndex]
        const enabled = data.enabled !== undefined ? data.enabled : effect.enabled
        const { enabled: _dataEnabled, ...effectData } = data

        executeCommand('UpdateEffect', effect.id, {
          enabled,
          data: {
            ...effect.data,
            ...effectData
          }
        })
      } else {
        const { enabled: dataEnabled, ...effectData } = data
        const newEffect: Effect = {
          id: `${type}-global-${Date.now()}`,
          type: type as EffectType,
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: effectData,
          enabled: dataEnabled !== undefined ? dataEnabled : true
        }
        executeCommand('AddEffect', newEffect)
      }
    }
  }, [currentProject, selectedEffectLayer, playheadRecording, selectedClip, contextEffects])

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
                // No cache clearing here to keep library fast and quiet

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
      <div className="fixed inset-0 flex flex-col bg-transparent" style={{ width: '100vw', height: '100vh' }}>
        {/* Top Toolbar - Compact with macOS traffic light padding */}
        <div className="flex-shrink-0 bg-transparent overflow-hidden border-b border-border/50" style={{ height: '48px', paddingLeft: '80px' }}>
          <Toolbar
            project={currentProject}
            onToggleProperties={toggleProperties}
            onExport={() => setExportOpen(true)}
            onSaveProject={handleSaveProject}
            onBackToLibrary={() => {
              // Clean up resources and navigate back to library
              const cleanupAndReturn = () => {
                // Clean up local state
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
                currentTime={currentTime}
                isPlaying={isPlaying}
              />
            </div>

            {/* Properties Panel - Fixed width when open, same height as preview */}
            {isPropertiesOpen && (
              <div
                className="bg-transparent overflow-hidden"
                style={{ width: `${propertiesPanelWidth}px` }}
              >
                <EffectsSidebar
                  className="h-full w-full"
                  selectedClip={selectedClip}
                  effects={contextEffects}
                  selectedEffectLayer={selectedEffectLayer}
                  onEffectChange={handleEffectChange}
                  onZoomBlockUpdate={handleZoomBlockUpdate}
                />
              </div>
            )}
          </div>

          {/* Timeline Section - Full width at bottom (40% height) */}
          <div className="bg-transparent overflow-hidden border-t border-border/50" style={{ height: '40%', width: '100vw' }}>
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

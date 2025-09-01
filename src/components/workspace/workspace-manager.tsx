"use client"

import { useCallback, useEffect, useState, useRef } from 'react'
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
import { TimelineUtils } from '@/lib/timeline'
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
  
  // Log existing background effect and update with wallpaper if needed
  const existingBg = project.timeline.effects.find((e: any) => e.type === 'background')
  if (existingBg) {
    console.log('Loading project - existing background effect:', {
      type: existingBg.data?.type,
      hasWallpaper: !!existingBg.data?.wallpaper,
      wallpaperLength: existingBg.data?.wallpaper?.length || 0,
      gradient: existingBg.data?.gradient
    })
    
    // If the background effect doesn't have a wallpaper, add it
    if (existingBg.data?.type === 'wallpaper' && !existingBg.data?.wallpaper) {
      const { getDefaultWallpaper } = await import('@/lib/constants/default-effects')
      const defaultWallpaper = getDefaultWallpaper()
      
      if (defaultWallpaper) {
        console.log('Updating existing background effect with wallpaper:', defaultWallpaper.length, 'chars')
        existingBg.data.wallpaper = defaultWallpaper
      } else {
        console.log('No wallpaper available to update existing effect')
      }
    }
  }
  
  if (!hasGlobalBackground) {
    const { getDefaultWallpaper } = await import('@/lib/constants/default-effects')
    const defaultWallpaper = getDefaultWallpaper()
    
    console.log('Creating new background effect with wallpaper:', defaultWallpaper ? `${defaultWallpaper.length} chars` : 'none')

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
        padding: 80,
        cornerRadius: 25,
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
  const optimalZoom = TimelineUtils.calculateOptimalZoom(project.timeline.duration, viewportWidth)
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
    playheadClip,        // NEW: reactive from store
    playheadRecording,   // NEW: reactive from store
    playheadEffects,     // NEW: reactive from store
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

  // Get selected clip (only needed for timeline editing operations)
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null

  // Effects now come directly from store's reactive playheadEffects
  // No need to calculate - store maintains this state
  const handleZoomBlockUpdate = useCallback((clipId: string, blockId: string, updates: Partial<ZoomBlock>) => {
    // Work with local effects or fall back to saved effects from store
    const currentEffects = localEffects || playheadEffects || []
    const zoomEffect = currentEffects.find(e => e.type === 'zoom' && e.id === blockId)

    if (zoomEffect) {
      // Update the effect in local state
      let updatedEffect: Effect

      // Check if this is a timing update or data update
      if ('startTime' in updates || 'endTime' in updates) {
        // Timing update - update the effect times directly
        updatedEffect = {
          ...zoomEffect,
          startTime: updates.startTime ?? zoomEffect.startTime,
          endTime: updates.endTime ?? zoomEffect.endTime
        }
      } else {
        // Data update - update the zoom data
        updatedEffect = {
          ...zoomEffect,
          data: {
            ...(zoomEffect.data as ZoomEffectData),
            ...updates
          }
        }
      }

      // Update local effects array
      const newEffects = currentEffects.map(e =>
        e.id === blockId ? updatedEffect : e
      )

      setLocalEffects(newEffects)
      setHasUnsavedChanges(true)

      // Also update via command for undo/redo support
      const store = useProjectStore.getState()
      const context = new DefaultCommandContext(store)
      const commandManager = CommandManager.getInstance(context)
      const command = new UpdateZoomBlockCommand(context, clipId, blockId, updates)
      commandManager.execute(command)
    }
  }, [playheadEffects, localEffects])

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
    // Save effects for the playhead clip
    if (localEffects && playheadClip?.id) {
      // Remove all existing effects for this clip
      const existingEffects = playheadEffects || []
      existingEffects.forEach(effect => {
        updateEffect(effect.id, { ...effect, enabled: false })
      })

      // Add all local effects as saved effects
      localEffects.forEach(effect => {
        if (existingEffects.find(e => e.id === effect.id)) {
          // Update existing effect
          updateEffect(effect.id, effect)
        } else {
          // Add new effect
          addEffect(effect)
        }
      })

      setLocalEffects(null)
    }

    await saveCurrentProject()

    // Use the project's modifiedAt timestamp after saving
    const savedProject = useProjectStore.getState().currentProject
    if (savedProject?.modifiedAt) {
      setLastSavedAt(savedProject.modifiedAt)
    }
    setHasUnsavedChanges(false)
  }, [localEffects, playheadClip, playheadEffects, updateEffect, addEffect, saveCurrentProject])

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

  const handleEffectChange = useCallback((type: 'zoom' | 'cursor' | 'background' | 'keystroke', data: any) => {
    // Work with local effects or fall back to saved effects
    const currentEffects = localEffects || playheadEffects || []
    
    console.log('handleEffectChange called:', {
      type,
      currentEffectsCount: currentEffects.length,
      zoomEffectsCount: currentEffects.filter(e => e.type === 'zoom').length,
      backgroundEffectsCount: currentEffects.filter(e => e.type === 'background').length
    })

    let newEffects: Effect[]

    // For zoom effects with a selected effect layer, update the specific zoom effect
    if (type === 'zoom' && selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id) {
      const existingEffectIndex = currentEffects.findIndex(e => e.id === selectedEffectLayer.id)
      if (existingEffectIndex >= 0) {
        newEffects = [...currentEffects]
        newEffects[existingEffectIndex] = {
          ...newEffects[existingEffectIndex],
          data: {
            ...newEffects[existingEffectIndex].data,  // Preserve existing zoom data
            ...data  // Merge with new zoom data
          }
        }
      } else {
        // Shouldn't happen, but handle gracefully
        return
      }
    } else if (type === 'zoom') {
      // Special handling for zoom operations without a specific block selected
      // This handles zoom toggle and regenerate operations
      
      if (data.enabled !== undefined) {
        // Toggle all zoom effects enabled state
        newEffects = currentEffects.map(effect => {
          if (effect.type === 'zoom') {
            return { ...effect, enabled: data.enabled }
          }
          return effect
        })
      } else if (data.regenerate) {
        // Trigger zoom regeneration - this should be handled by the store/command
        // For now, just preserve existing effects
        console.log('Zoom regeneration requested')
        newEffects = [...currentEffects]
      } else {
        // Unknown zoom operation, preserve existing effects
        newEffects = [...currentEffects]
      }
    } else {
      // For background, cursor, and keystroke - update the global effect
      const existingEffectIndex = currentEffects.findIndex(e => e.type === type)

      if (existingEffectIndex >= 0) {
        // Update existing effect in local state
        newEffects = [...currentEffects]

        // Handle enabled property if present in data
        const enabled = data.enabled !== undefined ? data.enabled : newEffects[existingEffectIndex].enabled

        // Remove enabled from data to avoid duplication
        const { enabled: dataEnabled, ...effectData } = data

        newEffects[existingEffectIndex] = {
          ...newEffects[existingEffectIndex],
          data: {
            ...newEffects[existingEffectIndex].data,  // Preserve existing data
            ...effectData  // Merge with new data
          },
          enabled
        }
      } else {
        // Add new global effect
        // Extract enabled from data if present
        const { enabled: dataEnabled, ...effectData } = data

        const newEffect: Effect = {
          id: `${type}-global-${Date.now()}`,
          type,
          // Global effects cover entire timeline
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: effectData,
          enabled: dataEnabled !== undefined ? dataEnabled : true
        }
        newEffects = [...currentEffects, newEffect]
      }
    }

    // Update local state
    console.log('handleEffectChange - Setting new effects:', {
      newEffectsCount: newEffects.length,
      newZoomEffectsCount: newEffects.filter(e => e.type === 'zoom').length,
      newBackgroundEffectsCount: newEffects.filter(e => e.type === 'background').length
    })
    setLocalEffects(newEffects)
    setHasUnsavedChanges(true)
  }, [playheadEffects, localEffects, selectedEffectLayer])



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
            onNewProject={async () => {
              // Ensure wallpaper is loaded
              await initializeDefaultWallpaper()

              // Clean up current project resources
              globalBlobManager.cleanupByType('video')
              globalBlobManager.cleanupByType('export')

              newProject('New Project')
              setLocalEffects(null)

              // Get the new project's modifiedAt timestamp
              const newProj = useProjectStore.getState().currentProject
              if (newProj?.modifiedAt) {
                setLastSavedAt(newProj.modifiedAt)
              }
              setHasUnsavedChanges(false)
            }}
            onSaveProject={handleSaveProject}
            onOpenProject={async (path: string) => {
              await openProject(path)
              setLocalEffects(null)
              setHasUnsavedChanges(false)
              setLastSavedAt(useProjectStore.getState().currentProject?.modifiedAt || null)

              // Calculate and set optimal zoom for the opened project
              const project = useProjectStore.getState().currentProject
              if (project) {
                const viewportWidth = window.innerWidth
                const optimalZoom = TimelineUtils.calculateOptimalZoom(project.timeline.duration, viewportWidth)
                useProjectStore.getState().setAutoZoom(optimalZoom)
              }
            }}
            onBackToLibrary={() => {
              // Clean up resources and navigate back to library
              const cleanupAndReturn = () => {
                // Clean up local state
                setLocalEffects(null)
                setHasUnsavedChanges(false)

                // Clean up stores
                useProjectStore.getState().cleanupProject()
                useWorkspaceStore.getState().resetWorkspace()

                // Clean up thumbnail generator cache
                ThumbnailGenerator.clearCache()

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
                localEffects={localEffects || playheadEffects}
                onTimeUpdate={(time) => storeSeek(time)}
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
                  effects={localEffects || playheadEffects || []}
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
              localEffects={localEffects}
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
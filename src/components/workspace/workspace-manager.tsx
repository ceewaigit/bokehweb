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
import type { ClipEffects, ZoomBlock } from '@/types/project'
import { DEFAULT_CLIP_EFFECTS, SCREEN_STUDIO_CLIP_EFFECTS } from '@/lib/constants/clip-defaults'
import { ZoomDetector } from '@/lib/effects/utils/zoom-detector'

// Extract project loading logic to reduce component complexity
async function loadProjectRecording(
  recording: any,
  setIsLoading: (loading: boolean) => void,
  setLoadingMessage: (message: string) => void,
  newProject: (name: string) => void
) {
  if (!recording.isProject || !recording.project) {
    alert('This video file does not have an associated project. Please load a .screencast project file instead.')
    return false
  }

  const project = recording.project

  // DEBUG: Log complete project metadata
  console.log('📋 === PROJECT METADATA (Workspace) ===')
  console.log('Project ID:', project.id)
  console.log('Project Name:', project.name)
  console.log('Project Path:', recording.path)
  console.log('Total Recordings:', project.recordings?.length || 0)

  if (project.recordings && project.recordings.length > 0) {
    project.recordings.forEach((rec: any, index: number) => {
      console.log(`\n📹 Recording ${index}:`)
      console.log('  - ID:', rec.id)
      console.log('  - Video Path:', rec.filePath || rec.videoPath)
      console.log('  - Duration:', rec.duration, 'ms')
      console.log('  - Video Dimensions:', rec.width || rec.videoWidth, 'x', rec.height || rec.videoHeight)
      console.log('  - Source Bounds:', rec.sourceBounds)
      console.log('  - Capture Area:', rec.captureArea)

      if (rec.metadata && rec.metadata.length > 0) {
        console.log('  - Metadata Events:', rec.metadata.length)
        console.log('  - First Event:', rec.metadata[0])

        // Find unique capture dimensions
        const captureWidths = Array.from(new Set(rec.metadata.map((m: any) => m.captureWidth).filter(Boolean)))
        const captureHeights = Array.from(new Set(rec.metadata.map((m: any) => m.captureHeight).filter(Boolean)))
        console.log('  - Capture Widths found:', captureWidths)
        console.log('  - Capture Heights found:', captureHeights)

        // Check for events with sourceBounds
        const eventsWithBounds = rec.metadata.filter((m: any) => m.sourceBounds).length
        console.log('  - Events with sourceBounds:', eventsWithBounds)
      }
    })
  }
  console.log('📋 === END PROJECT METADATA ===\n')

  setLoadingMessage('Creating project...')
  newProject(project.name)

  // Get project directory for resolving relative paths
  const projectDir = recording.path.substring(0, recording.path.lastIndexOf('/'))

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

  // Set the project ONCE after all recordings are processed
  useProjectStore.getState().setProject(project)

  const firstClip = project.timeline.tracks
    .flatMap((t: any) => t.clips)
    .sort((a: any, b: any) => a.startTime - b.startTime)[0]
  if (firstClip) {
    useProjectStore.getState().selectClip(firstClip.id)
  }

  return true
}

// Initialize default wallpaper on app startup
async function initializeDefaultWallpaper() {
  console.log('🖼️ Initializing default wallpaper...')
  if (!window.electronAPI?.loadWallpaperImage) {
    console.warn('❌ loadWallpaperImage API not available')
    return
  }

  try {
    console.log('📥 Loading Sonoma wallpaper...')
    const dataUrl = await window.electronAPI.loadWallpaperImage('/System/Library/Desktop Pictures/Sonoma.heic')
    if (dataUrl) {
      console.log('✅ Wallpaper loaded successfully')
      // Update the defaults for new clips
      DEFAULT_CLIP_EFFECTS.background.wallpaper = dataUrl
      DEFAULT_CLIP_EFFECTS.background.type = 'wallpaper'
      SCREEN_STUDIO_CLIP_EFFECTS.background.wallpaper = dataUrl
      SCREEN_STUDIO_CLIP_EFFECTS.background.type = 'wallpaper'

      // Update ALL existing clips that don't have a custom wallpaper or image
      const project = useProjectStore.getState().currentProject
      if (project) {
        let updated = false
        project.timeline.tracks.forEach(track => {
          track.clips.forEach(clip => {
            if (clip.effects?.background &&
              !clip.effects.background.wallpaper &&
              !clip.effects.background.image) {
              console.log('🔄 Updating clip background to wallpaper')
              clip.effects.background.wallpaper = dataUrl
              clip.effects.background.type = 'wallpaper'
              updated = true
            }
          })
        })
        if (updated) {
          console.log('💾 Saving project with wallpaper updates')
          useProjectStore.getState().setProject(project)
        }
      } else {
        console.log('📋 No current project to update')
      }
    }
  } catch (error) {
    console.error('Failed to load default wallpaper:', error)
  }
}

export function WorkspaceManager() {
  const [wallpaperInitialized, setWallpaperInitialized] = useState(false)
  const [defaultWallpaperUrl, setDefaultWallpaperUrl] = useState<string | null>(null)
  
  // Store hooks - will gradually reduce direct store access
  const {
    currentProject,
    newProject,
    selectedClipId,
    selectedEffectLayer,
    currentTime,
    isPlaying,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    selectClip,
    updateClipEffects,
    saveCurrentProject,
    openProject,
    setZoom,
    zoom
  } = useProjectStore()
  
  // Initialize default wallpaper once on mount
  useEffect(() => {
    initializeDefaultWallpaper().then(() => {
      setWallpaperInitialized(true)
      // Store the wallpaper URL for later use
      setDefaultWallpaperUrl(DEFAULT_CLIP_EFFECTS.background.wallpaper || null)
    })
  }, [])
  
  // Apply wallpaper to clips when project changes
  useEffect(() => {
    if (currentProject && defaultWallpaperUrl) {
      let updated = false
      currentProject.timeline.tracks.forEach(track => {
        track.clips.forEach(clip => {
          if (clip.effects?.background &&
            !clip.effects.background.wallpaper &&
            !clip.effects.background.image) {
            clip.effects.background.wallpaper = defaultWallpaperUrl
            clip.effects.background.type = 'wallpaper'
            updated = true
          }
        })
      })
      if (updated) {
        // Force update through store
        useProjectStore.getState().setProject(currentProject)
      }
    }
  }, [currentProject?.id, defaultWallpaperUrl])

  const {
    isPropertiesOpen,
    isExportOpen,
    propertiesPanelWidth,
    toggleProperties,
    setExportOpen
  } = useWorkspaceStore()


  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const [localEffects, setLocalEffects] = useState<ClipEffects | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Get selected clip first (needed for handleZoomBlockUpdate)
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null

  // Handle zoom block updates for local state
  const handleZoomBlockUpdate = useCallback((_clipId: string, blockId: string, updates: Partial<ZoomBlock>) => {
    const currentEffects = localEffects || selectedClip?.effects || DEFAULT_CLIP_EFFECTS
    const currentZoom = currentEffects.zoom

    // Validate the update doesn't cause overlaps
    const blockToUpdate = currentZoom.blocks.find((b: ZoomBlock) => b.id === blockId)
    if (!blockToUpdate) return

    const newStartTime = updates.startTime ?? blockToUpdate.startTime
    const newEndTime = updates.endTime ?? blockToUpdate.endTime

    // Check for overlaps with other blocks
    const hasOverlap = currentZoom.blocks.some((block: ZoomBlock) => {
      if (block.id === blockId) return false
      return newStartTime < block.endTime && newEndTime > block.startTime
    })

    // If there's an overlap, don't apply the update
    if (hasOverlap) {
      // Zoom block would cause overlap, reject update
      return
    }

    const updatedBlocks = currentZoom.blocks.map((block: ZoomBlock) =>
      block.id === blockId ? { ...block, ...updates } : block
    )

    const newEffects: ClipEffects = {
      ...currentEffects,
      zoom: {
        ...currentZoom,
        enabled: updatedBlocks.length > 0, // Enable zoom when blocks exist
        blocks: updatedBlocks
      }
    }

    setLocalEffects(newEffects)
    setHasUnsavedChanges(true)
  }, [localEffects, selectedClip?.effects])

  // Playback control ref
  const playbackIntervalRef = useRef<NodeJS.Timeout>()

  const selectedRecording = selectedClip && currentProject
    ? currentProject.recordings.find(r => r.id === selectedClip.recordingId)
    : null

  const activeEffects = localEffects || selectedClip?.effects

  // Define handlePause first since it's used in useEffect
  const handlePause = useCallback(() => {
    storePause()
  }, [storePause])

  // Monitor clip boundaries during playback
  useEffect(() => {
    if (!selectedClip || !isPlaying) return

    const syncInterval = setInterval(() => {
      if (!isPlaying) return

      const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
      const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
      const maxTime = selectedClip.sourceOut / 1000

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
  }, [isPlaying, currentTime, selectedClip, handlePause])


  // Video loading is already handled when the project is loaded
  // No need to duplicate the loading here

  // Centralized playback control
  const handlePlay = useCallback(() => {
    if (!selectedClip || !selectedRecording) return
    storePlay()
  }, [selectedClip, selectedRecording, storePlay])

  const handleSeek = useCallback((time: number) => {
    storeSeek(time)
  }, [storeSeek])

  const handleClipSelect = useCallback((clipId: string) => {
    setLocalEffects(null)
    setHasUnsavedChanges(false)
    selectClip(clipId)
  }, [selectClip])

  const handleEffectChange = useCallback((effects: ClipEffects) => {
    if (selectedClipId) {
      // Handle zoom regeneration request
      if (effects.zoom?.regenerate && selectedRecording) {
        // Use ZoomDetector to regenerate zoom blocks
        const zoomDetector = new ZoomDetector()
        const newZoomBlocks = zoomDetector.detectZoomBlocks(
          selectedRecording.metadata?.mouseEvents || [],
          selectedRecording.width || 1920,
          selectedRecording.height || 1080,
          selectedRecording.duration
        )

        effects = {
          ...effects,
          zoom: {
            ...effects.zoom,
            blocks: newZoomBlocks,
            regenerate: undefined
          }
        }
      }

      // Store effects locally instead of saving immediately
      setLocalEffects(effects)
      setHasUnsavedChanges(true)

    }
  }, [selectedClipId, selectedRecording])

  const handleToggleProperties = useCallback(() => {
    toggleProperties()
  }, [toggleProperties])

  const handleExport = useCallback(() => {
    setExportOpen(true)
  }, [setExportOpen])

  const handleCloseExport = useCallback(() => {
    setExportOpen(false)
  }, [setExportOpen])


  // Show loading screen when processing
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
        <div className="text-center space-y-6">
          {/* Animated logo or spinner */}
          <div className="relative">
            <div className="w-24 h-24 border-4 border-primary/20 rounded-full animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-t-primary border-r-primary border-b-transparent border-l-transparent rounded-full animate-spin" />
            </div>
          </div>

          {/* Loading message */}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{loadingMessage}</h3>
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
    // Show loading while wallpaper initializes
    if (!wallpaperInitialized) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-card border border-border animate-pulse mb-4" />
            <p className="text-xs text-muted-foreground">Initializing workspace...</p>
          </div>
        </div>
      )
    }
    
    return (
      <>
        <div className="fixed inset-0 flex flex-col bg-background">
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
                  newProject
                )

                if (!success) {
                  setIsLoading(false)
                  setLoadingMessage('')
                  return
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
        <div className="flex-shrink-0 border-b bg-card/50 overflow-hidden" style={{ height: '48px', paddingLeft: '80px' }}>
          <Toolbar
            project={currentProject}
            onToggleProperties={handleToggleProperties}
            onExport={handleExport}
            onNewProject={() => {
              // Clean up current project resources
              globalBlobManager.cleanupByType('video')
              globalBlobManager.cleanupByType('export')

              newProject('New Project')
              setLocalEffects(null)
              setHasUnsavedChanges(false)
            }}
            onSaveProject={async () => {
              if (localEffects && selectedClipId) {
                updateClipEffects(selectedClipId, localEffects)
                setLocalEffects(null)
              }
              await saveCurrentProject()
              setHasUnsavedChanges(false)
            }}
            onOpenProject={async (path: string) => {
              await openProject(path)
              setLocalEffects(null)
              setHasUnsavedChanges(false)
            }}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>

        {/* Main Content Area - Use remaining height */}
        <div className="flex flex-col" style={{ height: 'calc(100vh - 48px)' }}>
          {/* Top Section - Preview and Sidebar (60% height) */}
          <div className="flex" style={{ height: '60%' }}>
            {/* Preview Area */}
            <div className="bg-background border-b overflow-hidden" style={{ width: isPropertiesOpen ? `calc(100vw - ${propertiesPanelWidth}px)` : '100vw' }}>
              <PreviewAreaRemotion
                selectedClip={selectedClip}
                selectedRecording={selectedRecording}
                currentTime={currentTime}
                isPlaying={isPlaying}
                localEffects={localEffects}
                onTimeUpdate={(time) => storeSeek(time)}
              />
            </div>

            {/* Properties Panel - Fixed width when open, same height as preview */}
            {isPropertiesOpen && (
              <div
                className="bg-card border-l overflow-hidden"
                style={{ width: `${propertiesPanelWidth}px` }}
              >
                <EffectsSidebar
                  className="h-full w-full"
                  selectedClip={selectedClip}
                  effects={activeEffects || selectedClip?.effects}
                  selectedEffectLayer={selectedEffectLayer}
                  onEffectChange={handleEffectChange}
                />
              </div>
            )}
          </div>

          {/* Timeline Section - Full width at bottom (40% height) */}
          <div className="bg-card/50 overflow-hidden" style={{ height: '40%', width: '100vw' }}>
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
          onClose={handleCloseExport}
        />
      </div>

    </>
  )
}
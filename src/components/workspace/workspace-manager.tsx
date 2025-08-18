"use client"

import { useCallback, useEffect, useState, useRef } from 'react'
import { Toolbar } from '../toolbar'
import { PreviewArea } from '../preview-area'
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
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import type { Clip, ClipEffects, ZoomBlock } from '@/types/project'
import { DEFAULT_CLIP_EFFECTS } from '@/lib/constants/clip-defaults'

export function WorkspaceManager() {
  // Store hooks - will gradually reduce direct store access
  const {
    currentProject,
    newProject,
    selectedClipId,
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

  const {
    isPropertiesOpen,
    isExportOpen,
    propertiesPanelWidth,
    timelineHeight,
    toggleProperties,
    setExportOpen
  } = useWorkspaceStore()


  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const [isMounted, setIsMounted] = useState(false)
  const [localEffects, setLocalEffects] = useState<ClipEffects | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Get selected clip first (needed for handleZoomBlockUpdate)
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null

  // Handle zoom block updates for local state
  const handleZoomBlockUpdate = useCallback((clipId: string, blockId: string, updates: Partial<ZoomBlock>) => {
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

    // Sync with effects engine immediately for real-time preview
    if (effectsEngineRef.current && newEffects.zoom.enabled) {
      effectsEngineRef.current.setZoomEffects(updatedBlocks)
    }
  }, [localEffects, selectedClip?.effects])

  // Centralized refs for video and rendering
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null)
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const [cursorRenderer, setCursorRenderer] = useState<CursorRenderer | null>(null)
  // Initialize background renderer immediately
  const backgroundRendererRef = useRef<BackgroundRenderer | null>(new BackgroundRenderer())
  const playbackIntervalRef = useRef<NodeJS.Timeout>()
  const prevEffectsRef = useRef<ClipEffects | undefined>()

  const selectedRecording = selectedClip && currentProject
    ? currentProject.recordings.find(r => r.id === selectedClip.recordingId)
    : null

  // Use local effects if available, otherwise use saved effects
  const activeEffects = localEffects || selectedClip?.effects

  // Define handlePause first since it's used in useEffect
  const handlePause = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
    }
    storePause()
  }, [storePause])

  // Sync video playback with timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video || !selectedClip || !isPlaying) return

    // Update video time continuously during playback
    const syncInterval = setInterval(() => {
      if (!isPlaying || !video) return

      // Don't try to play if video isn't ready
      if (video.readyState < 2) return

      const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
      const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
      const maxTime = selectedClip.sourceOut / 1000

      if (sourceTime <= maxTime) {
        // Larger tolerance for sync to avoid constant seeking (0.5s instead of 0.1s)
        // This prevents the video decoder from constantly resetting
        if (Math.abs(video.currentTime - sourceTime) > 0.5) {
          video.currentTime = sourceTime
        }

        // Ensure video is playing (but not if it has ended)
        if (video.paused && !video.ended) {
          video.play().catch(() => {
            // Ignore play failures during sync
          })
        }
      } else {
        // Reached end of clip
        handlePause()
      }
    }, 100) // Sync every 100ms

    playbackIntervalRef.current = syncInterval

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
    }
  }, [isPlaying, currentTime, selectedClip, handlePause])

  // Removed video monitoring - handled in loadVideo function

  // Initialize effects when recording and clip change
  const initializeEffects = useCallback((forceFullInit = false) => {
    if (!selectedRecording || !videoRef.current) return

    const clipEffects = activeEffects || selectedClip?.effects
    const prevEffects = prevEffectsRef.current

    // Initialize effects engine if needed
    if (!effectsEngineRef.current || forceFullInit) {
      effectsEngineRef.current = new EffectsEngine()
      effectsEngineRef.current.initializeFromRecording(selectedRecording)
    }

    // Sync zoom blocks with effects engine
    if (clipEffects?.zoom?.enabled && clipEffects.zoom.blocks) {
      effectsEngineRef.current.setZoomEffects(clipEffects.zoom.blocks)
    } else if (!clipEffects?.zoom?.enabled) {
      // Clear zoom effects if zoom is disabled
      effectsEngineRef.current.clearEffects()
    }

    // Only reinitialize cursor if cursor settings changed or force init
    const cursorChanged = forceFullInit ||
      prevEffects?.cursor?.visible !== clipEffects?.cursor?.visible ||
      prevEffects?.cursor?.size !== clipEffects?.cursor?.size ||
      prevEffects?.cursor?.color !== clipEffects?.cursor?.color

    if (cursorChanged) {
      // Clean up previous cursor renderer
      if (cursorRenderer) {
        cursorRenderer.dispose()
        setCursorRenderer(null)
      }

      // Initialize cursor renderer
      if (clipEffects?.cursor?.visible && selectedRecording.metadata?.mouseEvents) {
        const newCursorRenderer = new CursorRenderer({
          size: clipEffects.cursor.size,
          clickColor: '#007AFF',
          smoothing: true
        })

        // Convert metadata format for cursor renderer
        const videoWidth = videoRef.current.videoWidth
        const videoHeight = videoRef.current.videoHeight

        const cursorEvents = selectedRecording.metadata.mouseEvents.map((e: any) => ({
          ...e,
          // Pass raw coordinates - cursor renderer will handle scaling
          mouseX: e.x,
          mouseY: e.y,
          eventType: 'mouse' as const,
          screenWidth: e.screenWidth,
          screenHeight: e.screenHeight
        }))

        // Pass video dimensions for proper normalization
        // The cursor positions are relative to the actual video content
        newCursorRenderer.setVideoDimensions(videoWidth, videoHeight)

        // Pass effects engine for zoom support
        if (effectsEngineRef.current) {
          newCursorRenderer.setEffectsEngine(effectsEngineRef.current)
        }

        // Just attach the video, don't manage the canvas DOM
        // Let preview-area handle canvas positioning since it knows the actual padding/dimensions
        newCursorRenderer.attachToVideo(
          videoRef.current,
          cursorEvents
        )
        
        // Set the state to trigger re-render
        setCursorRenderer(newCursorRenderer)
      }
    }

    // Background renderer is already initialized in useRef

    // Store current effects for next comparison
    prevEffectsRef.current = clipEffects
  }, [selectedRecording, activeEffects])

  // Track when component is mounted
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Load video when recording changes and component is mounted
  useEffect(() => {
    if (!selectedRecording || !isMounted) {
      // Waiting for mount or recording
      return
    }

    // Check if video is already loaded with the correct source
    const video = videoRef.current
    if (video && video.src && video.readyState >= 2) {
      // Video already loaded, just initialize effects
      initializeEffects(true)
      return
    }

    const loadVideo = async () => {
      // Try multiple times to get the video element
      let attempts = 0;
      const maxAttempts = 10;

      const tryGetVideo = async () => {
        const video = videoRef.current;

        if (!video && attempts < maxAttempts) {
          attempts++;
          // Waiting for video element...
          await new Promise(resolve => setTimeout(resolve, 100));
          return tryGetVideo();
        }

        if (!video) return;

        return video;
      }

      const video = await tryGetVideo();
      if (!video) return;

      // Loading video for recording

      if (!selectedRecording.filePath) return

      const blobUrl = await globalBlobManager.ensureVideoLoaded(
        selectedRecording.id,
        selectedRecording.filePath
      )

      if (blobUrl) {
        // Got blob URL, setting on video element

        // Ensure video element is in DOM
        if (!video.isConnected) return

        video.src = blobUrl
        video.load()

        // Initialize effects after video is loaded
        video.addEventListener('loadedmetadata', () => {
          initializeEffects(true)
        }, { once: true })
      }
    }

    loadVideo()
  }, [selectedRecording?.id, selectedRecording?.filePath, initializeEffects, isMounted])

  // Re-initialize effects when active effects change
  useEffect(() => {
    if (selectedRecording && videoRef.current && videoRef.current.readyState >= 2) {
      // Don't force full init, only update what changed
      initializeEffects(false)

      // Update video position if cursor renderer exists
      if (cursorRenderer && canvasRef.current && canvasRef.current.width > 300) {
          const padding = activeEffects?.background?.padding || 80
          const videoWidth = videoRef.current?.videoWidth || 1920
          const videoHeight = videoRef.current?.videoHeight || 1080
          const videoAspect = videoWidth / videoHeight
          const availableWidth = canvasRef.current.width - (padding * 2)
          const availableHeight = canvasRef.current.height - (padding * 2)
          const availableAspect = availableWidth / availableHeight

          let drawWidth, drawHeight, offsetX, offsetY

          if (videoAspect > availableAspect) {
            drawWidth = availableWidth
            drawHeight = availableWidth / videoAspect
            offsetX = padding
            offsetY = padding + (availableHeight - drawHeight) / 2
          } else {
            drawHeight = availableHeight
            drawWidth = availableHeight * videoAspect
            offsetX = padding + (availableWidth - drawWidth) / 2
            offsetY = padding
          }

          cursorRenderer.updateVideoPosition(offsetX, offsetY, drawWidth, drawHeight)
      }
    }
  }, [activeEffects, initializeEffects, selectedRecording])


  // Cleanup effects on unmount
  useEffect(() => {
    return () => {
      if (cursorRenderer) {
        cursorRenderer.dispose()
      }
      if (backgroundRendererRef.current) {
        backgroundRendererRef.current.dispose()
      }
    }
  }, [])

  // Debug: Track project changes
  useEffect(() => {
    // Project changed
  }, [currentProject])

  // Centralized playback control
  const handlePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || !selectedClip || !selectedRecording) return

    // Check if video is ready
    if (video.readyState < 2) { // HAVE_CURRENT_DATA
      // Video not ready, waiting for load

      // Wait for video to be ready, then play
      const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay)

        // Map timeline time to video time
        const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
        const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
        video.currentTime = sourceTime

        video.play().then(() => {
          storePlay()
        }).catch(() => {
          storePause()
        })
      }

      video.addEventListener('canplay', handleCanPlay)
      return
    }

    // Video is ready, play immediately
    const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
    const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000

    // Set video time and play
    video.currentTime = sourceTime
    video.play().then(() => {
      storePlay()
    }).catch(() => {
      storePause()
    })
  }, [selectedClip, selectedRecording, currentTime, storePlay, storePause])

  const handleSeek = useCallback((time: number) => {
    storeSeek(time)

    // Update video position if we have one
    const video = videoRef.current
    if (video && selectedClip) {
      const clipProgress = Math.max(0, time - selectedClip.startTime)
      const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
      const minTime = selectedClip.sourceIn / 1000
      const maxTime = selectedClip.sourceOut / 1000
      video.currentTime = Math.min(Math.max(sourceTime, minTime), maxTime)
    }
  }, [storeSeek, selectedClip])

  const handleClipSelect = useCallback((clipId: string) => {
    // Reset local effects when switching clips
    setLocalEffects(null)
    setHasUnsavedChanges(false)

    selectClip(clipId)
  }, [selectClip])

  const handleEffectChange = useCallback((effects: ClipEffects) => {
    if (selectedClipId) {
      // Store effects locally instead of saving immediately
      setLocalEffects(effects)
      setHasUnsavedChanges(true)

      // Sync zoom effects with engine for real-time preview
      if (effectsEngineRef.current) {
        if (effects.zoom?.enabled && effects.zoom.blocks) {
          effectsEngineRef.current.setZoomEffects(effects.zoom.blocks)
        } else {
          effectsEngineRef.current.clearEffects()
        }
      }

      // Don't update backgroundRenderer here - let preview-area handle it
      // Just trigger a re-render
      if (canvasRef.current) {
        // Trigger a render by calling renderFrame through preview area
        const event = new CustomEvent('forceRender')
        canvasRef.current.dispatchEvent(event)
      }
    }
  }, [selectedClipId])

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
    // Showing recordings library
    return (
      <>
        <div className="fixed inset-0 flex flex-col bg-background">
          <RecordingsLibrary
            onSelectRecording={async (recording) => {
              // Selected recording

              // Start loading
              setIsLoading(true)
              setLoadingMessage('Loading recording...')

              try {
                // Check if it's a project file
                if (recording.isProject && recording.project) {
                  const project = recording.project
                  // Loading project

                  setLoadingMessage('Creating project...')
                  // Create a new timeline project
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
                        // Resolved video path

                        // Verify and fix recording duration if needed
                        if (!rec.duration || rec.duration <= 0 || !isFinite(rec.duration)) {
                          setLoadingMessage('Detecting video duration...')
                          // Recording has invalid duration, detecting from video

                          // Use blob manager to load the video safely
                          const blobUrl = await globalBlobManager.loadVideo(rec.id, videoPath)

                          if (blobUrl) {
                            const tempVideo = document.createElement('video')
                            tempVideo.src = blobUrl

                            await new Promise<void>((resolve) => {
                              tempVideo.addEventListener('loadedmetadata', () => {
                                // Checking project video duration

                                if (tempVideo.duration > 0 && isFinite(tempVideo.duration)) {
                                  rec.duration = tempVideo.duration * 1000
                                  // Fixed recording duration
                                } else {
                                  // Could not determine video duration
                                }
                                resolve()
                              }, { once: true })

                              tempVideo.addEventListener('error', () => {
                                // Failed to load video for duration check
                                resolve()
                              }, { once: true })

                              tempVideo.load()
                            })

                            tempVideo.remove()
                          } else {
                            console.error('Failed to load video for duration check')
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

                          // Metadata loaded successfully
                        }
                      } catch (error) {
                        // Failed to load recording from project
                      }
                    }
                  }

                  // Set the project ONCE after all recordings are processed
                  useProjectStore.getState().setProject(project)

                  // Auto-select the first clip if available
                  const firstClip = project.timeline.tracks
                    .flatMap(t => t.clips)
                    .sort((a, b) => a.startTime - b.startTime)[0]
                  if (firstClip) {
                    // Auto-selecting first clip
                    useProjectStore.getState().selectClip(firstClip.id)
                  }
                } else {
                  // Raw video files without project metadata are not supported
                  alert('This video file does not have an associated project. Please load a .screencast project file instead.')
                  setIsLoading(false)
                  setLoadingMessage('')
                  return
                }

                // Hide loading screen after everything is loaded
                setIsLoading(false)

              } catch (error) {
                // Failed to load recording
                setIsLoading(false)
                // Optionally show an error message
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
        {/* Top Toolbar - 8vh height */}
        <div className="flex-shrink-0 border-b bg-card/50 overflow-hidden" style={{ height: '8vh', minHeight: '56px' }}>
          <Toolbar
            project={currentProject}
            onToggleProperties={handleToggleProperties}
            onExport={handleExport}
            onNewProject={() => {
              newProject('New Project')
              setLocalEffects(null)
              setHasUnsavedChanges(false)
            }}
            onSaveProject={async () => {
              // Apply local effects before saving
              if (localEffects && selectedClipId) {
                updateClipEffects(selectedClipId, localEffects)
                // Clear local effects after applying to avoid double updates
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

        {/* Main Content Area - 92vh height */}
        <div className="flex" style={{ height: '92vh' }}>
          {/* Main Editor Section */}
          <div className="flex flex-col" style={{ width: isPropertiesOpen ? `calc(100vw - ${propertiesPanelWidth}px)` : '100vw' }}>
            {/* Preview Area - 55vh height */}
            <div className="bg-background border-b overflow-hidden" style={{ height: '55vh' }}>
              <PreviewArea
                videoRef={videoRef}
                canvasRef={canvasRef}
                backgroundCanvasRef={backgroundCanvasRef}
                effectsEngine={effectsEngineRef.current}
                cursorRenderer={cursorRenderer}
                backgroundRenderer={backgroundRendererRef.current}
                selectedClip={selectedClip}
                selectedRecording={selectedRecording}
                currentTime={currentTime}
                isPlaying={isPlaying}
                localEffects={localEffects}
              />
            </div>

            {/* Timeline Section - 37vh height */}
            <div className="bg-card/50 overflow-hidden" style={{ height: '37vh' }}>
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

          {/* Properties Panel - Fixed width when open */}
          {isPropertiesOpen && (
            <div
              className="bg-card border-l overflow-hidden"
              style={{ width: `${propertiesPanelWidth}px`, height: '92vh' }}
            >
              <EffectsSidebar
                className="h-full w-full"
                selectedClip={selectedClip}
                effects={activeEffects || selectedClip?.effects}
                onEffectChange={handleEffectChange}
              />
            </div>
          )}
        </div>

        {/* Dialogs and Modals */}
        <ExportDialog
          isOpen={isExportOpen}
          onClose={handleCloseExport}
        />
      </div>

      {/* Hidden video element for playback control - must be OUTSIDE and ALWAYS present */}
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          left: '-9999px',
          top: '-9999px',
          visibility: 'hidden'
        }}
        muted
        playsInline
        crossOrigin="anonymous"
        preload="auto"
      />
    </>
  )
}
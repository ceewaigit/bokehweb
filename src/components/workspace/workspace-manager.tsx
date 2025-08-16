"use client"

import { useCallback, useEffect, useState, useRef } from 'react'
// Recording logic handled by RecordingController component
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
import { RecordingController } from './recording-controller'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import type { Clip, ClipEffects } from '@/types/project'

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
  
  // Centralized refs for video and rendering
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const cursorRendererRef = useRef<CursorRenderer | null>(null)
  const backgroundRendererRef = useRef<BackgroundRenderer | null>(null)
  const animationFrameRef = useRef<number>()
  const playbackIntervalRef = useRef<NodeJS.Timeout>()
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  
  // Get selected clip and recording
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null
  
  const selectedRecording = selectedClip && currentProject
    ? currentProject.recordings.find(r => r.id === selectedClip.recordingId)
    : null

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
      if (video.readyState < 2) {
        console.log('Video not ready during sync, skipping...')
        return
      }
      
      const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
      const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
      const maxTime = selectedClip.sourceOut / 1000
      
      if (sourceTime <= maxTime) {
        // Small tolerance for sync
        if (Math.abs(video.currentTime - sourceTime) > 0.1) {
          video.currentTime = sourceTime
        }
        
        // Ensure video is playing
        if (video.paused) {
          video.play().catch(error => {
            console.error('Failed to resume video during sync:', error)
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

  // Monitor video loading state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      console.log('Video loaded and ready:', {
        duration: video.duration,
        dimensions: `${video.videoWidth}x${video.videoHeight}`,
        readyState: video.readyState
      })
    }

    const handleError = (e: Event) => {
      console.error('Video error:', e)
      const videoError = video.error
      if (videoError) {
        console.error('Video error details:', {
          code: videoError.code,
          message: videoError.message
        })
      }
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('error', handleError)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
    }
  }, [])

  // Initialize effects when recording and clip change
  const initializeEffects = useCallback(() => {
    if (!selectedRecording || !videoRef.current) return

    // Initialize effects engine
    if (!effectsEngineRef.current) {
      effectsEngineRef.current = new EffectsEngine()
    }
    effectsEngineRef.current.initializeFromRecording(selectedRecording)

    // Clean up previous cursor renderer
    if (cursorCanvasRef.current) {
      cursorCanvasRef.current.remove()
      cursorCanvasRef.current = null
    }
    if (cursorRendererRef.current) {
      cursorRendererRef.current.dispose()
      cursorRendererRef.current = null
    }

    // Initialize cursor renderer
    const clipEffects = selectedClip?.effects
    const showCursor = clipEffects?.cursor?.visible ?? true

    if (showCursor && selectedRecording.metadata?.mouseEvents) {
      cursorRendererRef.current = new CursorRenderer({
        size: clipEffects?.cursor?.size ?? 1.5,
        color: clipEffects?.cursor?.color ?? '#000000',
        clickColor: '#007AFF',
        smoothing: true
      })

      // Convert metadata format for cursor renderer
      const cursorEvents = selectedRecording.metadata.mouseEvents.map((e: any) => ({
        ...e,
        mouseX: e.x,
        mouseY: e.y,
        eventType: 'mouse' as const
      }))

      const cursorCanvas = cursorRendererRef.current.attachToVideo(
        videoRef.current,
        cursorEvents
      )

      if (cursorCanvas && canvasRef.current?.parentElement) {
        cursorCanvas.style.position = 'absolute'
        cursorCanvas.style.top = '0'
        cursorCanvas.style.left = '0'
        cursorCanvas.style.width = '100%'
        cursorCanvas.style.height = '100%'
        cursorCanvas.style.pointerEvents = 'none'
        cursorCanvas.style.zIndex = '10'
        canvasRef.current.parentElement.appendChild(cursorCanvas)
        cursorCanvasRef.current = cursorCanvas
      }
    }

    // Initialize background renderer
    if (!backgroundRendererRef.current) {
      backgroundRendererRef.current = new BackgroundRenderer()
    }
  }, [selectedRecording, selectedClip?.effects])

  // Track when component is mounted
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Load video when recording changes and component is mounted
  useEffect(() => {
    if (!selectedRecording || !isMounted) {
      console.log('Waiting for mount or recording:', { 
        mounted: isMounted, 
        hasRecording: !!selectedRecording 
      })
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
          console.log(`Waiting for video element... attempt ${attempts}/${maxAttempts}`);
          await new Promise(resolve => setTimeout(resolve, 100));
          return tryGetVideo();
        }
        
        if (!video) {
          console.error('Video element not found after multiple attempts!', {
            videoRef: videoRef,
            recording: selectedRecording?.id,
            isMounted: isMounted,
            attempts: attempts
          })
          return;
        }
        
        return video;
      }
      
      const video = await tryGetVideo();
      if (!video) return;
      
      console.log('Loading video for recording:', {
        id: selectedRecording.id,
        filePath: selectedRecording.filePath,
        videoElement: !!video
      })
      
      if (!selectedRecording.filePath) {
        console.error('Recording has no filePath:', selectedRecording)
        return
      }
      
      const blobUrl = await globalBlobManager.ensureVideoLoaded(
        selectedRecording.id, 
        selectedRecording.filePath
      )
      
      if (blobUrl) {
        console.log('Got blob URL, setting on video element:', blobUrl)
        console.log('Video element before setting src:', {
          currentSrc: video.src,
          readyState: video.readyState,
          videoElement: video,
          isConnected: video.isConnected
        })
        
        // Ensure video element is in DOM
        if (!video.isConnected) {
          console.error('Video element is not connected to DOM!')
          return
        }
        
        video.src = blobUrl
        video.load()
        
        // Check after setting with a small delay
        setTimeout(() => {
          console.log('Video element after setting src (delayed check):', {
            newSrc: video.src,
            readyState: video.readyState,
            error: video.error,
            networkState: video.networkState,
            currentSrc: video.currentSrc
          })
        }, 100)
        
        // Initialize effects after video is loaded
        video.addEventListener('loadedmetadata', () => {
          console.log('Video metadata loaded, initializing effects')
          initializeEffects()
        }, { once: true })
      } else {
        console.error('Failed to get blob URL for:', selectedRecording.id)
      }
    }

    loadVideo()
  }, [selectedRecording?.id, selectedRecording?.filePath, initializeEffects, isMounted])

  // Re-initialize effects when clip effects change
  useEffect(() => {
    if (selectedRecording && videoRef.current && videoRef.current.readyState >= 2) {
      initializeEffects()
    }
  }, [selectedClip?.effects, initializeEffects])

  // Cleanup effects on unmount
  useEffect(() => {
    return () => {
      if (cursorCanvasRef.current) {
        cursorCanvasRef.current.remove()
      }
      if (cursorRendererRef.current) {
        cursorRendererRef.current.dispose()
      }
      if (backgroundRendererRef.current) {
        backgroundRendererRef.current.dispose()
      }
    }
  }, [])

  // Debug: Track project changes
  useEffect(() => {
    console.log('🔍 WorkspaceManager: Project changed:', currentProject?.name || 'null')
  }, [currentProject])

  // Centralized playback control
  const handlePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || !selectedClip || !selectedRecording) {
      console.warn('Cannot play: missing video, clip, or recording')
      return
    }

    // Check if video is ready
    if (video.readyState < 2) { // HAVE_CURRENT_DATA
      console.log('Video not ready, waiting for load...')
      
      // Wait for video to be ready, then play
      const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay)
        
        // Map timeline time to video time
        const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
        const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
        video.currentTime = sourceTime
        
        video.play().then(() => {
          storePlay() // Update store state
        }).catch(error => {
          console.error('Failed to play video:', error)
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
      storePlay() // Update store state
    }).catch(error => {
      console.error('Failed to play video:', error)
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
    selectClip(clipId)
  }, [selectClip])

  const handleEffectChange = useCallback((effects: ClipEffects) => {
    if (selectedClipId) {
      updateClipEffects(selectedClipId, effects)
    }
  }, [selectedClipId, updateClipEffects])

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
    console.log('🔍 WorkspaceManager: Showing recordings library')
    return (
      <>
        <div className="fixed inset-0 flex flex-col bg-background">
          <RecordingsLibrary
          onSelectRecording={async (recording) => {
            console.log('🔍 Selected recording:', recording.name)

            // Start loading
            setIsLoading(true)
            setLoadingMessage('Loading recording...')

            try {
              // Check if it's a project file
              if (recording.isProject && recording.project) {
                const project = recording.project
                console.log('📁 Loading project:', project.name)

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
                      console.log('Resolved video path:', videoPath)

                      // Verify and fix recording duration if needed
                      if (!rec.duration || rec.duration <= 0 || !isFinite(rec.duration)) {
                        setLoadingMessage('Detecting video duration...')
                        console.log('⚠️ Recording has invalid duration, detecting from video...')

                        // Use blob manager to load the video safely
                        const blobUrl = await globalBlobManager.loadVideo(rec.id, videoPath)

                        if (blobUrl) {
                          const tempVideo = document.createElement('video')
                          tempVideo.src = blobUrl

                          await new Promise<void>((resolve) => {
                            tempVideo.addEventListener('loadedmetadata', () => {
                              console.log('Checking project video duration:', tempVideo.duration)

                              if (tempVideo.duration > 0 && isFinite(tempVideo.duration)) {
                                rec.duration = tempVideo.duration * 1000
                                console.log('✅ Fixed recording duration:', rec.duration, 'ms')
                              } else {
                                console.error('❌ Could not determine video duration')
                              }
                              resolve()
                            }, { once: true })

                            tempVideo.addEventListener('error', () => {
                              console.error('Failed to load video for duration check')
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

                        if (rec.metadata) {
                          const totalEvents =
                            (rec.metadata.mouseEvents?.length || 0) +
                            (rec.metadata.clickEvents?.length || 0) +
                            (rec.metadata.keyboardEvents?.length || 0)
                          console.log(`✅ Loaded ${totalEvents} metadata events`)
                        }
                      }
                    } catch (error) {
                      console.error('Failed to load recording from project:', error)
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
                  console.log('🎯 Auto-selecting first clip:', firstClip.id)
                  useProjectStore.getState().selectClip(firstClip.id)
                }
              } else {
                // Raw video files without project metadata are not supported
                console.error('Cannot load raw video files without project metadata')
                alert('This video file does not have an associated project. Please load a .screencast project file instead.')
                setIsLoading(false)
                setLoadingMessage('')
                return
              }

              // Final setup message
              setLoadingMessage('Finalizing setup...')

              // Small delay to ensure everything is fully rendered
              await new Promise(resolve => setTimeout(resolve, 500))

              // Hide loading screen after everything is loaded
              setIsLoading(false)

            } catch (error) {
              console.error('Failed to load recording:', error)
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
            onNewProject={() => newProject('New Project')}
            onSaveProject={saveCurrentProject}
            onOpenProject={openProject}
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
                effectsEngine={effectsEngineRef.current}
                cursorRenderer={cursorRendererRef.current}
                backgroundRenderer={backgroundRendererRef.current}
                selectedClip={selectedClip}
                selectedRecording={selectedRecording}
                currentTime={currentTime}
                isPlaying={isPlaying}
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
                effects={selectedClip?.effects}
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
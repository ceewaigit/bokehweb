"use client"

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRecordingStore } from '@/stores/recording-store'
import { useProjectStore } from '@/stores/project-store'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { WorkAreaCropper } from '@/lib/effects/work-area-cropper'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Play, Pause, RotateCcw, Eye, EyeOff, SkipBack, SkipForward, MousePointer, ZoomIn, Crop } from 'lucide-react'

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRendererRef = useRef<CursorRenderer | null>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const workAreaCropperRef = useRef<WorkAreaCropper | null>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  const [showZoom, setShowZoom] = useState(true)
  const [showCrop, setShowCrop] = useState(true)
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const { currentProject, currentTime, isPlaying, play, pause, seek, selectedClipId, getCurrentClip, getCurrentRecording } = useProjectStore()
  const { isRecording } = useRecordingStore()

  // Get the current clip from project store
  const projectClip = getCurrentClip()
  const projectRecording = getCurrentRecording()

  // Create a simplified clip object for the preview
  const currentClip = projectClip ? {
    id: projectClip.id,
    source: RecordingStorage.getBlobUrl(projectClip.recordingId) || '',
    originalSource: ''
  } : null

  const hasEnhancements = currentClip?.originalSource && currentClip?.source !== currentClip?.originalSource

  // Get metadata - simplified!
  const getMetadata = useCallback(() => {
    if (!projectRecording?.metadata) return []
    
    // Convert to format expected by effects engine
    const metadata: any[] = []
    
    projectRecording.metadata.mouseEvents?.forEach(e => {
      metadata.push({
        timestamp: e.timestamp,
        mouseX: e.x,
        mouseY: e.y,
        windowWidth: e.screenWidth || projectRecording.width,
        windowHeight: e.screenHeight || projectRecording.height,
        eventType: 'mouse'
      })
    })
    
    projectRecording.metadata.clickEvents?.forEach(e => {
      metadata.push({
        timestamp: e.timestamp,
        mouseX: e.x,
        mouseY: e.y,
        windowWidth: projectRecording.width,
        windowHeight: projectRecording.height,
        eventType: 'click'
      })
    })
    
    return metadata
  }, [projectRecording])

  // Load video when clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) {
      setIsVideoLoaded(false)
      setVideoError(null)
      return
    }

    // Select which source to use
    const sourceUrl = showOriginal && currentClip.originalSource ? currentClip.originalSource : currentClip.source

    if (!sourceUrl) {
      setVideoError('No video source available')
      return
    }

    // Only update if source actually changed
    if (video.src === sourceUrl) {
      return
    }

    console.log('📹 Loading video:', sourceUrl.substring(0, 100))

    setIsVideoLoaded(false)
    setVideoError(null)

    // Load the new video source
    video.src = sourceUrl
    video.load()

    // Nudge playback briefly to force first frame render, then pause
    const onLoadedMeta = async () => {
      try {
        await video.play()
        // Seek to just after 0 to ensure a frame is available
        video.currentTime = 0.001
        await new Promise(r => setTimeout(r, 30))
        video.pause()
      } catch {
        // ignore autoplay errors
      }
    }
    video.addEventListener('loadedmetadata', onLoadedMeta, { once: true })

  }, [currentClip, showOriginal])

  // Set up work area cropper when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current || !projectRecording) {
      return
    }

    // Check if we have capture area info from the recording
    const captureArea = projectRecording.captureArea
    if (!captureArea || !showCrop) {
      // Clean up cropper if disabled or no capture area
      if (workAreaCropperRef.current) {
        workAreaCropperRef.current.dispose()
        workAreaCropperRef.current = null
      }
      if (cropCanvasRef.current) {
        cropCanvasRef.current.style.display = 'none'
      }
      return
    }

    // Create work area cropper
    const cropper = new WorkAreaCropper({ captureArea })

    // Only apply cropping if needed
    if (cropper.needsCropping()) {
      console.log('📐 Work area cropping enabled - excluding dock from video')

      // Create or update crop canvas
      let cropCanvas = cropCanvasRef.current
      if (!cropCanvas) {
        cropCanvas = document.createElement('canvas')
        cropCanvas.style.position = 'absolute'
        cropCanvas.style.top = '0'
        cropCanvas.style.left = '0'
        cropCanvas.style.width = '100%'
        cropCanvas.style.height = '100%'
        cropCanvas.style.pointerEvents = 'none'
          // Use mutable ref pattern to assign
          ; (cropCanvasRef as any).current = cropCanvas
      }

      cropper.initialize(cropCanvas)
      workAreaCropperRef.current = cropper
    }

    return () => {
      if (workAreaCropperRef.current) {
        workAreaCropperRef.current.dispose()
        workAreaCropperRef.current = null
      }
    }
  }, [isVideoLoaded, showCrop, projectRecording])

  // Set up zoom effect when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current || !containerRef.current) {
      console.log('🔍 Zoom setup: Video not ready yet')
      return
    }

    const metadata = getMetadata()
    console.log(`🔍 Zoom setup: showZoom=${showZoom}, metadata=${metadata?.length || 0} events`)

    if (!metadata || metadata.length === 0 || !showZoom) {
      // Hide zoom canvas if disabled
      if (zoomCanvasRef.current) {
        zoomCanvasRef.current.style.display = 'none'
      }
      // Show video directly
      if (videoRef.current) {
        videoRef.current.style.display = 'block'
      }
      console.log('🔍 Zoom disabled or no metadata - showing video directly')
      return
    }

    // Create zoom engine and generate keyframes
    const video = videoRef.current
    const engine = new EffectsEngine()

    // Use a reasonable duration fallback for zoom calculation
    const totalDurationMs = Number.isFinite(video.duration) && video.duration > 0
      ? (video.duration * 1000)
      : (projectRecording?.duration || metadata[metadata.length - 1]?.timestamp || 10000)

    // Initialize effects engine with metadata - one line!
    engine.initializeFromMetadata(metadata, totalDurationMs, video.videoWidth || 1920, video.videoHeight || 1080)
    
    const effectCount = engine.getEffects().length
    console.log(`🔍 Effects engine initialized with ${metadata.length} events, detected ${effectCount} zoom effects`)
    effectsEngineRef.current = engine

    // Create or update zoom canvas
    let zoomCanvas = zoomCanvasRef.current
    if (!zoomCanvas) {
      zoomCanvas = document.createElement('canvas')
      zoomCanvas.style.position = 'relative'
      zoomCanvas.style.maxWidth = '100%'
      zoomCanvas.style.maxHeight = '100%'
      zoomCanvas.style.borderRadius = '0.5rem'
      zoomCanvas.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      containerRef.current.appendChild(zoomCanvas)
        // Store the reference using a mutable ref pattern
        ; (zoomCanvasRef as any).current = zoomCanvas
    }

    // Update canvas size
    zoomCanvas.width = video.videoWidth || 1920
    zoomCanvas.height = video.videoHeight || 1080

    // Hide original video, show canvas
    video.style.display = 'none'
    zoomCanvas.style.display = 'block'

    const ctx = zoomCanvas.getContext('2d')
    if (!ctx) return

    // Helper to draw current frame even when paused
    const drawCurrentFrame = () => {
      const tMs = isFinite(video.duration) && video.currentTime > 0 ? (video.currentTime * 1000) : 0
      const effectState = engine.getEffectState(tMs)

      // Apply cropping first if needed
      if (showCrop && workAreaCropperRef.current && workAreaCropperRef.current.needsCropping()) {
        // Create a temporary canvas for cropped frame
        const tempCanvas = document.createElement('canvas')
        workAreaCropperRef.current.cropFrame(video, tempCanvas)
        // Apply zoom to the cropped frame
        engine.applyZoomToCanvas(ctx, tempCanvas as any, effectState.zoom)
      } else {
        // Apply zoom directly to video
        engine.applyZoomToCanvas(ctx, video, effectState.zoom)
      }
    }

    // Render loop (always draw to avoid black canvas when paused)
    const renderFrame = () => {
      drawCurrentFrame()
      animationFrameRef.current = requestAnimationFrame(renderFrame)
    }

    // Ensure we draw immediately on load, even at t=0
    const initializeCanvas = () => {
      // Set initial time to 0 to ensure we start with zoom effects
      const initialState = engine.getEffectState(0)
      engine.applyZoomToCanvas(ctx, video, initialState.zoom)
    }

    // Initial draw and start render loop
    initializeCanvas()
    renderFrame()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isVideoLoaded, showZoom, getMetadata, projectRecording?.duration, showCrop])

  // Set up cursor rendering when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current || !containerRef.current || !showCursor) {
      console.log('🖱️ Cursor setup: Not ready or cursor disabled')
      // Clean up old cursor
      if (cursorCanvasRef.current) {
        cursorCanvasRef.current.remove()
        cursorCanvasRef.current = null
      }
      if (cursorRendererRef.current) {
        cursorRendererRef.current.dispose()
        cursorRendererRef.current = null
      }
      return
    }

    const metadata = getMetadata()
    console.log(`🖱️ Cursor setup: showCursor=${showCursor}, metadata=${metadata?.length || 0} events`)

    if (!metadata || metadata.length === 0) {
      console.log('🖱️ No cursor metadata available for this clip')
      return
    }

    console.log(`🖱️ Setting up cursor rendering with ${metadata.length} events`)

    // Create cursor renderer
    const renderer = new CursorRenderer({
      size: 1.2,
      color: '#ffffff',
      clickColor: '#3b82f6',
      smoothing: true
    })

    // Attach to video or zoom canvas
    const targetElement = showZoom && zoomCanvasRef.current ? zoomCanvasRef.current : videoRef.current
    const canvas = renderer.attachToVideo(targetElement as HTMLVideoElement, metadata)
    containerRef.current.appendChild(canvas)

    cursorRendererRef.current = renderer
    cursorCanvasRef.current = canvas

    return () => {
      if (cursorCanvasRef.current) {
        cursorCanvasRef.current.remove()
      }
      if (cursorRendererRef.current) {
        cursorRendererRef.current.dispose()
      }
    }
  }, [isVideoLoaded, showCursor, showZoom, getMetadata])

  // Handle playback state
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      video.play().catch(err => {
        console.error('Failed to play video:', err)
        pause()
      })
    } else {
      video.pause()
    }
  }, [isPlaying, isVideoLoaded, pause])

  // Sync video time with timeline (convert from ms to seconds)
  useEffect(() => {
    const video = videoRef.current
    const clip = getCurrentClip()

    if (!video || !isVideoLoaded) return

    // If no clip at current position, hide the video
    if (!clip) {
      video.style.opacity = '0'
      video.pause()
      return
    }

    // Show the video since we have a clip
    video.style.opacity = '1'

    // Calculate the correct video timestamp based on:
    // 1. Where we are on the timeline (currentTime)
    // 2. Where the clip starts on timeline (clip.startTime)
    // 3. Where the clip's source starts (clip.sourceIn)
    const timelineOffset = currentTime - clip.startTime // How far into the clip we are
    const videoTime = (clip.sourceIn + timelineOffset) / 1000 // Convert to seconds

    // Ensure we're within this clip's bounds
    if (timelineOffset >= 0 && timelineOffset <= clip.duration) {
      if (Math.abs(video.currentTime - videoTime) > 0.01) {
        video.currentTime = videoTime
      }

      // Resume playing if timeline is playing
      if (isPlaying && video.paused) {
        video.play().catch(err => console.log('Playback failed:', err))
      }
    } else {
      // We're outside clip bounds - shouldn't happen with getCurrentClip logic
      video.style.opacity = '0'
      video.pause()
    }
  }, [currentTime, isVideoLoaded, getCurrentClip, isPlaying])

  const handlePlayPause = () => {
    isPlaying ? pause() : play()
  }

  const handleRestart = () => {
    seek(0)
    pause()
  }

  const handleSkipBack = () => {
    // Skip back 5 seconds on the timeline
    seek(Math.max(0, currentTime - 5000))
  }

  const handleSkipForward = () => {
    // Skip forward 5 seconds on the timeline
    const maxTime = currentProject?.timeline?.duration || 0
    seek(Math.min(maxTime, currentTime + 5000))
  }

  // Check if we have a clip at current position
  const hasClipAtPosition = getCurrentClip() !== null

  return (
    <div className="h-full w-full relative flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-primary/5 overflow-hidden">
      {isRecording ? (
        // Recording state - improved design
        <div className="text-center">
          <div className="relative mb-8">
            <div className="w-32 h-32 bg-red-500/10 rounded-full flex items-center justify-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
              </div>
            </div>
          </div>
          <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Recording in Progress
          </h3>
          <p className="text-muted-foreground text-lg">Screen Studio effects are being captured</p>
        </div>
      ) : currentClip ? (
        // Video preview
        videoError ? (
          <div className="text-center text-red-500">
            <p className="text-lg mb-2">Failed to load video</p>
            <p className="text-sm">{videoError}</p>
          </div>
        ) : (
          <>
            <div ref={containerRef} className="relative max-w-full max-h-full p-8 flex items-center justify-center">
              {/* Decorative background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10 blur-3xl opacity-50 pointer-events-none" />

              {/* Show "No Clip" message when playhead is not over any clip */}
              {!hasClipAtPosition && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/80 rounded-xl">
                  <div className="text-center">
                    <div className="text-muted-foreground text-lg mb-2">No clip at current position</div>
                    <div className="text-muted-foreground/60 text-sm">Move the playhead over a clip to see preview</div>
                  </div>
                </div>
              )}
              
              <video
                ref={videoRef}
                className="relative rounded-xl shadow-2xl ring-1 ring-border/20 backdrop-blur-sm"
                style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
                controls={false}
                playsInline
                onTimeUpdate={(e) => {
                  const video = e.target as HTMLVideoElement
                  const clip = getCurrentClip()
                  if (!clip) return

                  // Convert video time back to timeline time
                  // video.currentTime is in seconds, we need to map it back to timeline position
                  const videoTimeMs = video.currentTime * 1000
                  const timelineTime = clip.startTime + (videoTimeMs - clip.sourceIn)

                  if (!isNaN(video.currentTime) && Math.abs(timelineTime - currentTime) > 100) {
                    seek(timelineTime)
                  }
                }}
                onLoadedMetadata={(e) => {
                  const video = e.target as HTMLVideoElement
                  console.log('✅ Video ready:', {
                    duration: video.duration,
                    dimensions: `${video.videoWidth}x${video.videoHeight}`
                  })

                  // Update the clip duration if we have a valid duration
                  if (isFinite(video.duration) && projectClip) {
                    const durationMs = video.duration * 1000
                    // Update clip duration if it's different
                    if (Math.abs(projectClip.duration - durationMs) > 100) {
                      currentProject && useProjectStore.getState().updateClip(projectClip.id, {
                        duration: durationMs
                      })
                    }
                  }

                  setIsVideoLoaded(true)
                  setVideoError(null)
                }}
                onError={(e) => {
                  const video = e.target as HTMLVideoElement
                  const errorMessage = video.error?.message || 'Unknown error'
                  console.error('Video error:', errorMessage)
                  setVideoError(errorMessage)
                  setIsVideoLoaded(false)
                }}
                onEnded={() => pause()}
              />
            </div>

            {/* Floating Video Controls - Screen Studio style */}
            {isVideoLoaded && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-md rounded-xl border border-border/50 shadow-2xl p-3 flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 hover:bg-primary/10"
                    onClick={handleSkipBack}
                    disabled={!isVideoLoaded}
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20"
                    onClick={handlePlayPause}
                    disabled={!isVideoLoaded}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 text-primary" /> : <Play className="w-5 h-5 text-primary ml-0.5" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 hover:bg-primary/10"
                    onClick={handleSkipForward}
                    disabled={!isVideoLoaded}
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 hover:bg-primary/10"
                    onClick={handleRestart}
                    disabled={!isVideoLoaded}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>

                <Separator orientation="vertical" className="h-8" />

                {/* Effect Toggles */}
                <div className="flex items-center space-x-1">
                  {/* Zoom Toggle */}
                  <Button
                    variant={showZoom ? "default" : "ghost"}
                    size="icon"
                    className="w-8 h-8"
                    onClick={() => setShowZoom(!showZoom)}
                    title={showZoom ? "Disable zoom" : "Enable zoom"}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>

                  {/* Cursor Toggle */}
                  <Button
                    variant={showCursor ? "default" : "ghost"}
                    size="icon"
                    className="w-8 h-8"
                    onClick={() => setShowCursor(!showCursor)}
                    title={showCursor ? "Hide cursor" : "Show cursor"}
                  >
                    <MousePointer className="w-4 h-4" />
                  </Button>

                  {/* Crop Toggle - only show if we have capture area info */}
                  {projectRecording?.captureArea && (
                    <Button
                      variant={showCrop ? "default" : "ghost"}
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => setShowCrop(!showCrop)}
                      title={showCrop ? "Show full screen (with dock)" : "Hide dock area"}
                    >
                      <Crop className="w-4 h-4" />
                    </Button>
                  )}

                  {/* Enhancement Toggle */}
                  {hasEnhancements && (
                    <>
                      <Separator orientation="vertical" className="h-8" />
                      <Button
                        variant={showOriginal ? "ghost" : "default"}
                        size="icon"
                        className="w-8 h-8"
                        onClick={() => setShowOriginal(!showOriginal)}
                        title={showOriginal ? "Show enhanced" : "Show original"}
                      >
                        {showOriginal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )
      ) : (
        // Empty state - improved design
        <div className="text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <Play className="w-16 h-16 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-semibold mb-3">No Recording Loaded</h3>
          <p className="text-muted-foreground">Start recording or open a saved project to begin editing</p>
        </div>
      )}
    </div>
  )
}
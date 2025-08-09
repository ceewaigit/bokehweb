"use client"

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
import { useRecordingStore } from '@/stores/recording-store'
import { useProjectStore } from '@/stores/project-store'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { ZoomEngine } from '@/lib/effects/zoom-engine'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { Play, Pause, RotateCcw, Eye, EyeOff, SkipBack, SkipForward, MousePointer, ZoomIn } from 'lucide-react'

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRendererRef = useRef<CursorRenderer | null>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const zoomEngineRef = useRef<ZoomEngine | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  const [showZoom, setShowZoom] = useState(true)
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const { project, currentTime, isPlaying, setPlaying, setCurrentTime } = useTimelineStore()
  const { isRecording } = useRecordingStore()
  const { currentProject, selectedClipId, getCurrentClip, getCurrentRecording } = useProjectStore()

  // Get the current clip from project store
  const projectClip = getCurrentClip()
  const projectRecording = getCurrentRecording()
  
  // Create a simplified clip object for the preview
  const currentClip = projectClip ? {
    id: projectClip.id,
    source: localStorage.getItem(`recording-blob-${projectClip.recordingId}`) || '',
    originalSource: ''
  } : null
  
  const hasEnhancements = currentClip?.originalSource && currentClip?.source !== currentClip?.originalSource

  // Get metadata from project or localStorage
  const getClipMetadata = useCallback(() => {
    // First try project store
    if (projectRecording?.metadata) {
      // Convert to preview format
      const metadata: any[] = []
      
      projectRecording.metadata.mouseEvents?.forEach(e => {
        metadata.push({
          timestamp: e.timestamp,
          mouseX: e.x,
          mouseY: e.y,
          scrollX: 0,
          scrollY: 0,
          windowWidth: e.screenWidth,
          windowHeight: e.screenHeight,
          eventType: 'mouse'
        })
      })
      
      projectRecording.metadata.clickEvents?.forEach(e => {
        metadata.push({
          timestamp: e.timestamp,
          mouseX: e.x,
          mouseY: e.y,
          scrollX: 0,
          scrollY: 0,
          windowWidth: projectRecording.width,
          windowHeight: projectRecording.height,
          eventType: 'click',
          data: { button: e.button }
        })
      })
      
      return metadata
    }
    
    // Fall back to localStorage
    if (!currentClip?.id) return null
    try {
      const stored = localStorage.getItem(`clip-metadata-${currentClip.id}`)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }, [currentClip?.id, projectRecording])

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

  // Set up zoom effect when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current || !containerRef.current) {
      return
    }

    const metadata = getClipMetadata()
    if (!metadata || metadata.length === 0 || !showZoom) {
      // Hide zoom canvas if disabled
      if (zoomCanvasRef.current) {
        zoomCanvasRef.current.style.display = 'none'
      }
      // Show video directly
      if (videoRef.current) {
        videoRef.current.style.display = 'block'
      }
      return
    }

    // Create zoom engine and generate keyframes
    const video = videoRef.current
    const engine = new ZoomEngine({
      enabled: true,
      sensitivity: 1.0,
      maxZoom: 2.0,
      zoomSpeed: 0.1,
      clickZoom: true,
      panSpeed: 0.08
    })

    const keyframes = engine.generateKeyframes(
      metadata,
      video.duration * 1000,
      video.videoWidth || 1920,
      video.videoHeight || 1080
    )

    console.log(`🔍 Generated ${keyframes.length} zoom keyframes`)
    zoomEngineRef.current = engine

    // Create or update zoom canvas
    let zoomCanvas = zoomCanvasRef.current
    if (!zoomCanvas) {
      zoomCanvas = document.createElement('canvas')
      zoomCanvas.style.position = 'absolute'
      zoomCanvas.style.top = '0'
      zoomCanvas.style.left = '0'
      zoomCanvas.style.width = '100%'
      zoomCanvas.style.height = '100%'
      zoomCanvas.style.borderRadius = '0.5rem'
      containerRef.current.insertBefore(zoomCanvas, containerRef.current.firstChild)
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
      const tMs = isFinite(video.duration) ? (video.currentTime * 1000) : 0
      const zoom = engine.getZoomAtTime(tMs)
      engine.applyZoomToCanvas(ctx, video, zoom)
    }

    // Render loop (always draw to avoid black canvas when paused)
    const renderFrame = () => {
      drawCurrentFrame()
      animationFrameRef.current = requestAnimationFrame(renderFrame)
    }

    // Initial draw
    drawCurrentFrame()
    renderFrame()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isVideoLoaded, showZoom, getClipMetadata])

  // Set up cursor rendering when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current || !containerRef.current || !showCursor) {
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

    const metadata = getClipMetadata()
    if (!metadata || metadata.length === 0) {
      console.log('No cursor metadata available for this clip')
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
  }, [isVideoLoaded, showCursor, showZoom, getClipMetadata])

  // Handle playback state
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      video.play().catch(err => {
        console.error('Failed to play video:', err)
        setPlaying(false)
      })
    } else {
      video.pause()
    }
  }, [isPlaying, isVideoLoaded, setPlaying])

  // Sync video time with timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime
    }
  }, [currentTime, isVideoLoaded])

  const handlePlayPause = () => {
    setPlaying(!isPlaying)
  }

  const handleRestart = () => {
    setCurrentTime(0)
    setPlaying(false)
  }

  const handleSkipBack = () => {
    const video = videoRef.current
    if (video && isVideoLoaded) {
      video.currentTime = Math.max(0, video.currentTime - 5)
      setCurrentTime(video.currentTime)
    }
  }

  const handleSkipForward = () => {
    const video = videoRef.current
    if (video && isVideoLoaded) {
      video.currentTime = Math.min(video.duration, video.currentTime + 5)
      setCurrentTime(video.currentTime)
    }
  }

  return (
    <div className="flex-1 relative flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-primary/5 overflow-hidden">
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
            <div ref={containerRef} className="relative max-w-full max-h-full p-8">
              {/* Decorative background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10 blur-3xl opacity-50" />
              
              <video
                ref={videoRef}
                className="relative max-w-full max-h-full rounded-xl shadow-2xl ring-1 ring-border/20 backdrop-blur-sm"
                controls={false}
                playsInline
                onTimeUpdate={(e) => {
                  const video = e.target as HTMLVideoElement
                  if (!isNaN(video.currentTime) && Math.abs(video.currentTime - currentTime) > 0.1) {
                    setCurrentTime(video.currentTime)
                  }
                }}
                onLoadedMetadata={(e) => {
                  const video = e.target as HTMLVideoElement
                  console.log('✅ Video ready:', {
                    duration: video.duration,
                    dimensions: `${video.videoWidth}x${video.videoHeight}`
                  })
                  // Treat live/infinite streams as having a fallback duration
                  if (!isFinite(video.duration)) {
                    // Default to 10 minutes if unknown
                    const fallbackMs = 10 * 60 * 1000
                    // Update timeline max duration via store if needed
                    // No direct project.settings mutation here; timeline computes from clips
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
                onEnded={() => setPlaying(false)}
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
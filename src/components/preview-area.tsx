"use client"

import { useRef, useEffect, useState, useCallback } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
import { useRecordingStore } from '@/stores/recording-store'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { ZoomEngine } from '@/lib/effects/zoom-engine'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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

  // Get the current clip (first clip for now)
  const currentClip = project?.clips[0]
  const hasEnhancements = currentClip?.originalSource && currentClip?.source !== currentClip?.originalSource

  // Get metadata from localStorage if available
  const getClipMetadata = useCallback(() => {
    if (!currentClip?.id) return null
    try {
      const stored = localStorage.getItem(`clip-metadata-${currentClip.id}`)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }, [currentClip?.id])

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
    <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
      {isRecording ? (
        // Recording state
        <div className="text-center text-white">
          <div className="flex items-center justify-center mb-4">
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse mr-2" />
            <span className="text-lg font-medium">Recording...</span>
          </div>
          <p className="text-muted-foreground">Screen Studio effects are being applied</p>
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
            <div ref={containerRef} className="relative max-w-full max-h-full">
              <video
                ref={videoRef}
                className="max-w-full max-h-full rounded-lg shadow-2xl"
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

            {/* Video Controls Overlay */}
            {isVideoLoaded && (
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/50 backdrop-blur-sm rounded-lg p-2">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSkipBack}
                    disabled={!isVideoLoaded}
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePlayPause}
                    disabled={!isVideoLoaded}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSkipForward}
                    disabled={!isVideoLoaded}
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRestart}
                    disabled={!isVideoLoaded}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>

                {/* Effect Toggles */}
                <div className="flex items-center space-x-2">
                  {/* Zoom Toggle */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowZoom(!showZoom)}
                    title={showZoom ? "Disable zoom" : "Enable zoom"}
                  >
                    <ZoomIn className={`w-4 h-4 ${showZoom ? '' : 'opacity-50'}`} />
                  </Button>

                  {/* Cursor Toggle */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCursor(!showCursor)}
                    title={showCursor ? "Hide cursor" : "Show cursor"}
                  >
                    <MousePointer className={`w-4 h-4 ${showCursor ? '' : 'opacity-50'}`} />
                  </Button>

                  {/* Enhancement Toggle */}
                  {hasEnhancements && (
                    <>
                      <Badge variant={showOriginal ? "outline" : "default"}>
                        {showOriginal ? "Original" : "Enhanced"}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowOriginal(!showOriginal)}
                      >
                        {showOriginal ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                        {showOriginal ? "Show Enhanced" : "Show Original"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )
      ) : (
        // Empty state
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No video loaded</p>
          <p>Record your screen to see the preview</p>
        </div>
      )}
    </div>
  )
}
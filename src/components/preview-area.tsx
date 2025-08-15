'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import { cn } from '@/lib/utils'

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const cursorRendererRef = useRef<CursorRenderer | null>(null)
  const backgroundRendererRef = useRef<BackgroundRenderer | null>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number>()
  const videoBlobUrlRef = useRef<string | null>(null)
  
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [showEffects, setShowEffects] = useState(true)

  const {
    currentProject,
    selectedClipId,
    currentTime,
    isPlaying,
    getCurrentRecording
  } = useProjectStore()

  // Get the selected clip
  const selectedClip = currentProject?.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null

  // Get the recording for the selected clip
  const clipRecording = selectedClip ? 
    currentProject?.recordings.find(r => r.id === selectedClip.recordingId) : null
  
  const currentRecording = clipRecording || getCurrentRecording()

  // Main rendering function
  const renderFrame = useCallback((timeMs?: number) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const currentTimeMs = timeMs ?? (video.currentTime * 1000)

    // Handle zoom effects
    if (showEffects && effectsEngineRef.current && backgroundRendererRef.current) {
      const zoomState = effectsEngineRef.current.getZoomState(currentTimeMs)
      
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')

      if (tempCtx) {
        effectsEngineRef.current.applyZoomToCanvas(tempCtx, video, zoomState)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        backgroundRendererRef.current.applyBackground(ctx, tempCanvas)
      }
    } else {
      // No effects - draw video directly
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }
  }, [showEffects])

  // Initialize all effects
  const initializeEffects = useCallback(() => {
    if (!currentRecording || !videoRef.current) return

    // Initialize effects engine
    if (!effectsEngineRef.current) {
      effectsEngineRef.current = new EffectsEngine()
    }
    effectsEngineRef.current.initializeFromRecording(currentRecording)

    // Initialize cursor renderer
    if (cursorRendererRef.current) {
      cursorRendererRef.current.dispose()
    }
    
    const clipEffects = selectedClip?.effects
    const showCursor = clipEffects?.cursor?.visible ?? true
    
    if (showCursor && currentRecording.metadata?.mouseEvents) {
      cursorRendererRef.current = new CursorRenderer({
        size: clipEffects?.cursor?.size ?? 1.5,
        color: clipEffects?.cursor?.color ?? '#000000',
        clickColor: '#007AFF',
        smoothing: true
      })
      
      const cursorEvents = currentRecording.metadata.mouseEvents.map((e: any) => ({
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
    
    const bgOptions = clipEffects?.background || {
      type: 'gradient',
      gradient: {
        type: 'linear',
        colors: ['#0F172A', '#1E293B'],
        angle: 135
      },
      padding: 120,
      borderRadius: 16
    }
    
    // BackgroundRenderer will use default options
  }, [currentRecording, selectedClip?.effects])

  // Load video file as blob
  const loadVideoFile = useCallback(async (filePath: string) => {
    try {
      // Check if we're in Electron environment with IPC
      if (window.electronAPI?.readLocalFile) {
        const result = await window.electronAPI.readLocalFile(filePath)
        if (result.success && result.data) {
          const blob = new Blob([result.data], { type: 'video/webm' })
          return URL.createObjectURL(blob)
        } else {
          console.error('Failed to read file:', result.error)
          return filePath
        }
      } else {
        // Fallback for dev environment - direct file path
        console.log('No Electron API, using direct file path')
        return filePath
      }
    } catch (error) {
      console.error('Failed to load video file:', error)
      // Last fallback
      return filePath
    }
  }, [])

  // Main effect: Handle video loading and initialization
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !clipRecording?.filePath) return

    // Reset state
    setIsVideoLoaded(false)
    
    // Clean up previous effects
    if (cursorCanvasRef.current) {
      cursorCanvasRef.current.remove()
      cursorCanvasRef.current = null
    }
    
    if (cursorRendererRef.current) {
      cursorRendererRef.current.dispose()
      cursorRendererRef.current = null
    }

    // Clean up previous blob URL
    if (videoBlobUrlRef.current) {
      URL.revokeObjectURL(videoBlobUrlRef.current)
      videoBlobUrlRef.current = null
    }

    // Load video file
    loadVideoFile(clipRecording.filePath).then(videoUrl => {
      if (!video) return
      
      videoBlobUrlRef.current = videoUrl
      video.src = videoUrl
      video.load()
    })

    const handleVideoReady = () => {
      if (!video.videoWidth || !video.videoHeight) return
      
      // Update canvas dimensions
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      // Initialize effects
      setIsVideoLoaded(true)
      initializeEffects()
      
      // Render first frame
      renderFrame(0)
    }

    const handleTimeUpdate = () => {
      renderFrame(video.currentTime * 1000)
    }

    video.addEventListener('loadedmetadata', handleVideoReady)
    video.addEventListener('timeupdate', handleTimeUpdate)
    
    return () => {
      video.removeEventListener('loadedmetadata', handleVideoReady)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      
      // Clean up blob URL
      if (videoBlobUrlRef.current) {
        URL.revokeObjectURL(videoBlobUrlRef.current)
        videoBlobUrlRef.current = null
      }
    }
  }, [clipRecording?.filePath, initializeEffects, renderFrame, loadVideoFile])

  // Handle playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      video.play().catch(console.error)
      
      const animate = () => {
        renderFrame()
        if (isPlaying) {
          animationFrameRef.current = requestAnimationFrame(animate)
        }
      }
      animate()
    } else {
      video.pause()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, isVideoLoaded, renderFrame])

  // Handle timeline scrubbing
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || isPlaying) return

    const targetTime = currentTime / 1000
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime
    }
  }, [currentTime, isVideoLoaded, isPlaying])

  // Re-render when effects settings change
  useEffect(() => {
    if (!isVideoLoaded) return
    
    initializeEffects()
    renderFrame()
  }, [selectedClip?.effects, isVideoLoaded, initializeEffects, renderFrame])

  return (
    <div className="relative flex-1 bg-gray-900 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={cn(
              "max-w-full max-h-full shadow-2xl",
              !clipRecording && "hidden"
            )}
          />
          <video
            ref={videoRef}
            className="hidden"
            muted
            playsInline
          />
          {!clipRecording && (
            <div className="text-gray-500 text-center p-8">
              <p className="text-lg font-medium mb-2">No recording selected</p>
              <p className="text-sm">Select a recording from the library to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
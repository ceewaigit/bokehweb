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

    // Always draw video first (simpler approach)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    try {
      // Check if video is ready to draw
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      } else {
        // Fill with placeholder color if video not ready
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    } catch (err) {
      console.error('Error drawing video:', err)
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
      if (typeof window !== 'undefined' && window.electronAPI?.readLocalFile) {
        console.log('Loading video via Electron API:', filePath)
        const result = await window.electronAPI.readLocalFile(filePath)
        if (result.success && result.data) {
          const blob = new Blob([result.data], { type: 'video/webm' })
          const blobUrl = URL.createObjectURL(blob)
          console.log('Created blob URL:', blobUrl)
          return blobUrl
        } else {
          console.error('Failed to read file:', result.error)
        }
      }
      
      // Fallback: Try direct file:// URL (works in Electron without CSP restrictions)
      if (filePath.startsWith('/')) {
        const fileUrl = `file://${filePath}`
        console.log('Using file:// URL:', fileUrl)
        return fileUrl
      }
      
      // Last resort: use as-is
      console.log('Using path as-is:', filePath)
      return filePath
    } catch (error) {
      console.error('Failed to load video file:', error)
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
    }).catch(err => {
      console.error('Failed to load video file:', err)
    })

    const handleVideoReady = () => {
      console.log('Video ready:', video.videoWidth, 'x', video.videoHeight)
      if (!video.videoWidth || !video.videoHeight) return
      
      // Update canvas dimensions
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      console.log('Canvas dimensions set:', canvas.width, 'x', canvas.height)
      
      // Initialize effects
      setIsVideoLoaded(true)
      initializeEffects()
      
      // Render first frame
      console.log('Rendering first frame...')
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
  }, [selectedClip?.effects, isVideoLoaded]) // Remove callback deps to avoid infinite loop

  return (
    <div className="relative flex-1 bg-gray-900 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          {clipRecording && (
            <canvas
              ref={canvasRef}
              className="shadow-2xl"
              style={{ 
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                backgroundColor: '#000'
              }}
            />
          )}
          <video
            ref={videoRef}
            className="hidden"
            style={{ display: 'none' }}
            muted
            playsInline
            crossOrigin="anonymous"
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
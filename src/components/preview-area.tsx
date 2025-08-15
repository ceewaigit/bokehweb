'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import { RecordingStorage } from '@/lib/storage/recording-storage'

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
    getCurrentRecording,
    seek,
    pause
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
        // Scale video to fit canvas while maintaining aspect ratio
        const videoAspect = video.videoWidth / video.videoHeight
        const canvasAspect = canvas.width / canvas.height
        
        let drawWidth, drawHeight, offsetX, offsetY
        
        if (videoAspect > canvasAspect) {
          // Video is wider
          drawWidth = canvas.width
          drawHeight = canvas.width / videoAspect
          offsetX = 0
          offsetY = (canvas.height - drawHeight) / 2
        } else {
          // Video is taller
          drawHeight = canvas.height
          drawWidth = canvas.height * videoAspect
          offsetX = (canvas.width - drawWidth) / 2
          offsetY = 0
        }
        
        // Fill background
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw video
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
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
        const result = await window.electronAPI.readLocalFile(filePath)
        if (result.success && result.data) {
          const blob = new Blob([result.data], { type: 'video/webm' })
          const blobUrl = URL.createObjectURL(blob)
          return blobUrl
        } else {
          console.error('Failed to read file:', result.error)
        }
      }
      
      // Fallback: Try direct file:// URL (works in Electron without CSP restrictions)
      if (filePath.startsWith('/')) {
        const fileUrl = `file://${filePath}`
        return fileUrl
      }
      
      // Last resort: use as-is
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
    if (!video || !canvas || !clipRecording) return

    // Clean up previous effects
    if (cursorCanvasRef.current) {
      cursorCanvasRef.current.remove()
      cursorCanvasRef.current = null
    }
    
    if (cursorRendererRef.current) {
      cursorRendererRef.current.dispose()
      cursorRendererRef.current = null
    }

    // Simple approach: Just use the file path directly or get blob URL from storage
    const loadVideo = () => {
      // First check if we already have a blob URL for this recording
      const storedBlobUrl = RecordingStorage.getBlobUrl(clipRecording.id)
      
      if (storedBlobUrl) {
        // Use the stored blob URL (from when project was loaded)
        if (video.src !== storedBlobUrl) {
          console.log(`Loading video from blob URL: ${clipRecording.id}`)
          video.src = storedBlobUrl
          videoBlobUrlRef.current = storedBlobUrl
          video.load()
        }
      } else if (clipRecording.filePath) {
        // Use file:// URL directly - let Electron handle the file access
        const fileUrl = `file://${clipRecording.filePath}`
        if (video.src !== fileUrl) {
          console.log(`Loading video from file: ${clipRecording.filePath}`)
          video.src = fileUrl
          videoBlobUrlRef.current = fileUrl
          video.load()
        }
      } else {
        console.error('No video source available for recording:', clipRecording.id)
      }
    }
    
    // Reset loaded state when clip changes
    setIsVideoLoaded(false)
    loadVideo()

    const handleVideoReady = () => {
      if (!video.videoWidth || !video.videoHeight) return
      
      // Set canvas to a reasonable size for display
      const maxWidth = 1920
      const maxHeight = 1080
      let canvasWidth = video.videoWidth
      let canvasHeight = video.videoHeight
      
      // Scale down if too large
      if (canvasWidth > maxWidth || canvasHeight > maxHeight) {
        const scale = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight)
        canvasWidth = Math.floor(canvasWidth * scale)
        canvasHeight = Math.floor(canvasHeight * scale)
      }
      
      // Update canvas dimensions
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      
      // Initialize effects
      setIsVideoLoaded(true)
      initializeEffects()
      
      // Render first frame
      renderFrame(0)
    }

    const handleTimeUpdate = () => {
      const videoTimeMs = video.currentTime * 1000
      renderFrame(videoTimeMs)
    }

    video.addEventListener('loadedmetadata', handleVideoReady)
    video.addEventListener('timeupdate', handleTimeUpdate)
    
    return () => {
      video.removeEventListener('loadedmetadata', handleVideoReady)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      
      // Don't clean up blob URLs from storage
      if (videoBlobUrlRef.current && 
          videoBlobUrlRef.current.startsWith('blob:') && 
          !RecordingStorage.getBlobUrl(clipRecording?.id || '')) {
        URL.revokeObjectURL(videoBlobUrlRef.current)
        videoBlobUrlRef.current = null
      }
    }
  }, [clipRecording?.id, clipRecording?.filePath, initializeEffects])

  // Handle playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      // Calculate the video time based on clip's sourceIn and timeline position
      if (selectedClip) {
        // Map timeline time to source video time
        const clipProgress = currentTime - selectedClip.startTime
        const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
        
        // Ensure we're within the clip's source bounds
        const maxSourceTime = selectedClip.sourceOut / 1000
        const clampedTime = Math.min(Math.max(sourceTime, selectedClip.sourceIn / 1000), maxSourceTime)
        
        if (Math.abs(video.currentTime - clampedTime) > 0.1) {
          video.currentTime = clampedTime
        }
      }
      
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
  }, [isPlaying, isVideoLoaded, renderFrame, currentTime])

  // Handle timeline scrubbing
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || isPlaying) return

    if (selectedClip) {
      // Map timeline position to source video position
      const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
      const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
      
      // Clamp to clip bounds
      const minTime = selectedClip.sourceIn / 1000
      const maxTime = selectedClip.sourceOut / 1000
      const targetTime = Math.min(Math.max(sourceTime, minTime), maxTime)
      
      if (Math.abs(video.currentTime - targetTime) > 0.1) {
        video.currentTime = targetTime
      }
    }
  }, [currentTime, isVideoLoaded, isPlaying, selectedClip])
  
  // Sync video time to timeline during playback and handle clip boundaries
  useEffect(() => {
    if (!isPlaying || !isVideoLoaded) return
    
    const video = videoRef.current
    if (!video || !selectedClip) return
    
    const syncInterval = setInterval(() => {
      const videoTimeMs = video.currentTime * 1000
      
      // Check if we've reached the end of the clip's source
      if (videoTimeMs >= selectedClip.sourceOut) {
        // Move to next clip or stop
        const nextTime = selectedClip.startTime + selectedClip.duration
        if (nextTime >= (currentProject?.timeline.duration || 0)) {
          // End of timeline
          pause()
        } else {
          // Move to next position
          seek(nextTime)
        }
      } else {
        // Update timeline position based on video position
        const clipProgress = videoTimeMs - selectedClip.sourceIn
        const timelineTime = selectedClip.startTime + clipProgress
        
        if (Math.abs(currentTime - timelineTime) > 50) {
          seek(timelineTime)
        }
      }
    }, 100) // Check every 100ms
    
    return () => clearInterval(syncInterval)
  }, [isPlaying, isVideoLoaded, currentTime, seek, selectedClip, currentProject, pause])

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
                display: 'block',
                maxWidth: '100%',
                maxHeight: '100%',
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
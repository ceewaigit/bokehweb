'use client'

import { useRef, useEffect, useState, useCallback, RefObject } from 'react'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import type { Clip, Recording } from '@/types/project'

interface PreviewAreaProps {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  selectedClip: Clip | null
  selectedRecording: Recording | null | undefined
  currentTime: number
  isPlaying: boolean
}

export function PreviewArea({
  videoRef: externalVideoRef,
  canvasRef: externalCanvasRef,
  selectedClip,
  selectedRecording,
  currentTime,
  isPlaying
}: PreviewAreaProps) {
  // Use external refs from parent
  const videoRef = externalVideoRef
  const canvasRef = externalCanvasRef
  
  // Internal refs for effects
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const cursorRendererRef = useRef<CursorRenderer | null>(null)
  const backgroundRendererRef = useRef<BackgroundRenderer | null>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number>()
  const videoBlobUrlRef = useRef<string | null>(null)

  // Performance optimizations: cache temporary canvases
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  const [isVideoLoaded, setIsVideoLoaded] = useState(false)

  // Use the selected recording passed from parent
  const currentRecording = selectedRecording

  // Main rendering function - simplified
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const currentTimeMs = video.currentTime * 1000

    try {
      // Check if video is ready to draw
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        // Get background options from clip effects and map types
        const clipBg = selectedClip?.effects?.background || {
          type: 'gradient',
          gradient: {
            colors: ['#0F172A', '#1E293B'],
            angle: 135
          },
          padding: 80
        }

        // Map clip background type to renderer type
        let bgType: 'solid' | 'gradient' | 'image' | 'wallpaper' | 'blur' = 'gradient'
        if (clipBg.type === 'color') bgType = 'solid'
        else if (clipBg.type === 'none') bgType = 'solid' // Use solid black for 'none'
        else if (clipBg.type === 'gradient' || clipBg.type === 'image' || clipBg.type === 'blur') {
          bgType = clipBg.type
        }

        const bgOptions = {
          type: bgType,
          color: clipBg.type === 'none' ? '#000000' : clipBg.color,
          gradient: clipBg.gradient ? {
            type: 'linear' as const,
            colors: clipBg.gradient.colors,
            angle: clipBg.gradient.angle
          } : undefined,
          image: clipBg.image,
          blur: clipBg.blur,
          padding: clipBg.padding || 80,
          borderRadius: 16
        }

        // Calculate video dimensions with padding
        const padding = bgOptions.padding || 0
        const videoAspect = video.videoWidth / video.videoHeight
        const availableWidth = canvas.width - (padding * 2)
        const availableHeight = canvas.height - (padding * 2)
        const availableAspect = availableWidth / availableHeight

        let drawWidth, drawHeight, offsetX, offsetY

        if (videoAspect > availableAspect) {
          // Video is wider
          drawWidth = availableWidth
          drawHeight = availableWidth / videoAspect
          offsetX = padding
          offsetY = padding + (availableHeight - drawHeight) / 2
        } else {
          // Video is taller
          drawHeight = availableHeight
          drawWidth = availableHeight * videoAspect
          offsetX = padding + (availableWidth - drawWidth) / 2
          offsetY = padding
        }

        // Apply background first if background renderer exists
        if (backgroundRendererRef.current) {
          // Update background options if they changed
          backgroundRendererRef.current.updateOptions(bgOptions)

          // Only use temp canvas if we have zoom effects
          const hasZoomEffect = selectedClip?.effects?.zoom?.enabled && effectsEngineRef.current

          if (hasZoomEffect && effectsEngineRef.current) {
            // Reuse cached temporary canvas for zoom effects
            if (!tempCanvasRef.current ||
              tempCanvasRef.current.width !== video.videoWidth ||
              tempCanvasRef.current.height !== video.videoHeight) {
              tempCanvasRef.current = document.createElement('canvas')
              tempCanvasRef.current.width = video.videoWidth
              tempCanvasRef.current.height = video.videoHeight
              tempCtxRef.current = tempCanvasRef.current.getContext('2d', {
                alpha: false,
                desynchronized: true
              })
            }

            const tempCanvas = tempCanvasRef.current
            const tempCtx = tempCtxRef.current!

            // Save context state for zoom transformations
            tempCtx.save()

            const clipTime = currentTimeMs - selectedClip.sourceIn
            const sourceTime = selectedClip.sourceIn + clipTime
            const zoomState = effectsEngineRef.current.getZoomState(sourceTime)

            if (zoomState.scale > 1.0) {
              const centerX = tempCanvas.width / 2
              const centerY = tempCanvas.height / 2

              // Apply zoom transformation
              tempCtx.translate(centerX, centerY)
              tempCtx.scale(zoomState.scale, zoomState.scale)

              // Pan to keep the zoom target centered
              const targetX = tempCanvas.width * zoomState.x
              const targetY = tempCanvas.height * zoomState.y
              const panX = (targetX - centerX) * (1 - 1 / zoomState.scale)
              const panY = (targetY - centerY) * (1 - 1 / zoomState.scale)
              tempCtx.translate(-panX / zoomState.scale, -panY / zoomState.scale)

              tempCtx.translate(-centerX, -centerY)
            }

            // Draw video to temp canvas with zoom
            tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height)
            tempCtx.restore()

            // Apply background with the zoomed video frame
            backgroundRendererRef.current.applyBackground(
              ctx,
              tempCanvas,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            )
          } else {
            // No zoom - draw directly, much faster
            backgroundRendererRef.current.applyBackground(
              ctx,
              video,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            )
          }
        } else {
          // Fallback: just draw video without background
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
        }
      } else if (video.readyState < 2) {
        // Don't clear canvas if video is still loading - keep last frame
        // This prevents black flashes during playback
        return
      }
    } catch (err) {
      // Don't clear canvas on error - keep last frame visible
      console.error('Error drawing video:', err)
    }
  }, [selectedClip])

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

      // Note: metadata.mouseEvents already have x/y coordinates from project saving
      // but CursorRenderer expects mouseX/mouseY format
      const cursorEvents = currentRecording.metadata.mouseEvents.map((e: any) => ({
        ...e,
        mouseX: e.x, // x is already in pixels from project saving
        mouseY: e.y, // y is already in pixels from project saving
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

    // BackgroundRenderer will use clip effects or default options
  }, [currentRecording, selectedClip?.effects])

  // Main effect: Handle video loading and initialization
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !currentRecording) return

    // Clean up previous effects
    if (cursorCanvasRef.current) {
      cursorCanvasRef.current.remove()
      cursorCanvasRef.current = null
    }

    if (cursorRendererRef.current) {
      cursorRendererRef.current.dispose()
      cursorRendererRef.current = null
    }

    // Don't dispose background renderer, just update it
    // This prevents crashes when changing background settings

    // Load video - all complexity handled by manager
    const loadVideo = async () => {
      const blobUrl = await globalBlobManager.ensureVideoLoaded(currentRecording.id, currentRecording.filePath)
      
      if (blobUrl && video.src !== blobUrl) {
        video.src = blobUrl
        videoBlobUrlRef.current = blobUrl
        video.load()
      } else if (!blobUrl) {
        console.error('No video available for:', currentRecording.id)
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
      renderFrame()
    }

    const handleTimeUpdate = () => {
      // Don't render here - let the main loop handle it
      // This was causing double rendering
    }

    video.addEventListener('loadedmetadata', handleVideoReady)
    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('loadedmetadata', handleVideoReady)
      video.removeEventListener('timeupdate', handleTimeUpdate)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Blob manager handles cleanup automatically
      videoBlobUrlRef.current = null
    }
  }, [currentRecording?.id, currentRecording?.filePath, initializeEffects])

  // Handle playback state changes - simplified
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      // Render loop - runs continuously during playback
      const animate = () => {
        if (!isPlaying) return

        // Render current frame
        renderFrame()
        
        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(animate)
      }

      // Start the render loop
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      // Stop the render loop when paused
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
    }
  }, [isPlaying, isVideoLoaded, renderFrame])

  // Handle video element play/pause state and sync during playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || !selectedClip) return

    if (isPlaying) {
      // Continuously sync video time during playback
      const syncVideoTime = () => {
        if (!isPlaying) return
        
        // Map timeline time to video time
        const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
        const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000
        
        // Clamp to clip bounds
        const minTime = selectedClip.sourceIn / 1000
        const maxTime = selectedClip.sourceOut / 1000
        const targetTime = Math.min(Math.max(sourceTime, minTime), maxTime)
        
        // Update video time if significantly different (allow small drift for smooth playback)
        if (Math.abs(video.currentTime - targetTime) > 0.1) {
          video.currentTime = targetTime
        }
        
        // Ensure video is playing
        if (video.paused && targetTime < maxTime) {
          video.play().catch(console.error)
        }
      }
      
      // Initial sync and play
      syncVideoTime()
      
      // Set up interval to keep video in sync
      const syncInterval = setInterval(syncVideoTime, 100) // Sync every 100ms
      
      return () => {
        clearInterval(syncInterval)
      }
    } else {
      video.pause()
    }
  }, [isPlaying, isVideoLoaded, selectedClip, currentTime])

  // Sync video time with timeline currentTime when scrubbing (not playing)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || isPlaying) return

    // Only sync when not playing (during scrubbing)
    if (selectedClip) {
      // Check if currentTime is within this clip's range
      const clipStart = selectedClip.startTime
      const clipEnd = selectedClip.startTime + selectedClip.duration

      if (currentTime >= clipStart && currentTime <= clipEnd) {
        // Map timeline position to source video position
        const clipProgress = Math.max(0, currentTime - selectedClip.startTime)
        const sourceTime = (selectedClip.sourceIn + clipProgress) / 1000

        // Clamp to clip bounds
        const minTime = selectedClip.sourceIn / 1000
        const maxTime = selectedClip.sourceOut / 1000
        const targetTime = Math.min(Math.max(sourceTime, minTime), maxTime)

        // Update video time if different
        if (Math.abs(video.currentTime - targetTime) > 0.01) {
          video.currentTime = targetTime
          // Render the frame at the new position
          renderFrame()
        }
      } else {
        // Current time is outside this clip - pause at start or end
        if (currentTime < clipStart) {
          video.currentTime = selectedClip.sourceIn / 1000
        } else {
          video.currentTime = selectedClip.sourceOut / 1000
        }
        renderFrame()
      }
    }
  }, [currentTime, isVideoLoaded, selectedClip, isPlaying, renderFrame])

  // Monitor clip boundaries during playback
  useEffect(() => {
    if (!isPlaying || !isVideoLoaded) return

    const video = videoRef.current
    if (!video || !selectedClip) return

    // Video end handling is now managed by WorkspaceManager
    // which controls the overall playback state
  }, [isPlaying, isVideoLoaded, selectedClip])

  // Re-render when effects settings change
  useEffect(() => {
    if (!isVideoLoaded) return

    initializeEffects()
    // Don't render here - the main loop will handle it
  }, [selectedClip?.effects, isVideoLoaded]) // Remove callback deps to avoid infinite loop

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up all renderers on unmount
      if (cursorRendererRef.current) {
        cursorRendererRef.current.dispose()
        cursorRendererRef.current = null
      }
      if (backgroundRendererRef.current) {
        backgroundRendererRef.current.dispose()
        backgroundRendererRef.current = null
      }
      if (effectsEngineRef.current) {
        effectsEngineRef.current = null
      }
      if (cursorCanvasRef.current) {
        cursorCanvasRef.current.remove()
        cursorCanvasRef.current = null
      }
      // Clean up cached canvases
      tempCanvasRef.current = null
      tempCtxRef.current = null
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          {currentRecording && (
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
          {!currentRecording && (
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
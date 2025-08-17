'use client'

import { useRef, useEffect, useState, useCallback, RefObject } from 'react'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { CursorRenderer } from '@/lib/effects/cursor-renderer'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import { Skeleton } from '@/components/ui/skeleton'
import type { Clip, Recording, ClipEffects } from '@/types/project'

interface PreviewAreaProps {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  effectsEngine: EffectsEngine | null
  cursorRenderer: CursorRenderer | null
  backgroundRenderer: BackgroundRenderer | null
  selectedClip: Clip | null
  selectedRecording: Recording | null | undefined
  currentTime: number
  isPlaying: boolean
  localEffects?: ClipEffects | null
}

export function PreviewArea({
  videoRef,
  canvasRef,
  effectsEngine,
  cursorRenderer,
  backgroundRenderer,
  selectedClip,
  selectedRecording,
  currentTime,
  isPlaying,
  localEffects
}: PreviewAreaProps) {
  // Internal refs for animation and state
  const animationFrameRef = useRef<number>()

  // Performance optimizations: cache temporary canvases
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  
  // Track video position for cursor alignment
  const videoPositionRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const initializedRecordingRef = useRef<string | null>(null)

  // Use the selected recording passed from parent
  const currentRecording = selectedRecording

  // Store latest effects in refs to avoid recreating renderFrame
  const latestClipRef = useRef(selectedClip)
  const latestEffectsEngineRef = useRef(effectsEngine)
  const latestBackgroundRendererRef = useRef(backgroundRenderer)
  const latestLocalEffectsRef = useRef(localEffects)
  const lastBackgroundOptionsRef = useRef<string>("")
  
  // Update refs when props change
  useEffect(() => {
    latestClipRef.current = selectedClip
    latestEffectsEngineRef.current = effectsEngine
    latestBackgroundRendererRef.current = backgroundRenderer
    latestLocalEffectsRef.current = localEffects
  }, [selectedClip, effectsEngine, backgroundRenderer, localEffects])

  // Main rendering function - now stable, doesn't depend on changing props
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const currentTimeMs = video.currentTime * 1000

    try {
      // Use refs for latest values without recreating callback
      const currentClip = latestClipRef.current
      const currentBackgroundRenderer = latestBackgroundRendererRef.current
      const currentEffectsEngine = latestEffectsEngineRef.current
      const currentLocalEffects = latestLocalEffectsRef.current
      
      // Use localEffects if available, otherwise use clip effects
      const effectsToUse = currentLocalEffects || currentClip?.effects
      
      // Get background options from clip effects
      const clipBg = effectsToUse?.background || {
        type: 'gradient',
        gradient: { colors: ['#0F172A', '#1E293B'], angle: 135 },
        padding: 80
      }

      const bgOptions = {
        type: clipBg.type === 'color' ? 'solid' : 
              clipBg.type === 'none' ? 'solid' : 
              clipBg.type as any,
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
      
      // Check if video has valid dimensions
      const videoIsReady = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
      const videoWidth = videoIsReady ? video.videoWidth : canvas.width
      const videoHeight = videoIsReady ? video.videoHeight : canvas.height
      
      const videoAspect = videoWidth / videoHeight
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
      
      // Store video position for cursor renderer
      videoPositionRef.current = { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight }
      
      // Update cursor renderer if it exists
      if (cursorRenderer && videoIsReady) {
        cursorRenderer.updateVideoPosition(offsetX, offsetY, drawWidth, drawHeight)
      }

      // Check if background options actually changed
      const bgOptionsString = JSON.stringify(bgOptions)
      const backgroundChanged = bgOptionsString !== lastBackgroundOptionsRef.current
      
      // Apply background first if background renderer exists
      if (currentBackgroundRenderer) {
        // Only update background options if they actually changed
        if (backgroundChanged) {
          console.log('📐 Background options changed, updating renderer', {
            ...bgOptions,
            gradientColors: bgOptions.gradient?.colors,
            effectsToUse: effectsToUse?.background
          })
          currentBackgroundRenderer.updateOptions(bgOptions)
          lastBackgroundOptionsRef.current = bgOptionsString
        }

        // Only draw video if it's ready
        if (videoIsReady) {
          // Only use temp canvas if we have zoom effects
          const hasZoomEffect = effectsToUse?.zoom?.enabled && currentEffectsEngine

          if (hasZoomEffect && currentEffectsEngine) {
            // Reuse cached temporary canvas for zoom effects
            if (!tempCanvasRef.current ||
              tempCanvasRef.current.width !== videoWidth ||
              tempCanvasRef.current.height !== videoHeight) {
              tempCanvasRef.current = document.createElement('canvas')
              tempCanvasRef.current.width = videoWidth
              tempCanvasRef.current.height = videoHeight
              tempCtxRef.current = tempCanvasRef.current.getContext('2d', {
                alpha: false,
                desynchronized: true
              })
            }

            const tempCanvas = tempCanvasRef.current
            const tempCtx = tempCtxRef.current!

            // Save context state for zoom transformations
            tempCtx.save()

            // Calculate time relative to the clip for zoom effects
            // The zoom blocks are stored relative to clip time (0 = start of clip)
            const clipRelativeTime = currentTimeMs - (currentClip?.sourceIn || 0)
            const zoomState = currentEffectsEngine.getZoomState(clipRelativeTime)

            if (zoomState.scale > 1.0) {
              // Calculate the zoom target point in video space
              const targetX = tempCanvas.width * zoomState.x
              const targetY = tempCanvas.height * zoomState.y

              // Calculate the zoomed region dimensions
              const zoomWidth = tempCanvas.width / zoomState.scale
              const zoomHeight = tempCanvas.height / zoomState.scale

              // Calculate the top-left corner of the region to draw
              // This keeps the target point centered in the view
              const sx = Math.max(0, Math.min(tempCanvas.width - zoomWidth, targetX - zoomWidth / 2))
              const sy = Math.max(0, Math.min(tempCanvas.height - zoomHeight, targetY - zoomHeight / 2))

              // Clear and draw the zoomed portion
              tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height)
              tempCtx.drawImage(
                video,
                sx, sy, zoomWidth, zoomHeight,  // Source rectangle (zoomed area)
                0, 0, tempCanvas.width, tempCanvas.height  // Destination (full canvas)
              )
            } else {
              // No zoom - draw full video
              tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height)
            }

            // Restore context state (only needed if we used save earlier)
            tempCtx.restore()

            // Apply background with the zoomed video frame
            currentBackgroundRenderer.applyBackground(
              ctx,
              tempCanvas,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            )
          } else {
            // No zoom - draw directly, much faster
            currentBackgroundRenderer.applyBackground(
              ctx,
              video,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            )
          }
        } else {
          // Video not ready - just draw background without video frame
          currentBackgroundRenderer.applyBackground(
            ctx,
            undefined, // No video frame
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
          )
        }
      } else {
        // No background renderer - clear to black
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw video if ready
        if (videoIsReady) {
          ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
        }
      }
    } catch (err) {
      // Don't clear canvas on error - keep last frame visible
    }
  }, []) // No dependencies - use refs for all changing values


  // Handle effect updates - force re-render when effects change
  useEffect(() => {
    if (isVideoLoaded) {
      console.log('🎨 Background effect changed, forcing render', {
        isPlaying,
        gradient: localEffects?.background?.gradient || selectedClip?.effects?.background?.gradient,
        localColors: localEffects?.background?.gradient?.colors,
        clipColors: selectedClip?.effects?.background?.gradient?.colors
      })
      // Force a render when effects change, whether playing or paused
      // Call directly, don't use requestAnimationFrame
      renderFrame()
    }
  }, [
    localEffects?.background?.gradient?.colors?.[0],
    localEffects?.background?.gradient?.colors?.[1],
    selectedClip?.effects?.background?.gradient?.colors?.[0], 
    selectedClip?.effects?.background?.gradient?.colors?.[1],
    isVideoLoaded, 
    renderFrame, 
    isPlaying
  ])

  // Main effect: Handle canvas and effects initialization
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    
    if (!currentRecording) {
      // No recording, reset states
      setIsVideoLoaded(false)
      setIsLoading(false)
      setLoadError(null)
      return
    }
    
    if (!video || !canvas) return
    
    // Listen for force render events
    const handleForceRender = () => {
      console.log('🔄 Force render event received, isVideoLoaded:', isVideoLoaded)
      if (isVideoLoaded) {
        // Call renderFrame directly for immediate update
        renderFrame()
      }
    }
    canvas.addEventListener('forceRender', handleForceRender)

    // Check if this is a new recording
    const isNewRecording = initializedRecordingRef.current !== currentRecording.id

    if (isNewRecording) {
      // Reset loaded state when recording changes
      setIsVideoLoaded(false)
      setIsLoading(true)
      setLoadError(null)
      initializedRecordingRef.current = currentRecording.id
    }

    // Monitor when video is ready
    const checkVideoReady = () => {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        // Only initialize once per recording
        if (!isVideoLoaded && initializedRecordingRef.current === currentRecording.id) {
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

          // Mark as loaded - effects are initialized by parent
          setIsVideoLoaded(true)
          setIsLoading(false)
        }

        // Always render frame when video is ready
        renderFrame()
      }
    }

    // Check immediately in case video is already loaded
    checkVideoReady()

    const handleVideoReady = () => {
      checkVideoReady()
    }

    // Removed handleTimeUpdate - not needed, was causing double rendering
    
    const handleError = () => {
      // Video error occurred
      setIsLoading(false)
      setLoadError('Failed to load video. The file may be corrupted or in an unsupported format.')
    }

    video.addEventListener('loadedmetadata', handleVideoReady)
    video.addEventListener('canplay', handleVideoReady)
    video.addEventListener('error', handleError)

    return () => {
      video.removeEventListener('loadedmetadata', handleVideoReady)
      video.removeEventListener('canplay', handleVideoReady)
      video.removeEventListener('error', handleError)
      canvas.removeEventListener('forceRender', handleForceRender)

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

    }
  }, [currentRecording?.id]) // Remove renderFrame dependency

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
      // When paused, stop the loop and render one final frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
      // Always render current frame when pausing
      renderFrame()
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
          video.play().catch(() => {
            // Video play failed, likely due to browser restrictions
          })
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

  // Cleanup cached canvases on unmount
  useEffect(() => {
    return () => {
      // Clean up cached canvases
      tempCanvasRef.current = null
      tempCtxRef.current = null
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          {currentRecording && (
            <>
              <canvas
                ref={canvasRef}
                className="shadow-2xl"
                style={{
                  display: isVideoLoaded ? 'block' : 'none',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  backgroundColor: '#000'
                }}
              />
              
              {/* Error state */}
              {loadError && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 max-w-md">
                    <div className="flex items-start space-x-3">
                      <svg className="w-5 h-5 text-destructive mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <h3 className="text-sm font-medium text-destructive">Failed to load video</h3>
                        <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Loading skeleton */}
              {isLoading && !isVideoLoaded && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="relative w-full max-w-4xl">
                    {/* Skeleton preview area with aspect ratio */}
                    <div className="relative aspect-video">
                      <Skeleton className="absolute inset-0 rounded-lg" />
                      
                      {/* Loading indicator overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="bg-background/80 backdrop-blur-sm rounded-lg p-6 shadow-lg">
                          <div className="flex flex-col items-center space-y-3">
                            {/* Spinner */}
                            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            
                            <div className="text-center">
                              <p className="text-sm font-medium">Loading video</p>
                              {currentRecording?.id && (
                                <p className="text-xs text-muted-foreground mt-1">{currentRecording.id}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Skeleton timeline indicator */}
                    <div className="mt-4 space-y-2">
                      <Skeleton className="h-1 w-full" />
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Video element is now managed by parent WorkspaceManager */}
          
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
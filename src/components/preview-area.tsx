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
  backgroundCanvasRef: RefObject<HTMLCanvasElement>
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
  backgroundCanvasRef,
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

  // Canvas for full composition (background + video) - used for zoom effects
  const compositionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const compositionCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  
  // Cache the main canvas context to avoid recreating it
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  
  // Track cursor canvas element
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null)

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
  const lastBackgroundEffectsRef = useRef<string>("")
  const backgroundNeedsUpdate = useRef(true)

  // Update refs when props change
  useEffect(() => {
    latestClipRef.current = selectedClip
    latestEffectsEngineRef.current = effectsEngine
    latestBackgroundRendererRef.current = backgroundRenderer
    backgroundNeedsUpdate.current = true // Mark background for update when renderer changes
    latestLocalEffectsRef.current = localEffects
  }, [selectedClip, effectsEngine, backgroundRenderer, localEffects])

  // Render background to background canvas (static, only when needed)
  const renderBackgroundOnce = useCallback(() => {
    const bgCanvas = backgroundCanvasRef.current
    const canvas = canvasRef.current
    if (!bgCanvas || !canvas) return

    const bgCtx = bgCanvas.getContext('2d')
    if (!bgCtx) return

    // Match background canvas size to main canvas
    if (bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
      bgCanvas.width = canvas.width
      bgCanvas.height = canvas.height
    }

    // Clear background canvas first
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)

    // Get background renderer
    const currentBackgroundRenderer = latestBackgroundRendererRef.current
    if (!currentBackgroundRenderer) {
      // No background renderer - fill with black
      bgCtx.fillStyle = '#000'
      bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height)
      return
    }

    // Use localEffects if available, otherwise use clip effects
    const currentLocalEffects = latestLocalEffectsRef.current
    const currentClip = latestClipRef.current
    const effectsToUse = currentLocalEffects || currentClip?.effects

    // Get background options from effects
    const clipBg = effectsToUse?.background || {
      type: 'gradient',
      gradient: { colors: ['#0F172A', '#1E293B'], angle: 135 },
      padding: 80
    }

    // Get video effects (shadow) from localEffects or clip
    const videoEffects = effectsToUse?.video
    
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
      borderRadius: 16,
      // Include shadow settings from video effects
      shadow: videoEffects?.shadow ? {
        enabled: videoEffects.shadow.enabled,
        color: videoEffects.shadow.color || 'rgba(0, 0, 0, 0.5)',
        blur: videoEffects.shadow.blur || 40,
        offsetX: videoEffects.shadow.offset?.x || 0,
        offsetY: videoEffects.shadow.offset?.y || 20,
        spread: 0
      } : undefined
    }

    // Update background renderer options
    currentBackgroundRenderer.updateOptions(bgOptions)

    // Apply background without video (just the background)
    currentBackgroundRenderer.applyBackground(bgCtx, undefined, 0, 0, bgCanvas.width, bgCanvas.height)

    // Mark background as updated
    backgroundNeedsUpdate.current = false
  }, [backgroundCanvasRef, canvasRef])

  // Main rendering function - now stable, doesn't depend on changing props
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    const bgCanvas = backgroundCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    // Get or reuse the cached context
    if (!canvasCtxRef.current) {
      canvasCtxRef.current = canvas.getContext('2d', {
        alpha: true,
        desynchronized: true
      })
    }
    const ctx = canvasCtxRef.current
    if (!ctx) return

    const currentTimeMs = video.currentTime * 1000

    // Check if background needs update
    if (backgroundNeedsUpdate.current) {
      renderBackgroundOnce()
    }


    // Reset context state to prevent accumulation of transforms/clipping
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    try {
      // Use refs for latest values without recreating callback
      const currentClip = latestClipRef.current
      const currentBackgroundRenderer = latestBackgroundRendererRef.current
      const currentEffectsEngine = latestEffectsEngineRef.current
      const currentLocalEffects = latestLocalEffectsRef.current

      // Use localEffects if available, otherwise use clip effects
      const effectsToUse = currentLocalEffects || currentClip?.effects

      // Calculate video dimensions with padding
      const padding = effectsToUse?.background?.padding || 80

      // Check if video has valid dimensions
      const videoIsReady = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
      
      const videoAspect = videoIsReady ? (video.videoWidth / video.videoHeight) : (canvas.width / canvas.height)
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



      // Update cursor renderer and manage cursor canvas
      if (cursorRenderer && videoIsReady) {
        cursorRenderer.updateVideoPosition(offsetX, offsetY, drawWidth, drawHeight)
        
        // Get the cursor canvas from the renderer
        const cursorCanvas = cursorRenderer.canvasElement
        
        // Attach cursor canvas if we have one and it's not already attached
        if (cursorCanvas && cursorCanvas !== cursorCanvasRef.current) {
          const parentElement = canvas.parentElement
          
          if (parentElement) {
            // Remove old cursor canvas if exists
            if (cursorCanvasRef.current && cursorCanvasRef.current.parentElement) {
              cursorCanvasRef.current.remove()
            }
            
            // Set up the cursor canvas with proper dimensions and positioning
            cursorCanvas.width = canvas.width
            cursorCanvas.height = canvas.height
            cursorCanvas.style.position = 'absolute'
            cursorCanvas.style.top = '0'
            cursorCanvas.style.left = '0'
            cursorCanvas.style.width = canvas.style.width || ''
            cursorCanvas.style.height = canvas.style.height || ''
            cursorCanvas.style.maxWidth = '100%'
            cursorCanvas.style.maxHeight = '100%'
            cursorCanvas.style.objectFit = 'contain'
            cursorCanvas.style.pointerEvents = 'none'
            cursorCanvas.style.zIndex = '100'
            
            // Ensure parent has relative positioning
            parentElement.style.position = 'relative'
            
            // Append cursor canvas to DOM
            parentElement.appendChild(cursorCanvas)
            cursorCanvasRef.current = cursorCanvas
          }
        } else if (cursorCanvasRef.current) {
          // Update dimensions if canvas already attached
          if (cursorCanvasRef.current.width !== canvas.width || 
              cursorCanvasRef.current.height !== canvas.height) {
            cursorCanvasRef.current.width = canvas.width
            cursorCanvasRef.current.height = canvas.height
            cursorCanvasRef.current.style.width = canvas.style.width || ''
            cursorCanvasRef.current.style.height = canvas.style.height || ''
          }
        }
      }

      // Check if background needs update by comparing effects
      const effectsString = JSON.stringify(effectsToUse?.background)
      if (effectsString !== lastBackgroundEffectsRef.current) {
        backgroundNeedsUpdate.current = true
        lastBackgroundEffectsRef.current = effectsString
        renderBackgroundOnce()
      }

      // Only clear and redraw if we can actually draw the video
      // This prevents blank frames when video state temporarily changes
      if (videoIsReady && currentBackgroundRenderer && video.src && !video.error) {
        // Check if we have zoom effects
        const hasZoomEffect = effectsToUse?.zoom?.enabled && currentEffectsEngine
        
        if (hasZoomEffect && currentEffectsEngine) {
          // Create or reuse composition canvas for full scene (background + video)
          if (!compositionCanvasRef.current ||
            compositionCanvasRef.current.width !== canvas.width ||
            compositionCanvasRef.current.height !== canvas.height) {
            compositionCanvasRef.current = document.createElement('canvas')
            compositionCanvasRef.current.width = canvas.width
            compositionCanvasRef.current.height = canvas.height
            compositionCtxRef.current = compositionCanvasRef.current.getContext('2d', {
              alpha: false,
              desynchronized: true
            })
          }

          const compCanvas = compositionCanvasRef.current
          const compCtx = compositionCtxRef.current!

          // Reset composition context state
          compCtx.globalAlpha = 1
          compCtx.globalCompositeOperation = 'source-over'
          compCtx.setTransform(1, 0, 0, 1, 0, 0)
          
          // Draw full composition: background first
          compCtx.clearRect(0, 0, compCanvas.width, compCanvas.height)
          if (bgCanvas && bgCanvas.width === compCanvas.width && bgCanvas.height === compCanvas.height) {
            compCtx.drawImage(bgCanvas, 0, 0)
          }
          
          // Draw video on top of background with border radius
          compCtx.save()
          compCtx.beginPath()
          compCtx.roundRect(offsetX, offsetY, drawWidth, drawHeight, 16)
          compCtx.clip()
          compCtx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
          compCtx.restore()

          // Now apply zoom to the entire composition
          const clipRelativeTime = currentTimeMs - (currentClip?.sourceIn || 0)
          const zoomState = currentEffectsEngine.getZoomState(clipRelativeTime)

          // Clear main canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height)

          if (zoomState.scale > 1.0) {
            // Calculate the zoom target point in canvas space
            const targetX = canvas.width * zoomState.x
            const targetY = canvas.height * zoomState.y

            // Calculate the zoomed region dimensions
            const zoomWidth = canvas.width / zoomState.scale
            const zoomHeight = canvas.height / zoomState.scale

            // Calculate the top-left corner of the region to draw
            // This keeps the target point centered in the view
            const sx = Math.max(0, Math.min(canvas.width - zoomWidth, targetX - zoomWidth / 2))
            const sy = Math.max(0, Math.min(canvas.height - zoomHeight, targetY - zoomHeight / 2))

            // Draw the zoomed portion of the full composition
            ctx.drawImage(
              compCanvas,
              sx, sy, zoomWidth, zoomHeight,  // Source rectangle (zoomed area of composition)
              0, 0, canvas.width, canvas.height  // Destination (full canvas)
            )
          } else {
            // No zoom - draw full composition
            ctx.drawImage(compCanvas, 0, 0)
          }
        } else {
          // No zoom effects - use original rendering path
          // Clear canvas and draw background
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          
          if (bgCanvas && bgCanvas.width === canvas.width && bgCanvas.height === canvas.height) {
            ctx.drawImage(bgCanvas, 0, 0)
          }
          
          // Draw video directly with border radius
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(offsetX, offsetY, drawWidth, drawHeight, 16)
          ctx.clip()
          ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
          ctx.restore()
        }
      }
    } catch (err) {
      console.error('Preview render error:', err)
    }
  }, [backgroundCanvasRef, renderBackgroundOnce]) // Only stable deps


  // Handle effect updates - force re-render when effects change
  useEffect(() => {
    if (isVideoLoaded) {
      // Mark background for update and force a render
      backgroundNeedsUpdate.current = true
      renderFrame()
    }
  }, [
    localEffects?.background?.gradient?.colors?.[0],
    localEffects?.background?.gradient?.colors?.[1],
    selectedClip?.effects?.background?.gradient?.colors?.[0],
    selectedClip?.effects?.background?.gradient?.colors?.[1],
    localEffects?.background?.type,
    selectedClip?.effects?.background?.type,
    localEffects?.background?.padding,
    selectedClip?.effects?.background?.padding,
    // Shadow effect dependencies
    localEffects?.video?.shadow?.enabled,
    selectedClip?.effects?.video?.shadow?.enabled,
    localEffects?.video?.shadow?.blur,
    selectedClip?.effects?.video?.shadow?.blur,
    localEffects?.video?.shadow?.offset?.y,
    selectedClip?.effects?.video?.shadow?.offset?.y,
    isVideoLoaded,
    renderFrame
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
      if (isVideoLoaded) {
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
          
          // Reset cached context when canvas size changes
          canvasCtxRef.current = null
          
          // Mark as loaded - effects are initialized by parent
          setIsVideoLoaded(true)
          setIsLoading(false)

          // Render initial background and frame immediately
          backgroundNeedsUpdate.current = true
          
          // Force immediate render
          requestAnimationFrame(() => {
            renderFrame()
          })
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

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }


    if (isPlaying) {
      const animate = () => {
        if (!isPlaying) return
        
        renderFrame()
        
        animationFrameRef.current = requestAnimationFrame(animate)
      }
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      // Render current frame when paused
      renderFrame()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
    }
  }, [isPlaying, isVideoLoaded, renderFrame])
  
  // Force render when video becomes loaded
  useEffect(() => {
    if (isVideoLoaded) {
      renderFrame()
    }
  }, [isVideoLoaded, renderFrame])

  // Handle video element play/pause state - sync is handled by workspace-manager
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || !selectedClip) return

    // Let workspace-manager handle the sync logic to avoid conflicts
    // This component just responds to play/pause state
    if (!isPlaying) {
      video.pause()
    }
  }, [isPlaying, isVideoLoaded, selectedClip])

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

  }, [isPlaying, isVideoLoaded, selectedClip])

  // Cleanup cached canvases on unmount
  useEffect(() => {
    return () => {
      // Clean up composition canvas
      compositionCanvasRef.current = null
      compositionCtxRef.current = null
      
      // Clean up cursor canvas
      if (cursorCanvasRef.current && cursorCanvasRef.current.parentElement) {
        cursorCanvasRef.current.remove()
        cursorCanvasRef.current = null
      }

      // Cancel any pending animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full flex items-center justify-center">
          {currentRecording && (
            <>
              {/* Background canvas (static layer) */}
              <canvas
                ref={backgroundCanvasRef}
                className="absolute"
                style={{
                  display: 'none', // Hidden, only used for compositing
                  pointerEvents: 'none'
                }}
              />

              {/* Main canvas (video + effects) */}
              <canvas
                ref={canvasRef}
                className="shadow-2xl"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
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
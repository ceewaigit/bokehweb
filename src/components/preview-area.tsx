"use client"

import { useRef, useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { EffectsEngine } from '@/lib/effects/effects-engine'
import { BackgroundRenderer } from '@/lib/effects/background-renderer'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Play, Pause, RotateCcw, Eye, EyeOff, SkipBack, SkipForward } from 'lucide-react'

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const effectsEngineRef = useRef<EffectsEngine | null>(null)
  const backgroundRendererRef = useRef<BackgroundRenderer | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [showEffects, setShowEffects] = useState(true)

  const {
    currentProject,
    currentTime,
    isPlaying,
    play,
    pause,
    seek,
    getCurrentClip,
    getCurrentRecording,
    selectedClips
  } = useProjectStore()

  // Get current clip and recording
  const currentClip = getCurrentClip()
  const currentRecording = getCurrentRecording() || currentProject?.recordings?.[0]

  // Get video source
  const videoSource = currentClip
    ? RecordingStorage.getBlobUrl(currentClip.recordingId)
    : currentRecording
      ? RecordingStorage.getBlobUrl(currentRecording.id)
      : null

  // Get selected clip for effects
  const selectedClip = selectedClips.length > 0 && currentProject
    ? currentProject.timeline.tracks
      .flatMap(t => t.clips)
      .find(c => c.id === selectedClips[0])
    : null

  // Initialize effects engine and background renderer
  const initializeEffects = useCallback(() => {
    if (!currentRecording || !showEffects) {
      effectsEngineRef.current = null
      backgroundRendererRef.current = null
      return
    }

    // Get padding from clip effects
    const padding = selectedClip?.effects?.background?.padding ?? 80

    // Initialize effects engine with padding
    if (!effectsEngineRef.current) {
      const engine = new EffectsEngine()
      engine.initializeFromRecording(currentRecording, undefined, padding)
      effectsEngineRef.current = engine
    }

    // Initialize background renderer
    const bgOptions = {
      type: (selectedClip?.effects?.background?.type as any) || 'gradient',
      gradient: {
        type: 'linear' as const,
        colors: selectedClip?.effects?.background?.gradient?.colors || ['#1e293b', '#0f172a'],
        angle: selectedClip?.effects?.background?.gradient?.angle || 135
      },
      padding: selectedClip?.effects?.background?.padding ?? 80,
      borderRadius: selectedClip?.effects?.video?.cornerRadius ?? 24,
      shadow: {
        enabled: selectedClip?.effects?.video?.shadow?.enabled ?? true,
        color: selectedClip?.effects?.video?.shadow?.color || 'rgba(0, 0, 0, 0.5)',
        blur: selectedClip?.effects?.video?.shadow?.blur ?? 60,
        offsetX: selectedClip?.effects?.video?.shadow?.offset?.x ?? 0,
        offsetY: selectedClip?.effects?.video?.shadow?.offset?.y ?? 25
      }
    }

    if (!backgroundRendererRef.current) {
      backgroundRendererRef.current = new BackgroundRenderer(bgOptions)
    } else {
      backgroundRendererRef.current.updateOptions(bgOptions)
    }
  }, [currentRecording, selectedClip, showEffects])

  // Render frame
  const renderFrame = useCallback((forceTime?: number) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    
    // Allow rendering even if isVideoLoaded is false if we're forcing a specific time
    if (!video || !canvas || (!isVideoLoaded && forceTime === undefined)) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const timeMs = forceTime !== undefined ? forceTime : video.currentTime * 1000

    if (showEffects && effectsEngineRef.current && backgroundRendererRef.current) {
      // Get effect state
      const effectState = effectsEngineRef.current.getEffectState(timeMs)

      // Create temp canvas for video with effects
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')

      if (tempCtx && effectState.zoom) {
        // Apply zoom to temp canvas
        effectsEngineRef.current.applyZoomToCanvas(tempCtx, video, effectState.zoom, timeMs)

        // Clear main canvas and apply background with video
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        backgroundRendererRef.current.applyBackground(ctx, tempCanvas)
      } else if (tempCtx) {
        // No zoom effect, just draw video normally
        tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        backgroundRendererRef.current.applyBackground(ctx, tempCanvas)
      }
    } else {
      // No effects - draw video directly
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }
  }, [isVideoLoaded, showEffects])

  // Animation loop
  const startAnimation = useCallback(() => {
    const animate = () => {
      renderFrame()
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    animate()
  }, [renderFrame])

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Load video
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSource) {
      setIsVideoLoaded(false)
      return
    }

    if (video.src === videoSource) return

    video.src = videoSource
    video.load()

    const handleLoadedData = async () => {
      console.log('Video loaded, initializing...')
      setIsVideoLoaded(true)
      
      // Initialize canvas
      if (canvasRef.current && video.videoWidth && video.videoHeight) {
        canvasRef.current.width = video.videoWidth
        canvasRef.current.height = video.videoHeight
      }
      
      // Initialize effects first
      if (!effectsEngineRef.current && currentRecording) {
        // Get padding from clip effects
        const padding = selectedClip?.effects?.background?.padding ?? 80
        
        const engine = new EffectsEngine()
        engine.initializeFromRecording(currentRecording, undefined, padding)
        effectsEngineRef.current = engine
      }
      
      // Initialize background with proper clip effects or defaults
      const bgOptions = {
        type: (selectedClip?.effects?.background?.type as any) || 'gradient',
        gradient: {
          type: 'linear' as const,
          colors: selectedClip?.effects?.background?.gradient?.colors || ['#f3f4f6', '#e5e7eb'],
          angle: selectedClip?.effects?.background?.gradient?.angle || 135
        },
        padding: selectedClip?.effects?.background?.padding ?? 80,
        borderRadius: selectedClip?.effects?.video?.cornerRadius ?? 24,
        shadow: {
          enabled: selectedClip?.effects?.video?.shadow?.enabled ?? true,
          color: selectedClip?.effects?.video?.shadow?.color || 'rgba(0, 0, 0, 0.5)',
          blur: selectedClip?.effects?.video?.shadow?.blur ?? 60,
          offsetX: selectedClip?.effects?.video?.shadow?.offset?.x ?? 0,
          offsetY: selectedClip?.effects?.video?.shadow?.offset?.y ?? 25
        }
      }
      
      if (!backgroundRendererRef.current) {
        backgroundRendererRef.current = new BackgroundRenderer(bgOptions)
      } else {
        backgroundRendererRef.current.updateOptions(bgOptions)
      }
      
      // Force render first frame immediately
      const renderInitialFrame = () => {
        console.log('Rendering initial frame...', {
          readyState: video.readyState,
          currentTime: video.currentTime,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        })
        
        // Ensure canvas and video dimensions match
        if (canvasRef.current && video.videoWidth && video.videoHeight) {
          canvasRef.current.width = video.videoWidth
          canvasRef.current.height = video.videoHeight
          
          const ctx = canvasRef.current.getContext('2d')
          if (ctx) {
            // Clear and render
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            
            if (showEffects && backgroundRendererRef.current) {
              // Create temp canvas for video
              const tempCanvas = document.createElement('canvas')
              tempCanvas.width = video.videoWidth
              tempCanvas.height = video.videoHeight
              const tempCtx = tempCanvas.getContext('2d')
              
              if (tempCtx) {
                // Draw video to temp canvas
                tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height)
                // Apply background with video
                backgroundRendererRef.current.applyBackground(ctx, tempCanvas)
              }
            } else {
              // Draw video directly
              ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height)
            }
          }
        }
      }
      
      // Ensure video is at the start
      video.currentTime = 0
      
      // Try multiple strategies to ensure first frame renders
      
      // Strategy 1: If video is ready (has enough data), render immediately
      if (video.readyState >= 3) {
        console.log('Video ready, rendering immediately')
        renderInitialFrame()
      } else {
        // Strategy 2: Wait for canplay event which guarantees we can render
        video.addEventListener('canplay', () => {
          console.log('Video can play, rendering')
          renderInitialFrame()
        }, { once: true })
        
        // Strategy 3: Also listen for seeked in case we're already ready
        video.addEventListener('seeked', () => {
          console.log('Video seeked, rendering')
          renderInitialFrame()
        }, { once: true })
      }
      
      // Strategy 4: Fallback with timeout to ensure something renders
      setTimeout(() => {
        console.log('Timeout fallback, forcing render')
        renderInitialFrame()
      }, 500)
    }
    
    const handleLoadedMetadata = () => {
      // Also trigger on metadata load as a backup
      if (video.videoWidth && video.videoHeight) {
        handleLoadedData()
      }
    }

    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    
    return () => {
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [videoSource, renderFrame, currentRecording])

  // Initialize effects when video loads or settings change
  useEffect(() => {
    if (isVideoLoaded) {
      initializeEffects()
      // Small delay to ensure effects are initialized
      setTimeout(() => {
        renderFrame() // Draw initial frame with effects
      }, 100)
    }
  }, [isVideoLoaded, initializeEffects, renderFrame])

  // Update background and re-initialize effects when settings change
  useEffect(() => {
    if (!selectedClip || isPlaying) return
    
    // Update background renderer options
    if (backgroundRendererRef.current) {
      const bgOptions = {
        type: (selectedClip.effects?.background?.type as any) || 'gradient',
        gradient: {
          type: 'linear' as const,
          colors: selectedClip.effects?.background?.gradient?.colors || ['#f3f4f6', '#e5e7eb'],
          angle: selectedClip.effects?.background?.gradient?.angle || 135
        },
        padding: selectedClip.effects?.background?.padding ?? 80,
        borderRadius: selectedClip.effects?.video?.cornerRadius ?? 24,
        shadow: {
          enabled: selectedClip.effects?.video?.shadow?.enabled ?? true,
          color: selectedClip.effects?.video?.shadow?.color || 'rgba(0, 0, 0, 0.5)',
          blur: selectedClip.effects?.video?.shadow?.blur ?? 60,
          offsetX: selectedClip.effects?.video?.shadow?.offset?.x ?? 0,
          offsetY: selectedClip.effects?.video?.shadow?.offset?.y ?? 25
        }
      }
      backgroundRendererRef.current.updateOptions(bgOptions)
    }
    
    // Re-initialize effects engine with new padding
    if (effectsEngineRef.current && currentRecording) {
      const padding = selectedClip.effects?.background?.padding ?? 80
      effectsEngineRef.current.initializeFromRecording(currentRecording, undefined, padding)
    }
    
    // Force re-render
    renderFrame()
  }, [
    selectedClip?.effects?.background,
    selectedClip?.effects?.video?.cornerRadius,
    selectedClip?.effects?.video?.shadow,
    isPlaying, 
    renderFrame,
    currentRecording
  ])

  // Handle playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    // Update timeline time during playback
    const handleTimeUpdate = () => {
      const clip = getCurrentClip()
      if (clip && isPlaying) {
        // Convert video time to timeline time
        const timelineTime = clip.startTime + (video.currentTime * 1000 - clip.sourceIn)
        seek(timelineTime)
      }
    }

    if (isPlaying) {
      video.play()
      startAnimation()
      video.addEventListener('timeupdate', handleTimeUpdate)
    } else {
      video.pause()
      stopAnimation()
      renderFrame() // Draw final frame
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }

    return () => {
      stopAnimation()
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [isPlaying, isVideoLoaded, startAnimation, stopAnimation, renderFrame, getCurrentClip, seek])

  // Sync video time with timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded || isPlaying) return

    const clip = getCurrentClip()
    if (clip) {
      const videoTime = (currentTime - clip.startTime + clip.sourceIn) / 1000
      if (Math.abs(video.currentTime - videoTime) > 0.1) {
        video.currentTime = videoTime
        renderFrame(videoTime * 1000)
      }
    }
  }, [currentTime, isVideoLoaded, isPlaying, getCurrentClip, renderFrame])

  // Controls
  const handleRewind = () => seek(0)
  const handleSkipBack = () => seek(Math.max(0, currentTime - 5000))
  const handleSkipForward = () => {
    const duration = currentProject?.timeline?.duration || 10000
    seek(Math.min(duration, currentTime + 5000))
  }

  return (
    <div className="bg-card border-b border-border flex flex-col">
      {/* Preview Container */}
      <div ref={containerRef} className="h-[500px] relative bg-muted/20 flex items-center justify-center overflow-hidden">
        {videoSource ? (
          <>
            <video
              ref={videoRef}
              className="hidden"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="w-auto h-full object-contain"
              style={{ 
                display: isVideoLoaded ? 'block' : 'none',
                maxWidth: '90%',
                maxHeight: '90%'
              }}
            />
            {!isVideoLoaded && (
              <div className="text-sm text-muted-foreground">Loading video...</div>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No recording selected</p>
            <p className="text-xs text-muted-foreground">Record or import a video to get started</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-16 px-4 flex items-center justify-between border-t border-border bg-background/95">
        <div className="flex items-center space-x-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRewind}
            disabled={!videoSource}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSkipBack}
            disabled={!videoSource}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={isPlaying ? pause : play}
            disabled={!videoSource}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSkipForward}
            disabled={!videoSource}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant={showEffects ? "default" : "ghost"}
            onClick={() => setShowEffects(!showEffects)}
          >
            {showEffects ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            Effects
          </Button>
        </div>
      </div>
    </div>
  )
}
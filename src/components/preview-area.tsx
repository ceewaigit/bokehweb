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

    // Initialize effects engine
    if (!effectsEngineRef.current) {
      const engine = new EffectsEngine()
      engine.initializeFromRecording(currentRecording)
      effectsEngineRef.current = engine
    }

    // Initialize background renderer
    const bgOptions = {
      type: (selectedClip?.effects?.background?.type as any) || 'gradient',
      gradient: {
        type: 'linear' as const,
        colors: selectedClip?.effects?.background?.gradient?.colors || ['#667eea', '#764ba2'],
        angle: selectedClip?.effects?.background?.gradient?.angle || 135
      },
      padding: selectedClip?.effects?.background?.padding || 120,  // Increased padding for better background visibility
      borderRadius: selectedClip?.effects?.video?.cornerRadius || 16,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.3)',
        blur: 40,
        offsetX: 0,
        offsetY: 20
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
    if (!video || !canvas || !isVideoLoaded) return

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
      setIsVideoLoaded(true)
      // Initialize canvas
      if (canvasRef.current && video.videoWidth && video.videoHeight) {
        canvasRef.current.width = video.videoWidth
        canvasRef.current.height = video.videoHeight
      }
      
      // Force render first frame immediately
      try {
        // Seek to first frame
        video.currentTime = 0.001
        await new Promise(r => setTimeout(r, 50))
        
        // Trigger initial render
        if (renderFrame) {
          renderFrame(0)
        }
      } catch (err) {
        console.log('Could not render initial frame:', err)
      }
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
  }, [videoSource, renderFrame])

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

  // Update background when settings change
  useEffect(() => {
    if (backgroundRendererRef.current && selectedClip && !isPlaying) {
      const bgOptions = {
        type: (selectedClip.effects?.background?.type as any) || 'gradient',
        gradient: {
          type: 'linear' as const,
          colors: selectedClip.effects?.background?.gradient?.colors || ['#667eea', '#764ba2'],
          angle: selectedClip.effects?.background?.gradient?.angle || 135
        },
        padding: selectedClip.effects?.background?.padding || 120,  // Increased padding for better background visibility
        borderRadius: selectedClip.effects?.video?.cornerRadius || 16,
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.3)',
          blur: 40,
          offsetX: 0,
          offsetY: 20
        }
      }
      backgroundRendererRef.current.updateOptions(bgOptions)
      renderFrame() // Re-render with new settings
    }
  }, [selectedClip, isPlaying, renderFrame])

  // Handle playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideoLoaded) return

    if (isPlaying) {
      video.play()
      startAnimation()
    } else {
      video.pause()
      stopAnimation()
      renderFrame() // Draw final frame
    }

    return () => stopAnimation()
  }, [isPlaying, isVideoLoaded, startAnimation, stopAnimation, renderFrame])

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
    <div className="h-full bg-card border-b border-border flex flex-col">
      {/* Preview Container - constrained height */}
      <div ref={containerRef} className="h-[300px] relative bg-muted/20 flex items-center justify-center overflow-hidden">
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
/**
 * Post-processing effects system for applying Screen Studio-style effects
 * Takes raw video + metadata and outputs enhanced video with smooth zoom, cursor effects, etc.
 */

import type { RecordingMetadata } from './metadata-collector'
import type { EnhancementSettings } from './screen-recorder'

export interface EffectsResult {
  enhancedVideo: Blob
  processingTime: number
  effectsApplied: string[]
}

export interface ProcessingProgress {
  phase: 'initializing' | 'processing' | 'finalizing' | 'complete'
  progress: number // 0-100
  currentFrame?: number
  totalFrames?: number
  message?: string
}

export interface ZoomKeyframe {
  timestamp: number
  x: number
  y: number
  scale: number
  easing: 'ease-out' | 'ease-in-out' | 'linear'
}

export interface ClickEffect {
  timestamp: number
  x: number
  y: number
  intensity: number
}

export class EffectsProcessor {
  private canvas: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private video: HTMLVideoElement | null = null
  private isProcessing = false
  private progressCallback: ((progress: ProcessingProgress) => void) | null = null

  constructor() {
    console.log('🎨 EffectsProcessor initialized')
  }

  setProgressCallback(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallback = callback
  }

  private reportProgress(progress: ProcessingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress)
    }
  }

  async processVideo(
    videoBlob: Blob,
    metadata: RecordingMetadata[],
    settings: EnhancementSettings,
    estimatedDurationMs?: number
  ): Promise<EffectsResult> {
    if (this.isProcessing) {
      throw new Error('Already processing video')
    }

    this.isProcessing = true
    const startTime = performance.now()
    const effectsApplied: string[] = []

    try {
      console.log(`🎬 Starting effects processing: ${metadata.length} metadata events`)
      
      this.reportProgress({ phase: 'initializing', progress: 0, message: 'Setting up video processing...' })
      
      // Setup video and canvas
      await this.setupProcessing(videoBlob, estimatedDurationMs)
      
      this.reportProgress({ phase: 'initializing', progress: 25, message: 'Analyzing mouse movement...' })
      
      // Generate effects data from metadata
      const zoomKeyframes = this.generateZoomKeyframes(metadata, settings)
      const clickEffects = this.generateClickEffects(metadata, settings)
      
      console.log(`📊 Generated ${zoomKeyframes.length} zoom keyframes, ${clickEffects.length} click effects`)

      this.reportProgress({ phase: 'initializing', progress: 50, message: 'Processing video with effects...' })

      // FAST MODE: Apply effects and create enhanced video
      const enhancedVideo = await this.renderEnhancedVideo(
        zoomKeyframes,
        clickEffects,
        settings,
        effectsApplied,
        estimatedDurationMs
      )

      const processingTime = performance.now() - startTime
      console.log(`✨ Effects processing complete: ${processingTime.toFixed(2)}ms`)

      this.reportProgress({ phase: 'complete', progress: 100, message: 'Effects applied successfully!' })

      return {
        enhancedVideo,
        processingTime,
        effectsApplied
      }

    } catch (error) {
      console.error('❌ Effects processing failed:', error)
      console.log('🔄 Falling back to original video')
      
      // Ensure cleanup happens even on error
      try {
        this.cleanup()
      } catch (cleanupError) {
        console.error('⚠️ Cleanup failed:', cleanupError)
      }
      
      // Return original video as fallback
      return {
        enhancedVideo: videoBlob,
        processingTime: performance.now() - startTime,
        effectsApplied: ['fallback-original']
      }
    } finally {
      // Always ensure cleanup and reset processing state
      try {
        this.cleanup()
      } catch (cleanupError) {
        console.error('⚠️ Final cleanup failed:', cleanupError)
      }
      this.isProcessing = false
    }
  }

  private async setupProcessing(videoBlob: Blob, estimatedDurationMs?: number): Promise<void> {
    // Create video element
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.preload = 'metadata'
    
    // Load video
    const videoUrl = URL.createObjectURL(videoBlob)
    this.video.src = videoUrl
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(videoUrl)
        reject(new Error('Video loading timeout'))
      }, 10000) // 10 second timeout
      
      this.video!.onloadedmetadata = () => {
        clearTimeout(timeout)
        
        console.log(`📹 Video loaded: ${this.video!.videoWidth}x${this.video!.videoHeight}, duration: ${this.video!.duration}s`)
        
        // Validate video dimensions
        if (!this.video!.videoWidth || !this.video!.videoHeight) {
          URL.revokeObjectURL(videoUrl)
          reject(new Error('Invalid video dimensions'))
          return
        }
        
        // Handle invalid duration with fallback
        if (!isFinite(this.video!.duration) || this.video!.duration <= 0) {
          if (estimatedDurationMs && estimatedDurationMs > 0) {
            // Use estimated duration as fallback
            // Store estimated duration for later use
            (this.video as any)._estimatedDuration = estimatedDurationMs / 1000
          } else {
            URL.revokeObjectURL(videoUrl)
            reject(new Error(`Invalid video duration: ${this.video!.duration}`))
            return
          }
        }
        
        // Create canvas matching video dimensions
        this.canvas = document.createElement('canvas')
        this.canvas.width = this.video!.videoWidth
        this.canvas.height = this.video!.videoHeight
        this.context = this.canvas.getContext('2d')!
        
        // Don't revoke URL yet - keep it for processing
        resolve()
      }
      
      this.video!.onerror = (error) => {
        clearTimeout(timeout)
        URL.revokeObjectURL(videoUrl)
        reject(new Error(`Failed to load video: ${error}`))
      }
    })
  }

  private generateZoomKeyframes(
    metadata: RecordingMetadata[],
    settings: EnhancementSettings
  ): ZoomKeyframe[] {
    if (!settings.enableAutoZoom) return []

    const keyframes: ZoomKeyframe[] = []
    const sensitivity = settings.zoomSensitivity || 1
    const maxZoom = settings.maxZoom || 2.5
    const smoothingWindow = 500 // ms

    // Group metadata by time windows for smoothing
    const timeWindows = this.groupMetadataByTimeWindows(metadata, smoothingWindow)
    
    for (const window of timeWindows) {
      const avgPosition = this.calculateAveragePosition(window.events)
      const movement = this.calculateMovementIntensity(window.events)
      
      // Calculate zoom based on movement intensity
      const zoomLevel = Math.min(1 + (movement * sensitivity), maxZoom)
      
      keyframes.push({
        timestamp: window.timestamp,
        x: avgPosition.x,
        y: avgPosition.y,
        scale: zoomLevel,
        easing: 'ease-out'
      })
    }

    // Smooth zoom transitions
    return this.smoothZoomKeyframes(keyframes)
  }

  private generateClickEffects(
    metadata: RecordingMetadata[],
    settings: EnhancementSettings
  ): ClickEffect[] {
    if (!settings.showClickEffects) return []

    return metadata
      .filter(event => event.eventType === 'click')
      .map(click => ({
        timestamp: click.timestamp,
        x: click.mouseX,
        y: click.mouseY,
        intensity: 1.0
      }))
  }

  private groupMetadataByTimeWindows(
    metadata: RecordingMetadata[],
    windowSize: number
  ): Array<{ timestamp: number; events: RecordingMetadata[] }> {
    const windows: Array<{ timestamp: number; events: RecordingMetadata[] }> = []
    let currentWindow: RecordingMetadata[] = []
    let windowStart = 0

    for (const event of metadata) {
      if (event.timestamp - windowStart > windowSize) {
        if (currentWindow.length > 0) {
          windows.push({
            timestamp: windowStart + windowSize / 2,
            events: [...currentWindow]
          })
        }
        currentWindow = [event]
        windowStart = event.timestamp
      } else {
        currentWindow.push(event)
      }
    }

    // Add final window
    if (currentWindow.length > 0) {
      windows.push({
        timestamp: windowStart + windowSize / 2,
        events: currentWindow
      })
    }

    return windows
  }

  private calculateAveragePosition(events: RecordingMetadata[]): { x: number; y: number } {
    if (events.length === 0) return { x: 0, y: 0 }

    const sum = events.reduce(
      (acc, event) => ({
        x: acc.x + event.mouseX,
        y: acc.y + event.mouseY
      }),
      { x: 0, y: 0 }
    )

    return {
      x: sum.x / events.length,
      y: sum.y / events.length
    }
  }

  private calculateMovementIntensity(events: RecordingMetadata[]): number {
    if (events.length < 2) return 0

    let totalDistance = 0
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]
      const curr = events[i]
      const distance = Math.sqrt(
        Math.pow(curr.mouseX - prev.mouseX, 2) + 
        Math.pow(curr.mouseY - prev.mouseY, 2)
      )
      totalDistance += distance
    }

    // Normalize to 0-1 range (adjust divisor based on expected movement)
    return Math.min(totalDistance / 1000, 1)
  }

  private smoothZoomKeyframes(keyframes: ZoomKeyframe[]): ZoomKeyframe[] {
    if (keyframes.length < 3) return keyframes

    // Apply smoothing to reduce jittery zoom changes
    for (let i = 1; i < keyframes.length - 1; i++) {
      const prev = keyframes[i - 1]
      const curr = keyframes[i]
      const next = keyframes[i + 1]

      // Smooth scale using weighted average
      curr.scale = (prev.scale * 0.25 + curr.scale * 0.5 + next.scale * 0.25)
    }

    return keyframes
  }

  private async renderEnhancedVideo(
    zoomKeyframes: ZoomKeyframe[],
    clickEffects: ClickEffect[],
    settings: EnhancementSettings,
    effectsApplied: string[],
    estimatedDurationMs?: number
  ): Promise<Blob> {
    if (!this.video || !this.canvas || !this.context) {
      throw new Error('Video processing not properly initialized')
    }

    // Create MediaRecorder for output
    const stream = this.canvas.captureStream(10) // Match processing framerate
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8', // Use VP8 for faster encoding
      videoBitsPerSecond: 1000000 // Reduced to 1 Mbps for fastest processing
    })

    const chunks: Blob[] = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    // Start recording enhanced video
    mediaRecorder.start()
    effectsApplied.push('video-recording-started')

    try {
      // Start processing with timeout protection
      const maxProcessingTime = 30000 // 30 seconds max processing time
      
      // Process frames with timeout protection
      const frameProcessingPromise = this.processFrames(zoomKeyframes, clickEffects, settings, effectsApplied)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Frame processing timeout')), maxProcessingTime)
      })
      
      await Promise.race([frameProcessingPromise, timeoutPromise])
      
      // Stop recording and wait for final blob
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          mediaRecorder.stop()
          reject(new Error('MediaRecorder stop timeout'))
        }, 5000) // 5 second timeout for stopping
        
        mediaRecorder.onstop = () => {
          clearTimeout(timeout)
          const enhancedBlob = new Blob(chunks, { type: 'video/webm' })
          console.log(`📹 Enhanced video created: ${enhancedBlob.size} bytes`)
          resolve(enhancedBlob)
        }
        
        mediaRecorder.onerror = (error) => {
          clearTimeout(timeout)
          reject(new Error(`MediaRecorder error: ${error}`))
        }
        
        console.log('🛑 Stopping enhanced video recording...')
        mediaRecorder.stop()
      })

    } catch (error) {
      console.error('❌ Frame processing failed:', error)
      mediaRecorder.stop()
      throw error
    }
  }

  private async processFrames(
    zoomKeyframes: ZoomKeyframe[],
    clickEffects: ClickEffect[],
    settings: EnhancementSettings,
    effectsApplied: string[]
  ): Promise<void> {
    if (!this.video || !this.canvas || !this.context) {
      throw new Error('Video processing components not initialized')
    }

    const video = this.video
    const canvas = this.canvas
    const ctx = this.context
    
    // Get video duration (use estimated if actual is invalid)
    let videoDurationSeconds = video.duration
    if (!isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
      videoDurationSeconds = (video as any)._estimatedDuration
      if (!videoDurationSeconds) {
        throw new Error(`No valid video duration available: ${video.duration}`)
      }
    }
    
    const duration = videoDurationSeconds * 1000 // Convert to ms
    const frameRate = 10 // Further reduced for much faster processing
    const frameInterval = 1000 / frameRate
    const totalFrames = Math.min(Math.ceil(duration / frameInterval), 50) // Cap at 50 frames (5 seconds at 10fps)

    console.log(`🎞️ Processing ${totalFrames} frames at ${frameRate}fps (${videoDurationSeconds.toFixed(2)}s)`)
    console.log(`📹 Video details: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`)

    // Report initial progress
    this.reportProgress({ 
      phase: 'processing', 
      progress: 0, 
      currentFrame: 0, 
      totalFrames,
      message: `Processing ${totalFrames} frames...`
    })

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex * frameInterval
      const videoTime = Math.min(time / 1000, videoDurationSeconds - 0.1) // Ensure we don't exceed duration
      
      try {
        // Seek to current time
        video.currentTime = videoTime
        await this.waitForVideoSeek()

        // Debug video state
        if (frameIndex === 0 || frameIndex % 30 === 0) {
          console.log(`🔍 Frame ${frameIndex}: video.currentTime=${video.currentTime.toFixed(3)}s, readyState=${video.readyState}, videoWidth=${video.videoWidth}, videoHeight=${video.videoHeight}`)
        }

        // Clear canvas with black background
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw video frame with detailed error checking
        try {
          // Check if video is ready for drawing
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            // First, try drawing the video at original size to preserve quality
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height)
            
            // Add a small debug indicator to show we drew something
            if (frameIndex === 0) {
              ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'
              ctx.fillRect(10, 10, 20, 20)
              console.log('✅ Successfully drew first video frame with debug indicator')
              
              // Also test drawing the video without scaling to see if that's the issue
              const testCanvas = document.createElement('canvas')
              testCanvas.width = 100
              testCanvas.height = 100
              const testCtx = testCanvas.getContext('2d')!
              testCtx.drawImage(video, 0, 0, 100, 100)
              const imageData = testCtx.getImageData(0, 0, 100, 100)
              const hasNonZeroPixels = Array.from(imageData.data).some(value => value > 0)
              console.log(`🔍 Video frame test: hasNonZeroPixels=${hasNonZeroPixels}`)
            }
          } else {
            console.error(`❌ Video not ready for drawing: readyState=${video.readyState}, dimensions=${video.videoWidth}x${video.videoHeight}`)
            // Draw a red error indicator
            ctx.fillStyle = '#ff0000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.fillStyle = '#ffffff'
            ctx.font = '48px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('VIDEO NOT READY', canvas.width / 2, canvas.height / 2)
          }
        } catch (drawError) {
          console.error('❌ Failed to draw video frame:', drawError)
          // Draw a placeholder to show we're processing
          ctx.fillStyle = '#ff0000'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#ffffff'
          ctx.font = '24px Arial'
          ctx.textAlign = 'center'
          const errorMsg = drawError instanceof Error ? drawError.message : 'Unknown error'
          ctx.fillText(`DRAW ERROR: ${errorMsg}`, canvas.width / 2, canvas.height / 2)
        }

        // Apply zoom effect (simplified for debugging)
        const currentZoom = this.interpolateZoom(zoomKeyframes, time)
        if (currentZoom.scale > 1) {
          // Simple zoom indicator for debugging
          ctx.strokeStyle = '#00ff00'
          ctx.lineWidth = 3
          ctx.strokeRect(currentZoom.x - 20, currentZoom.y - 20, 40, 40)
          if (!effectsApplied.includes('auto-zoom')) {
            effectsApplied.push('auto-zoom')
          }
        }

        // Apply cursor effects
        if (settings.showCursor) {
          this.drawCursor(ctx, time, zoomKeyframes, settings)
          if (!effectsApplied.includes('cursor-enhancement')) {
            effectsApplied.push('cursor-enhancement')
          }
        }

        // Apply click effects
        const activeClicks = clickEffects.filter(
          click => Math.abs(click.timestamp - time) < 300 // 300ms effect duration
        )
        
        for (const click of activeClicks) {
          this.drawClickEffect(ctx, click, time, settings)
          if (!effectsApplied.includes('click-effects')) {
            effectsApplied.push('click-effects')
          }
        }

        // Allow frame to be captured (minimal delay for very fast processing)
        await new Promise(resolve => setTimeout(resolve, 1)) // Just 1ms delay
        
        // Progress updates every 10 frames for responsiveness
        if (frameIndex % 10 === 0) {
          const progress = Math.round((frameIndex / totalFrames) * 80) + 10 // 10-90% for processing phase
          this.reportProgress({ 
            phase: 'processing', 
            progress, 
            currentFrame: frameIndex, 
            totalFrames,
            message: `Processing frame ${frameIndex}/${totalFrames}...`
          })
          
          if (frameIndex % 30 === 0) {
            console.log(`🎬 Processing frame ${frameIndex}/${totalFrames} (${progress}%)`)
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing frame ${frameIndex}:`, error)
        // Draw error indicator
        ctx.fillStyle = '#ff0000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'
        ctx.font = '24px Arial'
        ctx.textAlign = 'center'
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        ctx.fillText(`FRAME ERROR: ${errorMsg}`, canvas.width / 2, canvas.height / 2)
      }
    }
    
    this.reportProgress({ 
      phase: 'finalizing', 
      progress: 90, 
      message: 'Finalizing enhanced video...'
    })
    
    console.log('🎬 Frame processing complete')
  }

  private async waitForVideoSeek(): Promise<void> {
    if (!this.video) {
      throw new Error('Video element is null')
    }
    
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 200 // 2 second timeout
      const targetTime = this.video!.currentTime
      
      const checkSeeked = () => {
        if (!this.video) {
          reject(new Error('Video element became null during seek'))
          return
        }
        
        // Check if video has enough data and is at or close to the target time
        const hasData = this.video.readyState >= 2 // HAVE_CURRENT_DATA
        const timeIsClose = Math.abs(this.video.currentTime - targetTime) < 0.1 // Within 100ms
        
        if (hasData && timeIsClose) {
          resolve()
        } else if (attempts++ < maxAttempts) {
          setTimeout(checkSeeked, 10)
        } else {
          // Don't reject on timeout - just continue with whatever we have
          console.warn(`⚠️ Video seek timeout at ${targetTime}s, readyState=${this.video.readyState}, currentTime=${this.video.currentTime}`)
          resolve()
        }
      }
      
      // Add event listener for seeked event as backup
      const onSeeked = () => {
        if (this.video) {
          this.video.removeEventListener('seeked', onSeeked)
        }
        resolve()
      }
      this.video?.addEventListener('seeked', onSeeked)
      
      // Start checking immediately
      checkSeeked()
    })
  }

  private interpolateZoom(keyframes: ZoomKeyframe[], timestamp: number): ZoomKeyframe {
    if (keyframes.length === 0) {
      return { timestamp, x: 0, y: 0, scale: 1, easing: 'linear' }
    }

    // Find surrounding keyframes
    let before = keyframes[0]
    let after = keyframes[keyframes.length - 1]

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].timestamp <= timestamp && keyframes[i + 1].timestamp >= timestamp) {
        before = keyframes[i]
        after = keyframes[i + 1]
        break
      }
    }

    if (before === after) return before

    // Interpolate between keyframes
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    const easedProgress = this.applyEasing(progress, before.easing)

    return {
      timestamp,
      x: before.x + (after.x - before.x) * easedProgress,
      y: before.y + (after.y - before.y) * easedProgress,
      scale: before.scale + (after.scale - before.scale) * easedProgress,
      easing: before.easing
    }
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'ease-out':
        return 1 - Math.pow(1 - t, 3)
      case 'ease-in-out':
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      default:
        return t
    }
  }

  private applyZoom(
    ctx: CanvasRenderingContext2D,
    zoom: ZoomKeyframe,
    width: number,
    height: number
  ): void {
    if (zoom.scale <= 1) return

    ctx.save()
    
    // Calculate zoom center (mouse position)
    const centerX = zoom.x
    const centerY = zoom.y
    
    // Apply zoom transformation
    ctx.translate(centerX, centerY)
    ctx.scale(zoom.scale, zoom.scale)
    ctx.translate(-centerX, -centerY)
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    timestamp: number,
    zoomKeyframes: ZoomKeyframe[],
    settings: EnhancementSettings
  ): void {
    const currentZoom = this.interpolateZoom(zoomKeyframes, timestamp)
    const cursorSize = (settings.cursorSize || 1) * 20 // Base size 20px
    
    ctx.save()
    ctx.fillStyle = settings.cursorColor || '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    
    // Draw cursor
    ctx.beginPath()
    ctx.arc(currentZoom.x, currentZoom.y, cursorSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    
    ctx.restore()
  }

  private drawClickEffect(
    ctx: CanvasRenderingContext2D,
    click: ClickEffect,
    currentTime: number,
    settings: EnhancementSettings
  ): void {
    const timeDiff = currentTime - click.timestamp
    const maxDuration = 300 // 300ms effect
    
    if (timeDiff < 0 || timeDiff > maxDuration) return

    const progress = timeDiff / maxDuration
    const radius = 30 * (1 + progress * 2) // Expanding circle
    const opacity = (1 - progress) * 0.7 // Fading out

    ctx.save()
    ctx.globalAlpha = opacity
    ctx.strokeStyle = settings.clickEffectColor || '#3b82f6'
    ctx.lineWidth = 3
    
    ctx.beginPath()
    ctx.arc(click.x, click.y, radius, 0, Math.PI * 2)
    ctx.stroke()
    
    ctx.restore()
  }

  private cleanup(): void {
    if (this.video) {
      // Revoke blob URL to free memory
      if (this.video.src && this.video.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.video.src)
      }
      this.video.remove()
      this.video = null
    }
    
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
    }
    
    this.context = null
    console.log('🧹 EffectsProcessor cleaned up')
  }

  dispose(): void {
    this.cleanup()
  }
}
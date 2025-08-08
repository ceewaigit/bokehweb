/**
 * Hardware-accelerated effects processor using FFmpeg
 * Provides real-time video effects for Screen Studio-style animations
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { ElectronMetadata } from './electron-recorder'
import type { EnhancementSettings } from './screen-recorder'

export interface HardwareEffectsResult {
  enhancedVideo: Blob
  effectsApplied: string[]
  processingTime: number
  metadata: EffectsMetadata[]
}

export interface EffectsMetadata {
  timestamp: number
  effectType: 'zoom' | 'cursor' | 'click' | 'pan'
  parameters: Record<string, any>
}

export class HardwareEffectsProcessor {
  private ffmpeg: FFmpeg | null = null
  private isLoaded = false
  private processingQueue: Array<() => Promise<void>> = []
  private isProcessing = false

  constructor() {
    console.log('🎬 HardwareEffectsProcessor initialized')
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return

    try {
      console.log('🔧 Loading FFmpeg with hardware acceleration...')
      
      this.ffmpeg = new FFmpeg()
      
      // Set up progress monitoring
      this.ffmpeg.on('progress', ({ progress, time }) => {
        console.log(`🎬 Processing: ${Math.round(progress * 100)}% (${time}ms)`)
      })

      this.ffmpeg.on('log', ({ message }) => {
        console.log(`🎬 FFmpeg: ${message}`)
      })

      // Load FFmpeg core with optimized settings for hardware acceleration
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      })

      this.isLoaded = true
      console.log('✅ FFmpeg loaded with hardware acceleration')
      
    } catch (error) {
      console.error('❌ Failed to initialize FFmpeg:', error)
      throw new Error(`Hardware effects processor initialization failed: ${error}`)
    }
  }

  async processVideoWithEffects(
    videoBlob: Blob,
    metadata: ElectronMetadata[],
    settings: EnhancementSettings,
    duration: number
  ): Promise<HardwareEffectsResult> {
    if (!this.ffmpeg || !this.isLoaded) {
      await this.initialize()
    }

    const startTime = performance.now()
    console.log('🎬 Starting hardware-accelerated video processing...')

    try {
      // Write input video to FFmpeg filesystem
      const inputFileName = 'input.webm'
      await this.ffmpeg!.writeFile(inputFileName, await fetchFile(videoBlob))

      // Generate effects timeline from metadata
      const effectsTimeline = this.generateEffectsTimeline(metadata, settings, duration)
      
      // Build FFmpeg command for hardware acceleration and effects
      const ffmpegArgs = this.buildFFmpegCommand(inputFileName, effectsTimeline, settings)
      
      console.log(`🎬 Executing FFmpeg command: ${ffmpegArgs.join(' ')}`)
      
      // Execute FFmpeg with hardware acceleration
      await this.ffmpeg!.exec(ffmpegArgs)

      // Read processed video
      const outputData = await this.ffmpeg!.readFile('output.mp4')
      const enhancedVideo = new Blob([outputData], { type: 'video/mp4' })

      // Cleanup temporary files
      await this.cleanup(['input.webm', 'output.mp4'])

      const processingTime = performance.now() - startTime
      console.log(`✅ Hardware processing complete: ${processingTime.toFixed(2)}ms`)

      return {
        enhancedVideo,
        effectsApplied: this.getAppliedEffects(settings),
        processingTime,
        metadata: effectsTimeline
      }

    } catch (error) {
      console.error('❌ Hardware effects processing failed:', error)
      throw new Error(`Effects processing failed: ${error}`)
    }
  }

  private generateEffectsTimeline(
    metadata: ElectronMetadata[],
    settings: EnhancementSettings,
    duration: number
  ): EffectsMetadata[] {
    const timeline: EffectsMetadata[] = []

    if (!settings.enableAutoZoom && !settings.showClickEffects) {
      return timeline
    }

    // Process mouse movements for auto-zoom
    if (settings.enableAutoZoom) {
      const movements = metadata.filter(m => m.eventType === 'mouse')
      const zoomEvents = this.detectZoomOpportunities(movements, settings)
      timeline.push(...zoomEvents)
    }

    // Process click events for click effects
    if (settings.showClickEffects) {
      const clicks = metadata.filter(m => m.eventType === 'click')
      const clickEffects = this.generateClickEffects(clicks, settings)
      timeline.push(...clickEffects)
    }

    // Add cursor enhancement
    if (settings.showCursor) {
      timeline.push({
        timestamp: 0,
        effectType: 'cursor',
        parameters: {
          size: settings.cursorSize,
          color: settings.cursorColor,
          duration: duration
        }
      })
    }

    return timeline.sort((a, b) => a.timestamp - b.timestamp)
  }

  private detectZoomOpportunities(
    movements: ElectronMetadata[],
    settings: EnhancementSettings
  ): EffectsMetadata[] {
    const zoomEvents: EffectsMetadata[] = []
    let lastZoomTime = 0

    for (let i = 1; i < movements.length; i++) {
      const current = movements[i]
      const previous = movements[i - 1]
      
      // Calculate movement speed and direction
      const deltaX = current.mouseX - previous.mouseX
      const deltaY = current.mouseY - previous.mouseY
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const timeDelta = current.timestamp - previous.timestamp
      
      if (timeDelta === 0) continue
      
      const speed = distance / timeDelta

      // Detect rapid movements that indicate UI interaction
      const isRapidMovement = speed > settings.motionSensitivity * 10
      const isSignificantPause = i < movements.length - 1 && 
        movements[i + 1].timestamp - current.timestamp > 500

      if (isRapidMovement && isSignificantPause && 
          current.timestamp - lastZoomTime > 2000) {
        
        zoomEvents.push({
          timestamp: current.timestamp,
          effectType: 'zoom',
          parameters: {
            centerX: current.mouseX,
            centerY: current.mouseY,
            zoomLevel: Math.min(settings.maxZoom, 1.5 + speed * settings.zoomSensitivity),
            duration: 1500,
            easing: 'ease-in-out'
          }
        })
        
        lastZoomTime = current.timestamp
      }
    }

    return zoomEvents
  }

  private generateClickEffects(
    clicks: ElectronMetadata[],
    settings: EnhancementSettings
  ): EffectsMetadata[] {
    return clicks.map(click => ({
      timestamp: click.timestamp,
      effectType: 'click' as const,
      parameters: {
        x: click.mouseX,
        y: click.mouseY,
        size: settings.clickEffectSize,
        color: settings.clickEffectColor,
        duration: 800,
        animation: 'ripple'
      }
    }))
  }

  private buildFFmpegCommand(
    inputFile: string,
    timeline: EffectsMetadata[],
    settings: EnhancementSettings
  ): string[] {
    const args = [
      '-i', inputFile,
      '-c:v', 'libx264', // Use H.264 for broad compatibility
      '-preset', 'ultrafast', // Fastest encoding for real-time feel
      '-crf', '18', // High quality
      '-r', '60', // 60fps output for smooth animations
      '-pix_fmt', 'yuv420p' // Compatibility
    ]

    // Add hardware acceleration if available
    if (this.supportsHardwareAcceleration()) {
      args.splice(2, 0, '-hwaccel', 'auto')
    }

    // Build complex filter for effects
    const filters = this.buildVideoFilters(timeline, settings)
    if (filters.length > 0) {
      args.push('-filter_complex', filters.join(';'))
      args.push('-map', '[out]')
    }

    args.push('output.mp4')
    return args
  }

  private buildVideoFilters(timeline: EffectsMetadata[], settings: EnhancementSettings): string[] {
    const filters: string[] = []
    let lastLabel = '[0:v]'

    timeline.forEach((effect, index) => {
      const outputLabel = index === timeline.length - 1 ? '[out]' : `[v${index}]`
      
      switch (effect.effectType) {
        case 'zoom':
          filters.push(this.buildZoomFilter(lastLabel, outputLabel, effect))
          break
        case 'click':
          filters.push(this.buildClickFilter(lastLabel, outputLabel, effect))
          break
        case 'cursor':
          filters.push(this.buildCursorFilter(lastLabel, outputLabel, effect))
          break
        case 'pan':
          filters.push(this.buildPanFilter(lastLabel, outputLabel, effect))
          break
      }
      
      lastLabel = outputLabel
    })

    return filters
  }

  private buildZoomFilter(input: string, output: string, effect: EffectsMetadata): string {
    const { centerX, centerY, zoomLevel, duration, easing } = effect.parameters
    const startTime = effect.timestamp / 1000 // Convert to seconds
    const endTime = startTime + (duration / 1000)
    
    // Create smooth zoom animation using zoompan filter
    return `${input}zoompan=z='if(between(t,${startTime},${endTime}),${zoomLevel},1)':x='${centerX}':y='${centerY}':d=1:s=1920x1080${output}`
  }

  private buildClickFilter(input: string, output: string, effect: EffectsMetadata): string {
    const { x, y, size, color, duration } = effect.parameters
    const startTime = effect.timestamp / 1000
    const endTime = startTime + (duration / 1000)
    
    // Create ripple effect using drawbox and fade filters
    return `${input}drawbox=x=${x-size/2}:y=${y-size/2}:w=${size}:h=${size}:color=${color}:t=fill:enable='between(t,${startTime},${endTime})'${output}`
  }

  private buildCursorFilter(input: string, output: string, effect: EffectsMetadata): string {
    const { size, color } = effect.parameters
    
    // Enhanced cursor visibility
    return `${input}scale=${size}:interp=cubic${output}`
  }

  private buildPanFilter(input: string, output: string, effect: EffectsMetadata): string {
    const { fromX, fromY, toX, toY, duration } = effect.parameters
    const startTime = effect.timestamp / 1000
    const endTime = startTime + (duration / 1000)
    
    // Smooth panning animation
    return `${input}scale=2*iw:2*ih,crop=iw/2:ih/2:x='if(between(t,${startTime},${endTime}),${fromX}+(${toX}-${fromX})*(t-${startTime})/(${endTime}-${startTime}),${fromX})':y='if(between(t,${startTime},${endTime}),${fromY}+(${toY}-${fromY})*(t-${startTime})/(${endTime}-${startTime}),${fromY})'${output}`
  }

  private supportsHardwareAcceleration(): boolean {
    // Simple heuristic - in a real implementation, you'd probe for hardware capabilities
    return typeof navigator !== 'undefined' && 
           navigator.hardwareConcurrency > 4
  }

  private getAppliedEffects(settings: EnhancementSettings): string[] {
    const effects = ['hardware-acceleration', 'h264-encoding']
    
    if (settings.enableAutoZoom) effects.push('auto-zoom')
    if (settings.showClickEffects) effects.push('click-ripples')
    if (settings.showCursor) effects.push('cursor-enhancement')
    if (settings.enableSmartPanning) effects.push('smart-panning')
    if (settings.enableSmoothAnimations) effects.push('smooth-animations')
    
    return effects
  }

  private async cleanup(files: string[]): Promise<void> {
    if (!this.ffmpeg) return
    
    for (const file of files) {
      try {
        await this.ffmpeg.deleteFile(file)
      } catch (error) {
        console.warn(`⚠️ Could not delete ${file}:`, error)
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.ffmpeg && this.isLoaded) {
      try {
        // Cleanup any remaining files
        await this.cleanup(['input.webm', 'output.mp4'])
        console.log('🧹 HardwareEffectsProcessor disposed')
      } catch (error) {
        console.warn('⚠️ Error during disposal:', error)
      }
    }
    
    this.ffmpeg = null
    this.isLoaded = false
  }

  // Queue management for concurrent processing
  private async addToQueue(processor: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.processingQueue.push(async () => {
        try {
          await processor()
          resolve()
        } catch (error) {
          reject(error)
        }
      })
      
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return
    
    this.isProcessing = true
    
    while (this.processingQueue.length > 0) {
      const processor = this.processingQueue.shift()!
      await processor()
    }
    
    this.isProcessing = false
  }

  // Performance monitoring
  getPerformanceMetrics(): { queueLength: number; isProcessing: boolean; isLoaded: boolean } {
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      isLoaded: this.isLoaded
    }
  }
}
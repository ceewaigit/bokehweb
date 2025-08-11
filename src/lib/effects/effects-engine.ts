import { easeInOutQuad, easeOutExpo, easeInQuad } from '@/lib/utils/easing'
import type { MouseEvent as ProjectMouseEvent } from '@/types/project'

// Base effect interface - all effects on the timeline
export interface Effect {
  id: string
  type: 'zoom' // Can add more effect types later
  startTime: number
  endTime: number
  params: any
}

// Zoom effect with intro/outro animations
export interface ZoomEffect extends Effect {
  type: 'zoom'
  params: {
    targetX: number      // Initial focus point (normalized 0-1)
    targetY: number      // Initial focus point (normalized 0-1)
    scale: number        // Zoom level (e.g., 1.8)
    introMs: number      // Intro animation duration (default 800ms)
    outroMs: number      // Outro animation duration (default 800ms)
  }
}

// Result of applying effects at a specific timestamp
export interface EffectState {
  zoom: {
    x: number
    y: number
    scale: number
  }
}

export class EffectsEngine {
  private effects: Effect[] = []
  private mouseEvents: ProjectMouseEvent[] = []
  private videoDuration: number = 0
  private videoWidth: number = 1920
  private videoHeight: number = 1080
  
  // Detection thresholds
  private readonly LINGER_THRESHOLD = 500 // ms - cursor stays in area to trigger zoom
  private readonly MOVEMENT_THRESHOLD = 100 // pixels - movement that breaks linger
  private readonly ZOOM_SCALE = 1.8 // Default zoom level
  private readonly INTRO_DURATION = 800 // ms
  private readonly OUTRO_DURATION = 800 // ms
  private readonly MIN_ZOOM_DURATION = 2000 // ms - minimum duration for a zoom effect
  
  constructor() {}
  
  /**
   * Initialize effects from recording metadata
   * This sets up the engine with all detected effects
   */
  initializeFromRecording(recording: any): void {
    if (!recording) return
    
    const effects = this.detectEffectsFromRecording(recording)
    this.setEffects(effects)
  }
  
  /**
   * Initialize effects from raw metadata (for preview)
   */
  initializeFromMetadata(metadata: any[], duration: number, width: number, height: number): void {
    // Convert the preview metadata format to our format
    const events: ProjectMouseEvent[] = metadata
      .filter((e: any) => e.eventType === 'mouse' || e.eventType === 'click')
      .map((e: any) => ({
        timestamp: e.timestamp,
        x: e.mouseX || e.x,
        y: e.mouseY || e.y,
        type: e.eventType === 'click' ? 'click' : 'move',
        screenWidth: e.windowWidth || width,
        screenHeight: e.windowHeight || height
      }))
    
    const effects = this.detectZoomEffectsInternal(events, duration, width, height)
    this.setEffects(effects)
  }
  
  /**
   * Detect zoom effects from recording metadata
   * This is the main entry point for automatic effect detection
   */
  detectEffectsFromRecording(recording: any): ZoomEffect[] {
    if (!recording.metadata || !recording.duration) {
      return []
    }
    
    // Convert metadata to internal format
    const events = this.convertMetadataToEvents(recording.metadata, recording.width, recording.height)
    
    // Detect zoom effects
    return this.detectZoomEffectsInternal(
      events,
      recording.duration,
      recording.width || 1920,
      recording.height || 1080
    )
  }
  
  /**
   * Convert recording metadata to internal event format
   */
  private convertMetadataToEvents(metadata: any, width: number, height: number): ProjectMouseEvent[] {
    const events: ProjectMouseEvent[] = []
    
    // Add mouse events
    if (metadata.mouseEvents) {
      events.push(...metadata.mouseEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'move' as const,
        screenWidth: e.screenWidth || width,
        screenHeight: e.screenHeight || height
      })))
    }
    
    // Add click events
    if (metadata.clickEvents) {
      events.push(...metadata.clickEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'click' as const,
        screenWidth: width,
        screenHeight: height
      })))
    }
    
    return events.sort((a, b) => a.timestamp - b.timestamp)
  }
  
  /**
   * Get zoom keyframes in the legacy format for timeline compatibility
   */
  getZoomKeyframes(recording: any): any[] {
    const zoomEffects = this.detectEffectsFromRecording(recording)
    const keyframes: any[] = []
    
    zoomEffects.forEach(effect => {
      // Add keyframe for zoom start
      keyframes.push({
        time: effect.startTime,
        zoom: effect.params.scale,
        x: effect.params.targetX,
        y: effect.params.targetY,
        easing: 'easeOut'
      })
      // Add keyframe for zoom end
      keyframes.push({
        time: effect.endTime,
        zoom: 1.0,
        x: 0.5,
        y: 0.5,
        easing: 'easeIn'
      })
    })
    
    return keyframes
  }
  
  /**
   * Analyze mouse events and detect where to add zoom effects
   */
  private detectZoomEffectsInternal(
    events: ProjectMouseEvent[], 
    videoDuration: number,
    videoWidth: number = 1920,
    videoHeight: number = 1080
  ): ZoomEffect[] {
    this.mouseEvents = events
    this.videoDuration = videoDuration
    this.videoWidth = videoWidth
    this.videoHeight = videoHeight
    
    const zoomEffects: ZoomEffect[] = []
    let lingerStart = 0
    let lastLingerX = 0
    let lastLingerY = 0
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      
      if (i === 0) {
        lingerStart = event.timestamp
        lastLingerX = event.x
        lastLingerY = event.y
        continue
      }
      
      const distance = Math.sqrt(
        Math.pow(event.x - lastLingerX, 2) + 
        Math.pow(event.y - lastLingerY, 2)
      )
      
      // Check for linger
      if (distance < this.MOVEMENT_THRESHOLD) {
        const lingerDuration = event.timestamp - lingerStart
        
        // Create zoom effect if lingering long enough
        if (lingerDuration > this.LINGER_THRESHOLD) {
          // Find when the linger ends
          let endTime = event.timestamp + this.MIN_ZOOM_DURATION
          for (let j = i + 1; j < events.length; j++) {
            const futureEvent = events[j]
            const futureDistance = Math.sqrt(
              Math.pow(futureEvent.x - event.x, 2) + 
              Math.pow(futureEvent.y - event.y, 2)
            )
            if (futureDistance > this.MOVEMENT_THRESHOLD * 2) {
              endTime = futureEvent.timestamp
              break
            }
          }
          
          // Ensure minimum duration
          if (endTime - event.timestamp >= this.MIN_ZOOM_DURATION) {
            zoomEffects.push({
              id: `zoom-${Date.now()}-${i}`,
              type: 'zoom',
              startTime: event.timestamp,
              endTime: endTime,
              params: {
                targetX: event.x / videoWidth,
                targetY: event.y / videoHeight,
                scale: this.ZOOM_SCALE,
                introMs: this.INTRO_DURATION,
                outroMs: this.OUTRO_DURATION
              }
            })
            
            // Skip ahead to avoid duplicate detections
            while (i < events.length && events[i].timestamp < endTime) {
              i++
            }
            i-- // Back up one since the loop will increment
          }
        }
      } else {
        // Reset linger tracking
        lingerStart = event.timestamp
        lastLingerX = event.x
        lastLingerY = event.y
      }
      
      // Also detect clicks as instant zoom triggers
      if ('type' in event && event.type === 'click') {
        // Find end time (next click or significant movement)
        let endTime = event.timestamp + this.MIN_ZOOM_DURATION
        for (let j = i + 1; j < events.length; j++) {
          const futureEvent = events[j]
          if (('type' in futureEvent && futureEvent.type === 'click') || 
              Math.sqrt(
                Math.pow(futureEvent.x - event.x, 2) + 
                Math.pow(futureEvent.y - event.y, 2)
              ) > this.MOVEMENT_THRESHOLD * 3) {
            endTime = Math.max(endTime, futureEvent.timestamp)
            break
          }
        }
        
        zoomEffects.push({
          id: `zoom-click-${Date.now()}-${i}`,
          type: 'zoom',
          startTime: event.timestamp,
          endTime: endTime,
          params: {
            targetX: event.x / videoWidth,
            targetY: event.y / videoHeight,
            scale: this.ZOOM_SCALE,
            introMs: this.INTRO_DURATION,
            outroMs: this.OUTRO_DURATION
          }
        })
        
        // Skip ahead
        while (i < events.length && events[i].timestamp < endTime) {
          i++
        }
        i--
      }
    }
    
    this.effects = zoomEffects
    return zoomEffects
  }
  
  /**
   * Get the effect state at a specific timestamp
   */
  getEffectState(timestamp: number): EffectState {
    // Find active zoom effect
    const activeZoom = this.effects.find(effect => 
      effect.type === 'zoom' && 
      timestamp >= effect.startTime && 
      timestamp <= effect.endTime
    ) as ZoomEffect | undefined
    
    if (!activeZoom) {
      return {
        zoom: { x: 0.5, y: 0.5, scale: 1.0 }
      }
    }
    
    // Calculate zoom animation phase
    const effectDuration = activeZoom.endTime - activeZoom.startTime
    const elapsed = timestamp - activeZoom.startTime
    
    let scale: number
    let x: number
    let y: number
    
    // Intro phase
    if (elapsed < activeZoom.params.introMs) {
      const progress = elapsed / activeZoom.params.introMs
      const eased = easeOutExpo(progress)
      
      scale = 1.0 + (activeZoom.params.scale - 1.0) * eased
      
      // Pan from center to target
      x = 0.5 + (activeZoom.params.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.params.targetY - 0.5) * eased
    }
    // Outro phase
    else if (elapsed > effectDuration - activeZoom.params.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.params.outroMs)
      const progress = outroElapsed / activeZoom.params.outroMs
      const eased = easeInQuad(progress)
      
      scale = activeZoom.params.scale - (activeZoom.params.scale - 1.0) * eased
      
      // Get current mouse position for smooth transition
      const currentMouse = this.getInterpolatedMousePosition(timestamp)
      
      // Pan from current mouse position back to center
      x = currentMouse.x + (0.5 - currentMouse.x) * eased
      y = currentMouse.y + (0.5 - currentMouse.y) * eased
    }
    // Middle phase - follow mouse
    else {
      scale = activeZoom.params.scale
      
      // Follow actual mouse position
      const mousePos = this.getInterpolatedMousePosition(timestamp)
      x = mousePos.x
      y = mousePos.y
    }
    
    // Ensure we stay within bounds when zoomed
    const margin = 0.5 / scale
    x = Math.max(margin, Math.min(1 - margin, x))
    y = Math.max(margin, Math.min(1 - margin, y))
    
    return {
      zoom: { x, y, scale }
    }
  }
  
  /**
   * Get interpolated mouse position at timestamp
   */
  private getInterpolatedMousePosition(timestamp: number): { x: number; y: number } {
    if (!this.mouseEvents || this.mouseEvents.length === 0) {
      return { x: 0.5, y: 0.5 }
    }
    
    // Find surrounding events
    let before: ProjectMouseEvent | null = null
    let after: ProjectMouseEvent | null = null
    
    for (let i = 0; i < this.mouseEvents.length; i++) {
      const event = this.mouseEvents[i]
      if (event.timestamp <= timestamp) {
        before = event
      } else {
        after = event
        break
      }
    }
    
    // Interpolate between events
    if (before && after) {
      const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
      const smoothProgress = easeInOutQuad(Math.min(1, Math.max(0, progress)))
      
      const beforeX = before.x / this.videoWidth
      const beforeY = before.y / this.videoHeight
      const afterX = after.x / this.videoWidth
      const afterY = after.y / this.videoHeight
      
      return {
        x: beforeX + (afterX - beforeX) * smoothProgress,
        y: beforeY + (afterY - beforeY) * smoothProgress
      }
    }
    
    // Use nearest event
    if (before) {
      return {
        x: before.x / this.videoWidth,
        y: before.y / this.videoHeight
      }
    }
    
    if (after) {
      return {
        x: after.x / this.videoWidth,
        y: after.y / this.videoHeight
      }
    }
    
    return { x: 0.5, y: 0.5 }
  }
  
  /**
   * Apply zoom to canvas
   */
  applyZoomToCanvas(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    zoom: { x: number; y: number; scale: number }
  ) {
    const { width, height } = ctx.canvas
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height
    
    if (!sourceWidth || !sourceHeight) return
    
    // Calculate the zoomed region
    const zoomWidth = sourceWidth / zoom.scale
    const zoomHeight = sourceHeight / zoom.scale
    
    // Calculate source coordinates
    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight
    
    const halfWidth = zoomWidth / 2
    const halfHeight = zoomHeight / 2
    
    const sx = Math.max(0, Math.min(sourceWidth - zoomWidth, centerX - halfWidth))
    const sy = Math.max(0, Math.min(sourceHeight - zoomHeight, centerY - halfHeight))
    
    // Draw with high quality
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, width, height)
    
    ctx.drawImage(
      source as CanvasImageSource,
      sx, sy, zoomWidth, zoomHeight,
      0, 0, width, height
    )
  }
  
  /**
   * Get all effects
   */
  getEffects(): Effect[] {
    return this.effects
  }
  
  /**
   * Set effects manually (for loading from project)
   */
  setEffects(effects: Effect[]) {
    this.effects = effects
  }
  
  /**
   * Add an effect
   */
  addEffect(effect: Effect) {
    this.effects.push(effect)
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }
  
  /**
   * Remove an effect
   */
  removeEffect(effectId: string) {
    this.effects = this.effects.filter(e => e.id !== effectId)
  }
  
  /**
   * Clear all effects
   */
  clearEffects() {
    this.effects = []
  }
}
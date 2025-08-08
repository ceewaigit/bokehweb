"use client"

interface MouseEvent {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
}

interface ZoomKeyframe {
  timestamp: number
  x: number
  y: number
  scale: number
  reason: string
}

interface ZoomOptions {
  enabled?: boolean
  sensitivity?: number
  maxZoom?: number
  zoomSpeed?: number
  smoothing?: boolean
  clickZoom?: boolean
  panSpeed?: number
}

export class ZoomEngine {
  private keyframes: ZoomKeyframe[] = []
  private currentZoom = { x: 0.5, y: 0.5, scale: 1 }
  private targetZoom = { x: 0.5, y: 0.5, scale: 1 }
  
  constructor(private options: ZoomOptions = {}) {
    this.options = {
      enabled: true,
      sensitivity: 1.0,
      maxZoom: 2.5,
      zoomSpeed: 0.1,
      smoothing: true,
      clickZoom: true,
      panSpeed: 0.05,
      ...options
    }
  }

  generateKeyframes(events: MouseEvent[], videoDuration: number, videoWidth: number, videoHeight: number): ZoomKeyframe[] {
    if (!this.options.enabled || events.length === 0) {
      return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' }]
    }

    this.keyframes = []
    let lastActivity = 0
    let isZoomed = false
    let zoomCenter = { x: 0.5, y: 0.5 }
    
    // Analyze events for zoom opportunities
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const normalizedX = event.mouseX / videoWidth
      const normalizedY = event.mouseY / videoHeight
      
      // Check for click events (zoom in on clicks)
      if (event.eventType === 'click' && this.options.clickZoom) {
        if (!isZoomed) {
          // Zoom in on click
          this.keyframes.push({
            timestamp: event.timestamp,
            x: normalizedX,
            y: normalizedY,
            scale: this.options.maxZoom! * 0.7, // 70% of max zoom for clicks
            reason: 'click'
          })
          isZoomed = true
          zoomCenter = { x: normalizedX, y: normalizedY }
          lastActivity = event.timestamp
        }
      }
      
      // Check for mouse movement patterns
      if (event.eventType === 'mouse' && i > 0) {
        const prevEvent = events[i - 1]
        const distance = Math.sqrt(
          Math.pow((event.mouseX - prevEvent.mouseX) / videoWidth, 2) +
          Math.pow((event.mouseY - prevEvent.mouseY) / videoHeight, 2)
        )
        
        // If mouse moved significantly while zoomed, pan to follow
        if (isZoomed && distance > 0.05 * this.options.sensitivity!) {
          const panX = zoomCenter.x + (normalizedX - zoomCenter.x) * this.options.panSpeed!
          const panY = zoomCenter.y + (normalizedY - zoomCenter.y) * this.options.panSpeed!
          
          this.keyframes.push({
            timestamp: event.timestamp,
            x: panX,
            y: panY,
            scale: this.keyframes[this.keyframes.length - 1]?.scale || this.options.maxZoom! * 0.7,
            reason: 'pan'
          })
          
          zoomCenter = { x: panX, y: panY }
          lastActivity = event.timestamp
        }
        
        // If mouse is relatively stationary, consider zooming in
        if (!isZoomed && distance < 0.01 * this.options.sensitivity! && i > 10) {
          // Check if mouse has been stable for a bit
          const recentEvents = events.slice(Math.max(0, i - 5), i)
          const isStable = recentEvents.every(e => {
            const d = Math.sqrt(
              Math.pow((e.mouseX - event.mouseX) / videoWidth, 2) +
              Math.pow((e.mouseY - event.mouseY) / videoHeight, 2)
            )
            return d < 0.02
          })
          
          if (isStable) {
            this.keyframes.push({
              timestamp: event.timestamp,
              x: normalizedX,
              y: normalizedY,
              scale: this.options.maxZoom! * 0.5, // 50% zoom for hover areas
              reason: 'hover'
            })
            isZoomed = true
            zoomCenter = { x: normalizedX, y: normalizedY }
            lastActivity = event.timestamp
          }
        }
      }
      
      // Auto zoom out after inactivity
      if (isZoomed && event.timestamp - lastActivity > 2000) {
        this.keyframes.push({
          timestamp: event.timestamp,
          x: 0.5,
          y: 0.5,
          scale: 1,
          reason: 'timeout'
        })
        isZoomed = false
      }
    }
    
    // Add final keyframe to return to normal
    if (isZoomed) {
      this.keyframes.push({
        timestamp: videoDuration,
        x: 0.5,
        y: 0.5,
        scale: 1,
        reason: 'end'
      })
    }
    
    // Ensure we have at least start and end keyframes
    if (this.keyframes.length === 0) {
      this.keyframes.push({ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' })
    }
    
    if (this.keyframes[this.keyframes.length - 1].timestamp < videoDuration) {
      this.keyframes.push({
        timestamp: videoDuration,
        x: this.keyframes[this.keyframes.length - 1].x,
        y: this.keyframes[this.keyframes.length - 1].y,
        scale: this.keyframes[this.keyframes.length - 1].scale,
        reason: 'end'
      })
    }
    
    return this.keyframes
  }

  getZoomAtTime(timestamp: number): { x: number; y: number; scale: number } {
    if (this.keyframes.length === 0) {
      return { x: 0.5, y: 0.5, scale: 1 }
    }
    
    // Find surrounding keyframes
    let before = this.keyframes[0]
    let after = this.keyframes[this.keyframes.length - 1]
    
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.keyframes[i].timestamp <= timestamp && this.keyframes[i + 1].timestamp > timestamp) {
        before = this.keyframes[i]
        after = this.keyframes[i + 1]
        break
      }
    }
    
    if (timestamp <= before.timestamp) return { x: before.x, y: before.y, scale: before.scale }
    if (timestamp >= after.timestamp) return { x: after.x, y: after.y, scale: after.scale }
    
    // Interpolate between keyframes with easing
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    const eased = this.easeInOutCubic(progress)
    
    return {
      x: before.x + (after.x - before.x) * eased,
      y: before.y + (after.y - before.y) * eased,
      scale: before.scale + (after.scale - before.scale) * eased
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  applyZoomToCanvas(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    zoom: { x: number; y: number; scale: number }
  ) {
    const { width, height } = ctx.canvas
    
    // Calculate the zoomed region
    const zoomWidth = width / zoom.scale
    const zoomHeight = height / zoom.scale
    
    // Calculate source coordinates (ensuring we stay within video bounds)
    const sx = Math.max(0, Math.min(video.videoWidth - zoomWidth, zoom.x * video.videoWidth - zoomWidth / 2))
    const sy = Math.max(0, Math.min(video.videoHeight - zoomHeight, zoom.y * video.videoHeight - zoomHeight / 2))
    
    // Clear and draw the zoomed portion
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(
      video,
      sx, sy, zoomWidth, zoomHeight,  // Source rectangle
      0, 0, width, height              // Destination rectangle
    )
  }

  getKeyframes(): ZoomKeyframe[] {
    return this.keyframes
  }
}
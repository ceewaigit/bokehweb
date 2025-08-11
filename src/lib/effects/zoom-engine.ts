import type { MouseEvent as ProjectMouseEvent } from '@/types/project'
import { easeInOutQuad, smoothStep, easeOutExpo } from '@/lib/utils/easing'

// Extend the project MouseEvent for zoom engine needs
interface ZoomMouseEvent extends Omit<ProjectMouseEvent, 'x' | 'y' | 'screenWidth' | 'screenHeight'> {
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  windowWidth?: number  // The actual screen width when event was recorded
  windowHeight?: number // The actual screen height when event was recorded
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

// Camera smoothing state for professional panning
interface CameraState {
  x: number
  y: number
  vx: number  // velocity x
  vy: number  // velocity y
  lastTime: number
}

export class ZoomEngine {
  private keyframes: ZoomKeyframe[] = []
  private allEvents: ZoomMouseEvent[] = []
  private videoWidth = 0
  private videoHeight = 0
  
  // Simplified Screen Studio-style thresholds
  private readonly LINGER_THRESHOLD = 500 // ms - cursor stays in area to trigger zoom
  private readonly MOVEMENT_THRESHOLD = 100 // pixels - movement that breaks linger
  private readonly ZOOM_OUT_DELAY = 800 // ms - delay before zooming out
  private readonly ZOOM_SCALE = 1.6 // Fixed zoom level (Screen Studio uses ~1.5-2x)
  private readonly DEAD_ZONE = 50 // pixels - ignore small movements within this radius

  // Camera smoothing parameters
  private cameraState: CameraState = {
    x: 0.5,
    y: 0.5,
    vx: 0,
    vy: 0,
    lastTime: 0
  }

  // Smoothing constants for professional camera movement
  private readonly BASE_SMOOTH_FACTOR = 0.08 // Base smoothing (lower = smoother)
  private readonly VELOCITY_DAMPING = 0.85 // Velocity decay
  private readonly PREDICTION_WEIGHT = 0.2 // How much to use velocity prediction
  private readonly ZOOM_SMOOTH_BOOST = 1.5 // Increase responsiveness when zoomed

  constructor(private options: ZoomOptions = {}) {
    this.options = {
      enabled: true,
      maxZoom: this.ZOOM_SCALE,
      smoothing: true,
      clickZoom: true,
      ...options
    }
  }

  generateKeyframes(events: ZoomMouseEvent[], videoDuration: number, videoWidth: number, videoHeight: number): ZoomKeyframe[] {
    console.log(`🎯 ZoomEngine.generateKeyframes: enabled=${this.options.enabled}, events=${events.length}`)
    
    if (!this.options.enabled || events.length === 0 || videoDuration <= 0) {
      return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' }]
    }

    // Validate dimensions
    let actualWidth = videoWidth || 1920
    let actualHeight = videoHeight || 1080
    
    if (events.length > 0 && events[0].windowWidth && events[0].windowHeight) {
      actualWidth = events[0].windowWidth
      actualHeight = events[0].windowHeight
    }

    this.videoWidth = actualWidth
    this.videoHeight = actualHeight
    this.allEvents = events

    // Simple linger-based zoom detection
    const keyframes: ZoomKeyframe[] = []
    let isZoomed = false
    let lastZoomTime = -Infinity
    let lingerStart = 0
    
    // Start with default state
    keyframes.push({ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'start' })
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const normalizedX = event.mouseX / actualWidth
      const normalizedY = event.mouseY / actualHeight
      
      if (i === 0) {
        lingerStart = event.timestamp
        continue
      }
      
      const prevEvent = events[i - 1]
      const distance = Math.sqrt(
        Math.pow((event.mouseX - prevEvent.mouseX), 2) + 
        Math.pow((event.mouseY - prevEvent.mouseY), 2)
      )
      
      // Check for linger (cursor staying in roughly same spot)
      if (distance < this.DEAD_ZONE) {
        const lingerDuration = event.timestamp - lingerStart
        
        // Zoom in if lingering and not already zoomed
        if (!isZoomed && lingerDuration > this.LINGER_THRESHOLD) {
          // Add zoom in keyframe
          keyframes.push({
            timestamp: event.timestamp,
            x: normalizedX,
            y: normalizedY,
            scale: this.ZOOM_SCALE,
            reason: 'linger-zoom'
          })
          isZoomed = true
          lastZoomTime = event.timestamp
        }
      } else if (distance > this.MOVEMENT_THRESHOLD) {
        // Large movement detected
        lingerStart = event.timestamp
        
        // Zoom out if currently zoomed and enough time has passed
        if (isZoomed && event.timestamp - lastZoomTime > this.ZOOM_OUT_DELAY) {
          keyframes.push({
            timestamp: event.timestamp,
            x: 0.5,
            y: 0.5,
            scale: 1,
            reason: 'movement-reset'
          })
          isZoomed = false
        }
      }
      
      // Handle clicks - instant zoom
      if (event.eventType === 'click' && !isZoomed) {
        keyframes.push({
          timestamp: event.timestamp,
          x: normalizedX,
          y: normalizedY,
          scale: this.ZOOM_SCALE,
          reason: 'click-zoom'
        })
        isZoomed = true
        lastZoomTime = event.timestamp
      }
    }
    
    // Ensure we end at default if still zoomed
    if (isZoomed && keyframes[keyframes.length - 1].scale !== 1) {
      keyframes.push({
        timestamp: videoDuration,
        x: 0.5,
        y: 0.5,
        scale: 1,
        reason: 'end-reset'
      })
    }
    
    this.keyframes = keyframes
    console.log(`🔍 Generated ${keyframes.length} keyframes using linger detection`)
    return keyframes
  }

  getZoomAtTime(timestamp: number): { x: number; y: number; scale: number } {
    if (this.keyframes.length === 0) {
      return { x: 0.5, y: 0.5, scale: 1 }
    }

    // Find surrounding keyframes for zoom scale
    let before = this.keyframes[0]
    let after = this.keyframes[this.keyframes.length - 1]

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.keyframes[i].timestamp <= timestamp && this.keyframes[i + 1].timestamp > timestamp) {
        before = this.keyframes[i]
        after = this.keyframes[i + 1]
        break
      }
    }

    if (timestamp <= before.timestamp) {
      return this.getZoomWithMouseTracking(timestamp, before.scale)
    }
    if (timestamp >= after.timestamp) {
      return this.getZoomWithMouseTracking(timestamp, after.scale)
    }

    // Smooth interpolation for scale
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
    const eased = easeInOutQuad(progress)
    const interpolatedScale = before.scale + (after.scale - before.scale) * eased

    // Get position from actual mouse events when zoomed
    return this.getZoomWithMouseTracking(timestamp, interpolatedScale)
  }

  private getZoomWithMouseTracking(timestamp: number, scale: number): { x: number; y: number; scale: number } {
    // If not zoomed, return center
    if (scale <= 1.01) {
      // Reset camera state when not zoomed
      this.cameraState.x = 0.5
      this.cameraState.y = 0.5
      this.cameraState.vx = 0
      this.cameraState.vy = 0
      return { x: 0.5, y: 0.5, scale: 1 }
    }

    // Find the mouse position at this timestamp with interpolation
    const mousePos = this.getInterpolatedMousePosition(timestamp)
    
    // Apply low-pass filtering with zoom-aware smoothing
    const smoothedPos = this.applyCameraSmoothing(mousePos, scale, timestamp)

    return {
      x: smoothedPos.x,
      y: smoothedPos.y,
      scale: scale
    }
  }

  private getInterpolatedMousePosition(timestamp: number): { x: number; y: number } {
    if (!this.allEvents || this.allEvents.length === 0) {
      return { x: 0.5, y: 0.5 }
    }

    // Find the two events surrounding this timestamp for interpolation
    let before: ZoomMouseEvent | null = null
    let after: ZoomMouseEvent | null = null

    for (let i = 0; i < this.allEvents.length; i++) {
      const event = this.allEvents[i]
      if (event.timestamp <= timestamp) {
        before = event
      } else {
        after = event
        break
      }
    }

    // If we have both events, interpolate between them
    if (before && after) {
      const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
      const smoothProgress = easeInOutQuad(Math.min(1, Math.max(0, progress)))
      
      // Use the actual screen dimensions from the events if available
      const beforeWidth = before.windowWidth || this.videoWidth
      const beforeHeight = before.windowHeight || this.videoHeight
      const afterWidth = after.windowWidth || this.videoWidth
      const afterHeight = after.windowHeight || this.videoHeight
      
      // Normalize and interpolate
      const beforeX = before.mouseX / beforeWidth
      const beforeY = before.mouseY / beforeHeight
      const afterX = after.mouseX / afterWidth
      const afterY = after.mouseY / afterHeight
      
      return {
        x: beforeX + (afterX - beforeX) * smoothProgress,
        y: beforeY + (afterY - beforeY) * smoothProgress
      }
    }

    // If we only have a before event, use it
    if (before) {
      const width = before.windowWidth || this.videoWidth
      const height = before.windowHeight || this.videoHeight
      return {
        x: before.mouseX / width,
        y: before.mouseY / height
      }
    }

    // If we only have an after event (shouldn't happen), use it
    if (after) {
      const width = after.windowWidth || this.videoWidth
      const height = after.windowHeight || this.videoHeight
      return {
        x: after.mouseX / width,
        y: after.mouseY / height
      }
    }

    // Fallback to center if no mouse data
    return { x: 0.5, y: 0.5 }
  }

  private applyCameraSmoothing(target: { x: number; y: number }, zoomScale: number, timestamp: number): { x: number; y: number } {
    // Calculate time delta
    const deltaTime = this.cameraState.lastTime > 0 
      ? Math.min((timestamp - this.cameraState.lastTime) / 1000, 0.1) // Cap at 100ms to prevent jumps
      : 0.016 // Default to 60fps

    // Adjust smoothing factor based on zoom level
    // More zoom = more responsive (less smoothing) to keep mouse in frame
    const zoomFactor = Math.pow(zoomScale, 0.7) // Gentle scaling
    const smoothFactor = this.BASE_SMOOTH_FACTOR * zoomFactor * this.ZOOM_SMOOTH_BOOST

    // Calculate velocity for prediction
    const newVx = (target.x - this.cameraState.x) / Math.max(deltaTime, 0.001)
    const newVy = (target.y - this.cameraState.y) / Math.max(deltaTime, 0.001)

    // Apply velocity damping and update
    this.cameraState.vx = this.cameraState.vx * this.VELOCITY_DAMPING + newVx * (1 - this.VELOCITY_DAMPING)
    this.cameraState.vy = this.cameraState.vy * this.VELOCITY_DAMPING + newVy * (1 - this.VELOCITY_DAMPING)

    // Predict future position based on velocity
    const predictedX = target.x + this.cameraState.vx * deltaTime * this.PREDICTION_WEIGHT
    const predictedY = target.y + this.cameraState.vy * deltaTime * this.PREDICTION_WEIGHT

    // Apply exponential moving average (low-pass filter) with prediction
    const targetX = target.x * (1 - this.PREDICTION_WEIGHT) + predictedX * this.PREDICTION_WEIGHT
    const targetY = target.y * (1 - this.PREDICTION_WEIGHT) + predictedY * this.PREDICTION_WEIGHT

    // Smooth camera movement with adjusted factor
    this.cameraState.x += (targetX - this.cameraState.x) * smoothFactor
    this.cameraState.y += (targetY - this.cameraState.y) * smoothFactor

    // Ensure we stay within bounds when zoomed
    const margin = 0.5 / zoomScale // Keep some margin from edges
    this.cameraState.x = Math.max(margin, Math.min(1 - margin, this.cameraState.x))
    this.cameraState.y = Math.max(margin, Math.min(1 - margin, this.cameraState.y))

    // Update last time
    this.cameraState.lastTime = timestamp

    return {
      x: this.cameraState.x,
      y: this.cameraState.y
    }
  }

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

    // Calculate source coordinates with improved clamping
    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight
    
    // Ensure we don't go out of bounds
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

  getKeyframes(): ZoomKeyframe[] {
    return this.keyframes
  }

  // Reset camera state (useful when switching clips or restarting)
  resetCameraState() {
    this.cameraState = {
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      lastTime: 0
    }
  }
}
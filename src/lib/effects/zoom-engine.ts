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

interface ActivityZone {
  startTime: number
  endTime: number
  centerX: number
  centerY: number
  eventCount: number
  hasClick: boolean
}

export class ZoomEngine {
  private keyframes: ZoomKeyframe[] = []
  private allEvents: ZoomMouseEvent[] = [] // Store all events for continuous tracking
  private videoWidth = 0
  private videoHeight = 0
  
  // Simple thresholds - like Screen Studio
  private readonly ACTIVITY_WINDOW = 300 // ms - group events within this window
  private readonly MIN_EVENTS_TO_ZOOM = 3 // Need activity to trigger zoom
  private readonly ZOOM_OUT_DELAY = 1200 // ms - stay zoomed for a bit after activity stops
  private readonly ZOOM_SCALE = 1.6 // Single zoom level for consistency
  private readonly CLICK_BOOST_SCALE = 1.8 // Slightly more zoom for clicks
  private readonly MERGE_DISTANCE = 2000 // ms - merge zones closer than this

  constructor(private options: ZoomOptions = {}) {
    this.options = {
      enabled: true,
      sensitivity: 1.0,
      maxZoom: 2.0,
      zoomSpeed: 0.1,
      smoothing: true,
      clickZoom: true,
      panSpeed: 0.05,
      ...options
    }
  }

  generateKeyframes(events: ZoomMouseEvent[], videoDuration: number, videoWidth: number, videoHeight: number): ZoomKeyframe[] {
    console.log(`🎯 ZoomEngine.generateKeyframes: enabled=${this.options.enabled}, events=${events.length}`)
    
    if (!this.options.enabled || events.length === 0 || videoDuration <= 0) {
      return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'default' }]
    }

    // Validate dimensions - use event dimensions if video dimensions are invalid
    let actualWidth = videoWidth
    let actualHeight = videoHeight
    
    if (!actualWidth || !actualHeight || actualWidth <= 0 || actualHeight <= 0) {
      // Try to get dimensions from events
      const firstEventWithDimensions = events.find(e => e.windowWidth && e.windowHeight)
      if (firstEventWithDimensions && firstEventWithDimensions.windowWidth && firstEventWithDimensions.windowHeight) {
        actualWidth = firstEventWithDimensions.windowWidth
        actualHeight = firstEventWithDimensions.windowHeight
        console.log(`📐 Using dimensions from events: ${actualWidth}x${actualHeight}`)
      } else {
        console.error('❌ No valid dimensions provided and events lack dimension info')
        return [{ timestamp: 0, x: 0.5, y: 0.5, scale: 1, reason: 'error-no-dimensions' }]
      }
    }

    // Store dimensions for normalization
    this.videoWidth = actualWidth
    this.videoHeight = actualHeight

    // Store all events for continuous mouse tracking
    this.allEvents = events

    // Step 1: Cluster events into activity zones
    const zones = this.clusterIntoActivityZones(events, actualWidth, actualHeight)
    
    // Step 2: Merge nearby zones to prevent oscillation
    const mergedZones = this.mergeNearbyZones(zones)
    
    // Step 3: Convert zones to simple keyframes (just for zoom scale, not position)
    this.keyframes = this.zonesToKeyframes(mergedZones, videoDuration)
    
    console.log(`🔍 Generated ${this.keyframes.length} keyframes from ${mergedZones.length} activity zones`)
    return this.keyframes
  }

  private clusterIntoActivityZones(events: ZoomMouseEvent[], width: number, height: number): ActivityZone[] {
    const zones: ActivityZone[] = []
    let currentZone: ActivityZone | null = null

    for (const event of events) {
      // Use event's own dimensions if available, otherwise use video dimensions
      const eventWidth = event.windowWidth || width
      const eventHeight = event.windowHeight || height
      const normalizedX = event.mouseX / eventWidth
      const normalizedY = event.mouseY / eventHeight

      // Check if we should start a new zone
      if (!currentZone || event.timestamp - currentZone.endTime > this.ACTIVITY_WINDOW) {
        // Only create zone if previous zone has enough events
        if (currentZone && currentZone.eventCount < this.MIN_EVENTS_TO_ZOOM && !currentZone.hasClick) {
          zones.pop() // Remove zones with too little activity
        }
        
        currentZone = {
          startTime: event.timestamp,
          endTime: event.timestamp,
          centerX: normalizedX,
          centerY: normalizedY,
          eventCount: 1,
          hasClick: event.eventType === 'click'
        }
        zones.push(currentZone)
      } else {
        // Update existing zone
        currentZone.endTime = event.timestamp
        currentZone.eventCount++
        
        // Weighted average for center position
        const weight = 0.2 // Blend new positions slowly
        currentZone.centerX = currentZone.centerX * (1 - weight) + normalizedX * weight
        currentZone.centerY = currentZone.centerY * (1 - weight) + normalizedY * weight
        
        if (event.eventType === 'click') {
          currentZone.hasClick = true
          // Clicks immediately update center
          currentZone.centerX = normalizedX
          currentZone.centerY = normalizedY
        }
      }
    }

    // Filter out zones with insufficient activity (unless they have clicks)
    return zones.filter(z => z.eventCount >= this.MIN_EVENTS_TO_ZOOM || z.hasClick)
  }

  private mergeNearbyZones(zones: ActivityZone[]): ActivityZone[] {
    if (zones.length <= 1) return zones

    const merged: ActivityZone[] = []
    let current = zones[0]

    for (let i = 1; i < zones.length; i++) {
      const next = zones[i]
      const gap = next.startTime - current.endTime
      
      // Merge if zones are close in time
      if (gap < this.MERGE_DISTANCE) {
        current = {
          startTime: current.startTime,
          endTime: next.endTime,
          centerX: (current.centerX * current.eventCount + next.centerX * next.eventCount) / 
                   (current.eventCount + next.eventCount),
          centerY: (current.centerY * current.eventCount + next.centerY * next.eventCount) / 
                   (current.eventCount + next.eventCount),
          eventCount: current.eventCount + next.eventCount,
          hasClick: current.hasClick || next.hasClick
        }
      } else {
        merged.push(current)
        current = next
      }
    }
    merged.push(current)

    return merged
  }

  private zonesToKeyframes(zones: ActivityZone[], videoDuration: number): ZoomKeyframe[] {
    const keyframes: ZoomKeyframe[] = []
    
    // Start at center, no zoom
    keyframes.push({ 
      timestamp: 0, 
      x: 0.5, 
      y: 0.5, 
      scale: 1, 
      reason: 'start' 
    })

    let lastZoomOutTime = 0

    for (const zone of zones) {
      const zoomScale = zone.hasClick ? this.CLICK_BOOST_SCALE : this.ZOOM_SCALE
      
      // Only add zoom-in if we're not already zoomed
      const timeSinceLastZoomOut = zone.startTime - lastZoomOutTime
      if (timeSinceLastZoomOut > 500) { // Prevent immediate re-zoom
        // Zoom in (position will be determined by mouse tracking)
        keyframes.push({
          timestamp: zone.startTime,
          x: 0.5, // Position will be overridden by mouse tracking
          y: 0.5, // Position will be overridden by mouse tracking
          scale: zoomScale,
          reason: zone.hasClick ? 'click-zoom' : 'activity-zoom'
        })
      }

      // Hold zoom during activity (position follows mouse)
      if (zone.endTime - zone.startTime > 200) {
        keyframes.push({
          timestamp: zone.endTime,
          x: 0.5, // Position will be overridden by mouse tracking
          y: 0.5, // Position will be overridden by mouse tracking
          scale: zoomScale,
          reason: 'hold'
        })
      }

      // Zoom out after delay
      const zoomOutTime = zone.endTime + this.ZOOM_OUT_DELAY
      keyframes.push({
        timestamp: zoomOutTime,
        x: 0.5,
        y: 0.5,
        scale: 1,
        reason: 'zoom-out'
      })
      lastZoomOutTime = zoomOutTime
    }

    // Clean up redundant keyframes
    const cleaned = this.cleanupKeyframes(keyframes)

    // Ensure we end at video duration
    const lastKf = cleaned[cleaned.length - 1]
    if (lastKf.timestamp < videoDuration) {
      cleaned.push({
        timestamp: videoDuration,
        x: lastKf.x,
        y: lastKf.y,
        scale: lastKf.scale,
        reason: 'end'
      })
    }

    return cleaned
  }

  private cleanupKeyframes(keyframes: ZoomKeyframe[]): ZoomKeyframe[] {
    if (keyframes.length <= 2) return keyframes

    const cleaned: ZoomKeyframe[] = [keyframes[0]]
    
    for (let i = 1; i < keyframes.length - 1; i++) {
      const prev = cleaned[cleaned.length - 1]
      const curr = keyframes[i]
      const next = keyframes[i + 1]
      
      // Skip redundant keyframes (same position and scale)
      const isSameAsPrev = Math.abs(curr.x - prev.x) < 0.01 && 
                          Math.abs(curr.y - prev.y) < 0.01 && 
                          Math.abs(curr.scale - prev.scale) < 0.01
      
      const isSameAsNext = Math.abs(curr.x - next.x) < 0.01 && 
                          Math.abs(curr.y - next.y) < 0.01 && 
                          Math.abs(curr.scale - next.scale) < 0.01
      
      // Keep keyframe if it represents a change
      if (!isSameAsPrev || !isSameAsNext) {
        cleaned.push(curr)
      }
    }
    
    cleaned.push(keyframes[keyframes.length - 1])
    return cleaned
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
      return { x: 0.5, y: 0.5, scale: 1 }
    }

    // Find the mouse position at this timestamp for continuous tracking
    const mousePos = this.getMousePositionAtTime(timestamp)
    
    // Smooth the mouse position for less jarring movement
    const smoothedX = this.smoothPosition(mousePos.x, 0.15)
    const smoothedY = this.smoothPosition(mousePos.y, 0.15)

    return {
      x: smoothedX,
      y: smoothedY,
      scale: scale
    }
  }

  private getMousePositionAtTime(timestamp: number): { x: number; y: number } {
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

  private lastSmoothedX = 0.5
  private lastSmoothedY = 0.5

  private smoothPosition(target: number, factor: number): number {
    // For now, return target directly - smoothing can cause lag in following
    // Can be re-enabled if needed for less jarring movement
    return target
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

    // Calculate source coordinates with clamping
    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight
    
    const sx = Math.max(0, Math.min(sourceWidth - zoomWidth, centerX - zoomWidth / 2))
    const sy = Math.max(0, Math.min(sourceHeight - zoomHeight, centerY - zoomHeight / 2))

    // Draw
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
}
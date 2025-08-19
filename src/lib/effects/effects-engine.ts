/**
 * Effects Engine - Simple orchestration of video effects
 */

import { easeOutExpo, easeInQuad } from '@/lib/utils/easing'

interface ZoomEffect {
  id: string
  type: 'zoom'
  startTime: number
  endTime: number
  targetX: number
  targetY: number
  scale: number
  introMs: number
  outroMs: number
}

interface MouseEvent {
  timestamp: number
  x: number
  y: number
  type: 'move' | 'click'
}

interface MouseCluster {
  events: MouseEvent[]
  startTime: number
  endTime: number
  center: { x: number; y: number }
  boundingBox: { 
    x: number
    y: number
    width: number
    height: number
  }
  density: number // How tightly grouped the events are
  stability: number // How long mouse stayed in region
}

export class EffectsEngine {
  private effects: ZoomEffect[] = []
  private events: MouseEvent[] = []
  private duration = 0
  private width = 1920
  private height = 1080
  private interpolatedMouseCache = new Map<number, { x: number; y: number }>()
  private lastPanPosition = { x: 0.5, y: 0.5 } // Track last pan position for smooth transitions

  // Cluster detection parameters
  private readonly MIN_CLUSTER_TIME = 800 // Minimum time in cluster to trigger zoom (ms)
  private readonly MAX_CLUSTER_SIZE = 0.4 // Maximum cluster size as fraction of screen
  private readonly MIN_CLUSTER_EVENTS = 5 // Minimum events to form a cluster
  private readonly CLUSTER_TIME_WINDOW = 2000 // Time window to analyze for clusters (ms)
  private readonly CLUSTER_MERGE_DISTANCE = 0.15 // Distance to merge nearby clusters
  private readonly MIN_ZOOM_DURATION = 1000 // Minimum zoom time
  private readonly MAX_ZOOM_DURATION = 8000 // Maximum zoom time

  /**
   * Initialize from recording
   */
  initializeFromRecording(recording: any): void {
    if (!recording) {
      console.error('[ERROR] No recording provided to effects engine');
      return
    }

    this.duration = recording.duration || 0
    
    // Try to get dimensions from multiple possible locations
    // Check recording.metadata first since that's where actual video dimensions are stored
    if (recording.metadata?.videoWidth && recording.metadata?.videoHeight) {
      this.width = recording.metadata.videoWidth
      this.height = recording.metadata.videoHeight
    } else if (recording.width && recording.height) {
      this.width = recording.width
      this.height = recording.height
    } else if (recording.metadata?.width && recording.metadata?.height) {
      this.width = recording.metadata.width
      this.height = recording.metadata.height
    } else {
      // NO FALLBACK - fail loudly
      console.error('[ERROR] No video dimensions found in recording!', {
        recording,
        metadata: recording.metadata
      });
      throw new Error('Video dimensions not found in recording. Cannot initialize effects engine.');
    }

    // Clear interpolation cache when reinitializing
    this.interpolatedMouseCache.clear()

    // Convert metadata to events - expect proper format only
    this.events = []

    if (recording.metadata?.mouseEvents) {
      this.events.push(...recording.metadata.mouseEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'move' as const
      })))
    }

    if (recording.metadata?.clickEvents) {
      this.events.push(...recording.metadata.clickEvents.map((e: any) => ({
        timestamp: e.timestamp,
        x: e.x,
        y: e.y,
        type: 'click' as const
      })))
    }

    this.events.sort((a, b) => a.timestamp - b.timestamp)

    // Use cluster-based zoom detection for more intelligent zooming
    this.detectClusterBasedZooms()
  }

  /**
   * Cluster-based zoom detection - intelligently detects when mouse stays in a region
   * This mimics Screen Studio's smart zooming behavior
   */
  private detectClusterBasedZooms(): void {
    this.effects = []
    
    // Detect mouse clusters
    const clusters = this.detectMouseClusters()
    
    if (clusters.length === 0) return
    
    // Convert stable clusters to zoom effects
    clusters.forEach(cluster => {
      // Only zoom if cluster is stable and properly sized
      const clusterDuration = cluster.endTime - cluster.startTime
      const normalizedWidth = cluster.boundingBox.width / this.width
      const normalizedHeight = cluster.boundingBox.height / this.height
      const clusterSize = Math.max(normalizedWidth, normalizedHeight)
      
      // Skip if cluster is too large or too brief
      if (clusterSize > this.MAX_CLUSTER_SIZE || clusterDuration < this.MIN_CLUSTER_TIME) {
        return
      }
      
      // Calculate optimal zoom scale based on cluster size
      let zoomScale = 2.0
      if (clusterSize < 0.15) {
        zoomScale = 2.5 // Small cluster - zoom in more
      } else if (clusterSize < 0.25) {
        zoomScale = 2.0 // Medium cluster
      } else {
        zoomScale = 1.5 // Large cluster - gentle zoom
      }
      
      // Center the zoom on the cluster
      const targetX = cluster.center.x / this.width
      const targetY = cluster.center.y / this.height
      
      // Ensure zoom doesn't exceed video duration
      const effectiveDuration = Math.min(
        clusterDuration + 1000, // Add buffer for outro
        this.MAX_ZOOM_DURATION,
        this.duration - cluster.startTime - 500
      )
      
      if (effectiveDuration > this.MIN_ZOOM_DURATION) {
        this.effects.push({
          id: `zoom-cluster-${cluster.startTime}`,
          type: 'zoom',
          startTime: cluster.startTime,
          endTime: cluster.startTime + effectiveDuration,
          targetX,
          targetY,
          scale: zoomScale,
          introMs: 400, // Slightly slower intro for smoother feel
          outroMs: 500  // Slower outro
        })
      }
    })
    
    // Merge overlapping zoom effects
    this.mergeOverlappingZooms()
  }

  /**
   * Detect mouse clusters using spatial-temporal analysis
   */
  private detectMouseClusters(): MouseCluster[] {
    if (this.events.length < this.MIN_CLUSTER_EVENTS) return []
    
    const clusters: MouseCluster[] = []
    let i = 0
    
    while (i < this.events.length) {
      // Collect events within time window
      const windowStart = this.events[i].timestamp
      const windowEnd = windowStart + this.CLUSTER_TIME_WINDOW
      const windowEvents: MouseEvent[] = []
      
      let j = i
      while (j < this.events.length && this.events[j].timestamp <= windowEnd) {
        windowEvents.push(this.events[j])
        j++
      }
      
      // Check if we have enough events
      if (windowEvents.length >= this.MIN_CLUSTER_EVENTS) {
        // Calculate bounding box and center
        const cluster = this.analyzeCluster(windowEvents)
        
        // Check cluster quality - be more lenient with stability
        // Lower stability threshold since mouse events might not be perfectly regular
        if (cluster.density > 0.3 && cluster.stability > 0.35) {
          
          // Check if this cluster should be merged with the previous one
          if (clusters.length > 0) {
            const lastCluster = clusters[clusters.length - 1]
            const distance = this.calculateClusterDistance(lastCluster, cluster)
            
            if (distance < this.CLUSTER_MERGE_DISTANCE) {
              // Merge clusters
              this.mergeClusters(lastCluster, cluster)
            } else {
              clusters.push(cluster)
            }
          } else {
            clusters.push(cluster)
          }
          
          // Skip ahead to avoid overlapping clusters
          i = j - 1
        }
      }
      
      i++
    }
    
    return clusters
  }
  
  /**
   * Analyze a set of events to create a cluster
   */
  private analyzeCluster(events: MouseEvent[]): MouseCluster {
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let sumX = 0, sumY = 0
    
    events.forEach(event => {
      minX = Math.min(minX, event.x)
      maxX = Math.max(maxX, event.x)
      minY = Math.min(minY, event.y)
      maxY = Math.max(maxY, event.y)
      sumX += event.x
      sumY += event.y
    })
    
    const boundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
    
    // Calculate center (weighted by event density)
    const center = {
      x: sumX / events.length,
      y: sumY / events.length
    }
    
    // Calculate density (how tightly grouped events are)
    const area = boundingBox.width * boundingBox.height
    const maxArea = this.width * this.height
    const density = area > 0 ? 1 - (area / maxArea) : 1
    
    // Calculate stability (based on time spread and movement patterns)
    const timeSpan = events[events.length - 1].timestamp - events[0].timestamp
    const expectedEvents = timeSpan / 50 // Assuming ~20fps event rate
    const stability = Math.min(1, events.length / Math.max(1, expectedEvents))
    
    return {
      events,
      startTime: events[0].timestamp,
      endTime: events[events.length - 1].timestamp,
      center,
      boundingBox,
      density,
      stability
    }
  }
  
  /**
   * Calculate distance between two clusters
   */
  private calculateClusterDistance(cluster1: MouseCluster, cluster2: MouseCluster): number {
    const dx = (cluster1.center.x - cluster2.center.x) / this.width
    const dy = (cluster1.center.y - cluster2.center.y) / this.height
    return Math.sqrt(dx * dx + dy * dy)
  }
  
  /**
   * Merge two clusters together
   */
  private mergeClusters(target: MouseCluster, source: MouseCluster): void {
    // Combine events
    target.events.push(...source.events)
    target.events.sort((a, b) => a.timestamp - b.timestamp)
    
    // Update time range
    target.startTime = Math.min(target.startTime, source.startTime)
    target.endTime = Math.max(target.endTime, source.endTime)
    
    // Recalculate bounding box and center
    const merged = this.analyzeCluster(target.events)
    target.boundingBox = merged.boundingBox
    target.center = merged.center
    target.density = merged.density
    target.stability = merged.stability
  }
  
  /**
   * Merge overlapping zoom effects
   */
  private mergeOverlappingZooms(): void {
    if (this.effects.length < 2) return
    
    // Sort by start time
    this.effects.sort((a, b) => a.startTime - b.startTime)
    
    const merged: ZoomEffect[] = []
    let current = this.effects[0]
    
    for (let i = 1; i < this.effects.length; i++) {
      const next = this.effects[i]
      
      // Check for overlap or very close effects
      if (current.endTime >= next.startTime - 500) {
        // Merge effects - extend current to cover both
        current.endTime = Math.max(current.endTime, next.endTime)
        // Use weighted average for target position
        const currentWeight = (current.endTime - current.startTime)
        const nextWeight = (next.endTime - next.startTime)
        const totalWeight = currentWeight + nextWeight
        current.targetX = (current.targetX * currentWeight + next.targetX * nextWeight) / totalWeight
        current.targetY = (current.targetY * currentWeight + next.targetY * nextWeight) / totalWeight
      } else {
        merged.push(current)
        current = next
      }
    }
    
    merged.push(current)
    this.effects = merged
  }

  // Note: Old activity-based detection removed in favor of cluster-based approach
  // The cluster-based approach better mimics Screen Studio's intelligent zoom behavior


  /**
   * Get zoom state at timestamp with mouse position for smart panning
   */
  getZoomState(
    timestamp: number,
    mousePosition: { x: number; y: number } | null
  ): { x: number; y: number; scale: number } {
    // Find active zoom effect
    const activeZoom = this.effects.find(effect =>
      timestamp >= effect.startTime && timestamp <= effect.endTime
    )

    if (!activeZoom) {
      // Reset pan position when no zoom is active
      this.lastPanPosition = { x: 0.5, y: 0.5 }
      return { x: 0.5, y: 0.5, scale: 1.0 }
    }

    const elapsed = timestamp - activeZoom.startTime
    const effectDuration = activeZoom.endTime - activeZoom.startTime

    let x: number, y: number, scale: number

    // Intro phase - zoom in
    if (elapsed < activeZoom.introMs) {
      const progress = elapsed / activeZoom.introMs
      const eased = easeOutExpo(progress)

      scale = 1.0 + (activeZoom.scale - 1.0) * eased
      x = 0.5 + (activeZoom.targetX - 0.5) * eased
      y = 0.5 + (activeZoom.targetY - 0.5) * eased

      // Initialize pan position during intro
      this.lastPanPosition = { x, y }
    }
    // Outro phase - zoom out
    else if (elapsed > effectDuration - activeZoom.outroMs) {
      const outroElapsed = elapsed - (effectDuration - activeZoom.outroMs)
      const progress = outroElapsed / activeZoom.outroMs
      const eased = easeInQuad(progress)

      scale = activeZoom.scale - (activeZoom.scale - 1.0) * eased
      x = activeZoom.targetX + (0.5 - activeZoom.targetX) * eased
      y = activeZoom.targetY + (0.5 - activeZoom.targetY) * eased
    }
    // Hold phase - apply smart panning if mouse position provided
    else {
      scale = activeZoom.scale
      x = activeZoom.targetX
      y = activeZoom.targetY

      // Apply smart panning during hold phase
      if (mousePosition && scale > 1.0) {
        const panResult = this.calculateSmartPan(
          { x, y },
          mousePosition,
          scale
        )
        x = panResult.x
        y = panResult.y
      }
    }

    return { x, y, scale }
  }

  /**
   * Get interpolated mouse position at timestamp
   */
  getMousePositionAtTime(timestamp: number): { x: number; y: number } | null {
    // Check cache first
    const cached = this.interpolatedMouseCache.get(Math.floor(timestamp))
    if (cached) return cached

    if (this.events.length === 0) return null

    // Find surrounding events
    let prevEvent: MouseEvent | null = null
    let nextEvent: MouseEvent | null = null

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      if (event.timestamp <= timestamp) {
        prevEvent = event
      } else {
        nextEvent = event
        break
      }
    }

    // If we only have one event or timestamp is outside range
    if (!prevEvent) {
      return this.events[0] ? {
        x: this.events[0].x / this.width,
        y: this.events[0].y / this.height
      } : null
    }

    if (!nextEvent) {
      return {
        x: prevEvent.x / this.width,
        y: prevEvent.y / this.height
      }
    }

    // Interpolate between events
    const timeDiff = nextEvent.timestamp - prevEvent.timestamp
    if (timeDiff === 0) {
      return {
        x: prevEvent.x / this.width,
        y: prevEvent.y / this.height
      }
    }

    const progress = (timestamp - prevEvent.timestamp) / timeDiff

    // Use cubic interpolation for smoother motion
    const smoothProgress = progress * progress * (3 - 2 * progress)

    const interpolatedX = prevEvent.x + (nextEvent.x - prevEvent.x) * smoothProgress
    const interpolatedY = prevEvent.y + (nextEvent.y - prevEvent.y) * smoothProgress

    const result = {
      x: interpolatedX / this.width,
      y: interpolatedY / this.height
    }

    // Cache the result for performance
    this.interpolatedMouseCache.set(Math.floor(timestamp), result)

    // Limit cache size
    if (this.interpolatedMouseCache.size > 1000) {
      const firstKey = this.interpolatedMouseCache.keys().next().value
      if (firstKey !== undefined) {
        this.interpolatedMouseCache.delete(firstKey)
      }
    }

    return result
  }

  /**
   * Calculate smart pan to keep mouse in frame
   */
  private calculateSmartPan(
    currentCenter: { x: number; y: number },
    mousePos: { x: number; y: number },
    scale: number
  ): { x: number; y: number } {
    // Mouse position and currentCenter are already in normalized coordinates (0-1)
    // Calculate visible frame dimensions in normalized space
    const frameWidth = 1.0 / scale
    const frameHeight = 1.0 / scale

    // Zone-based configuration - more aggressive following
    const deadZone = 0.15 // Center 15% - reduced dead zone
    const gentleZone = 0.3 // 15-30% - gentle drift
    const activeZone = 0.4 // 30-40% - moderate following
    // Beyond 40% - aggressive following to keep in frame
    
    const maxPanDistance = 0.4 // Allow more freedom to follow mouse

    // Calculate frame boundaries in normalized space
    const leftEdge = currentCenter.x - frameWidth / 2
    const rightEdge = currentCenter.x + frameWidth / 2
    const topEdge = currentCenter.y - frameHeight / 2
    const bottomEdge = currentCenter.y + frameHeight / 2

    // Check if mouse is outside frame
    const mouseOutside = mousePos.x < leftEdge || mousePos.x > rightEdge ||
      mousePos.y < topEdge || mousePos.y > bottomEdge

    let targetX = currentCenter.x
    let targetY = currentCenter.y

    if (mouseOutside) {
      // Mouse is outside - aggressively pull camera to follow
      const pullStrength = 0.5 // Much stronger pull
      targetX = currentCenter.x + (mousePos.x - currentCenter.x) * pullStrength
      targetY = currentCenter.y + (mousePos.y - currentCenter.y) * pullStrength
    } else {
      // Mouse is inside - use zone-based panning for stability
      
      // Calculate relative position within frame (0 = center, 1 = edge)
      const relX = Math.abs(mousePos.x - currentCenter.x) / (frameWidth / 2)
      const relY = Math.abs(mousePos.y - currentCenter.y) / (frameHeight / 2)
      
      // Horizontal panning based on zones
      if (relX < deadZone) {
        // Dead zone - no horizontal movement
        targetX = currentCenter.x
      } else if (relX < gentleZone) {
        // Gentle zone - slight drift
        const zoneProgress = (relX - deadZone) / (gentleZone - deadZone)
        const drift = frameWidth * 0.01 * zoneProgress // Increased from 0.002
        targetX = currentCenter.x + (mousePos.x > currentCenter.x ? drift : -drift)
      } else if (relX < activeZone) {
        // Active zone - moderate following
        const zoneProgress = (relX - gentleZone) / (activeZone - gentleZone)
        const follow = frameWidth * (0.02 + 0.04 * zoneProgress) // Increased from 0.005 + 0.015
        targetX = currentCenter.x + (mousePos.x > currentCenter.x ? follow : -follow)
      } else {
        // Danger zone - aggressive following
        const urgency = Math.min((relX - activeZone) / (1 - activeZone), 1)
        const follow = frameWidth * (0.06 + 0.08 * urgency) // Increased from 0.02 + 0.03
        targetX = currentCenter.x + (mousePos.x > currentCenter.x ? follow : -follow)
      }
      
      // Vertical panning based on zones
      if (relY < deadZone) {
        // Dead zone - no vertical movement
        targetY = currentCenter.y
      } else if (relY < gentleZone) {
        // Gentle zone - slight drift
        const zoneProgress = (relY - deadZone) / (gentleZone - deadZone)
        const drift = frameHeight * 0.01 * zoneProgress // Increased from 0.002
        targetY = currentCenter.y + (mousePos.y > currentCenter.y ? drift : -drift)
      } else if (relY < activeZone) {
        // Active zone - moderate following
        const zoneProgress = (relY - gentleZone) / (activeZone - gentleZone)
        const follow = frameHeight * (0.02 + 0.04 * zoneProgress) // Increased from 0.005 + 0.015
        targetY = currentCenter.y + (mousePos.y > currentCenter.y ? follow : -follow)
      } else {
        // Danger zone - aggressive following
        const urgency = Math.min((relY - activeZone) / (1 - activeZone), 1)
        const follow = frameHeight * (0.06 + 0.08 * urgency) // Increased from 0.02 + 0.03
        targetY = currentCenter.y + (mousePos.y > currentCenter.y ? follow : -follow)
      }
    }

    // Adaptive smoothing based on distance from target
    const distToTarget = Math.sqrt(
      Math.pow(targetX - this.lastPanPosition.x, 2) + 
      Math.pow(targetY - this.lastPanPosition.y, 2)
    )
    const basePanSpeed = mouseOutside ? 0.4 : 0.25 // Increased from 0.22 : 0.12
    const adaptiveSpeed = basePanSpeed * (1 + distToTarget * 3) // Increased multiplier
    
    // Smooth transition with adaptive speed
    let newX = this.lastPanPosition.x + (targetX - this.lastPanPosition.x) * adaptiveSpeed
    let newY = this.lastPanPosition.y + (targetY - this.lastPanPosition.y) * adaptiveSpeed

    // Limit pan distance from original zoom target for stability
    const activeZoom = this.effects.find(e =>
      e.type === 'zoom' && e.targetX !== undefined
    )

    if (activeZoom) {
      // Clamp to maximum distance from zoom target
      const distX = newX - activeZoom.targetX
      const distY = newY - activeZoom.targetY

      if (Math.abs(distX) > maxPanDistance) {
        newX = activeZoom.targetX + Math.sign(distX) * maxPanDistance
      }
      if (Math.abs(distY) > maxPanDistance) {
        newY = activeZoom.targetY + Math.sign(distY) * maxPanDistance
      }
    }

    // Ensure we don't pan outside the video bounds
    const halfFrameWidth = frameWidth / 2
    const halfFrameHeight = frameHeight / 2
    newX = Math.max(halfFrameWidth, Math.min(1.0 - halfFrameWidth, newX))
    newY = Math.max(halfFrameHeight, Math.min(1.0 - halfFrameHeight, newY))

    // Store for next frame
    this.lastPanPosition = { x: newX, y: newY }

    return { x: newX, y: newY }
  }

  // Note: velocity and distance calculations removed - using cluster-based detection instead

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

    const zoomWidth = sourceWidth / zoom.scale
    const zoomHeight = sourceHeight / zoom.scale

    const centerX = zoom.x * sourceWidth
    const centerY = zoom.y * sourceHeight

    const sx = Math.max(0, centerX - (zoomWidth / 2))
    const sy = Math.max(0, centerY - (zoomHeight / 2))
    const sw = Math.min(zoomWidth, sourceWidth - sx)
    const sh = Math.min(zoomHeight, sourceHeight - sy)

    ctx.clearRect(0, 0, width, height)

    if (sw > 0 && sh > 0) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        source as CanvasImageSource,
        sx, sy, sw, sh,
        0, 0, width, height
      )
    }
  }

  /**
   * Get effects for timeline
   */
  getEffects(): ZoomEffect[] {
    return this.effects
  }

  /**
   * Add manual zoom effect
   */
  addZoomEffect(startTime: number, endTime: number, x: number, y: number, scale: number) {
    this.effects.push({
      id: `zoom-${Date.now()}`,
      type: 'zoom',
      startTime,
      endTime,
      targetX: x,
      targetY: y,
      scale,
      introMs: 300,
      outroMs: 300
    })
    this.effects.sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Remove effect by ID
   */
  removeEffect(effectId: string) {
    this.effects = this.effects.filter(e => e.id !== effectId)
  }

  /**
   * Clear all effects
   */
  clearEffects() {
    this.effects = []
    this.interpolatedMouseCache.clear()
  }

  /**
   * Set zoom effects from timeline zoom blocks
   * Replaces all existing zoom effects with the provided blocks
   */
  setZoomEffects(zoomBlocks: any[]) {
    // Remove all existing zoom effects
    this.effects = this.effects.filter(e => e.type !== 'zoom')

    // Add new zoom effects from blocks
    if (zoomBlocks && zoomBlocks.length > 0) {
      for (const block of zoomBlocks) {
        // Convert zoom block to effect format
        // Note: zoom blocks times are already in milliseconds relative to clip
        const effect: ZoomEffect = {
          id: block.id,
          type: 'zoom',
          startTime: block.startTime,
          endTime: block.endTime,
          targetX: block.targetX || 0.5,  // Default to center if not specified
          targetY: block.targetY || 0.5,
          scale: block.scale || 2.0,
          introMs: block.introMs || 300,
          outroMs: block.outroMs || 300
        }
        this.effects.push(effect)
      }

      // Keep effects sorted by start time
      this.effects.sort((a, b) => a.startTime - b.startTime)
    }
  }

  /**
   * Detect zoom effects using cluster-based algorithm
   */
  detectZoomEffects(): void {
    this.detectClusterBasedZooms()
  }


  /**
   * Regenerate effects with different parameters
   */
  regenerateEffects(options?: {
    zoomScale?: number
  }): void {
    // Clear cache when regenerating
    this.interpolatedMouseCache.clear()
    this.lastPanPosition = { x: 0.5, y: 0.5 }

    const { zoomScale = 2.0 } = options || {}

    // Regenerate effects
    this.detectZoomEffects()

    // Update scale for all effects if specified
    if (zoomScale !== 2.0) {
      this.effects.forEach(effect => {
        effect.scale = zoomScale
      })
    }
  }

  /**
   * Get zoom blocks for timeline (Screen Studio style)
   */
  getZoomBlocks(recording: any): any[] {
    if (!recording) return []

    // Initialize if needed
    this.initializeFromRecording(recording)

    // Return zoom effects as blocks directly
    return this.effects.map(effect => ({
      id: effect.id,
      startTime: effect.startTime,
      endTime: effect.endTime,
      introMs: effect.introMs || 500,
      outroMs: effect.outroMs || 500,
      scale: effect.scale,
      targetX: effect.targetX,
      targetY: effect.targetY,
      mode: 'auto' as const
    }))
  }
}

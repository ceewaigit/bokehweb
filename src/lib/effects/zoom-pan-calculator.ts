/**
 * Zoom Pan Calculator
 * Handles dynamic camera panning during zoom based on mouse position
 * Implements Screen Studio-like intelligent following behavior
 */

import type { MouseEvent } from '@/types/project'

interface PanOffset {
  x: number  // Normalized offset (-1 to 1)
  y: number  // Normalized offset (-1 to 1)
}

interface MouseClusterInfo {
  centerX: number
  centerY: number
  velocityX: number
  velocityY: number
  weight: number
}

export class ZoomPanCalculator {
  // Dead zone where no panning occurs (center of screen)
  private readonly DEAD_ZONE_RATIO = 0.3  // 30% of screen dimensions
  
  // Maximum pan distance as ratio of zoomed area
  private readonly MAX_PAN_RATIO = 0.35
  
  // Smoothing factor for pan transitions
  private readonly PAN_SMOOTHING = 0.15
  
  // Edge resistance factor
  private readonly EDGE_RESISTANCE = 0.7
  
  // Velocity influence on panning
  private readonly VELOCITY_WEIGHT = 0.25

  /**
   * Calculate pan offset based on mouse position during zoom
   * Returns normalized pan values that should be applied to the zoom transform
   */
  calculatePanOffset(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): PanOffset {
    // Normalize mouse position to 0-1 range
    const normalizedX = mouseX / videoWidth
    const normalizedY = mouseY / videoHeight
    
    // Calculate distance from center (0.5, 0.5)
    const centerDistX = normalizedX - 0.5
    const centerDistY = normalizedY - 0.5
    
    // Apply dead zone
    const deadZoneX = this.DEAD_ZONE_RATIO / 2
    const deadZoneY = this.DEAD_ZONE_RATIO / 2
    
    let targetPanX = 0
    let targetPanY = 0
    
    // Calculate horizontal pan
    if (Math.abs(centerDistX) > deadZoneX) {
      const beyondDeadZone = centerDistX > 0 
        ? centerDistX - deadZoneX 
        : centerDistX + deadZoneX
      
      // Scale pan amount based on zoom level
      const maxPanX = this.MAX_PAN_RATIO * (zoomScale - 1) / zoomScale
      targetPanX = beyondDeadZone * maxPanX / (0.5 - deadZoneX)
      
      // Apply edge resistance
      targetPanX = this.applyEdgeResistance(targetPanX, normalizedX)
    }
    
    // Calculate vertical pan
    if (Math.abs(centerDistY) > deadZoneY) {
      const beyondDeadZone = centerDistY > 0 
        ? centerDistY - deadZoneY 
        : centerDistY + deadZoneY
      
      // Scale pan amount based on zoom level
      const maxPanY = this.MAX_PAN_RATIO * (zoomScale - 1) / zoomScale
      targetPanY = beyondDeadZone * maxPanY / (0.5 - deadZoneY)
      
      // Apply edge resistance
      targetPanY = this.applyEdgeResistance(targetPanY, normalizedY)
    }
    
    // Smooth transitions
    const smoothedPanX = this.smoothTransition(currentPanX, targetPanX)
    const smoothedPanY = this.smoothTransition(currentPanY, targetPanY)
    
    return {
      x: smoothedPanX,
      y: smoothedPanY
    }
  }

  /**
   * Calculate pan offset for mouse cluster following
   * Used when following the nearest cluster of mouse movements
   */
  calculateClusterPan(
    mouseEvents: MouseEvent[],
    currentTimeMs: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    lookAheadMs: number = 500
  ): PanOffset {
    // Get recent and upcoming mouse events
    const relevantEvents = this.getRelevantEvents(
      mouseEvents,
      currentTimeMs,
      lookAheadMs
    )
    
    if (relevantEvents.length === 0) {
      return { x: 0, y: 0 }
    }
    
    // Perform k-means clustering
    const clusters = this.kMeansClustering(relevantEvents, videoWidth, videoHeight)
    
    // Find the most active cluster
    const activeCluster = this.findActiveCluster(clusters, currentTimeMs)
    
    if (!activeCluster) {
      return { x: 0, y: 0 }
    }
    
    // Calculate pan to follow the active cluster
    return this.calculatePanOffset(
      activeCluster.centerX * videoWidth,
      activeCluster.centerY * videoHeight,
      videoWidth,
      videoHeight,
      zoomScale
    )
  }

  /**
   * Interpolate mouse position at a specific time
   */
  interpolateMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } | null {
    if (!mouseEvents || mouseEvents.length === 0) {
      return null
    }
    
    // Find surrounding events
    let before: MouseEvent | null = null
    let after: MouseEvent | null = null
    
    for (let i = 0; i < mouseEvents.length; i++) {
      if (mouseEvents[i].timestamp <= timeMs) {
        before = mouseEvents[i]
      } else {
        after = mouseEvents[i]
        break
      }
    }
    
    // If we only have one event or time is outside range
    if (!before) {
      return { x: mouseEvents[0].x, y: mouseEvents[0].y }
    }
    if (!after) {
      return { x: before.x, y: before.y }
    }
    
    // Linear interpolation between events
    const timeDiff = after.timestamp - before.timestamp
    if (timeDiff === 0) {
      return { x: before.x, y: before.y }
    }
    
    const t = (timeMs - before.timestamp) / timeDiff
    return {
      x: before.x + (after.x - before.x) * t,
      y: before.y + (after.y - before.y) * t
    }
  }

  private applyEdgeResistance(panValue: number, normalizedPos: number): number {
    // Apply resistance when approaching edges
    const edgeDistance = Math.min(normalizedPos, 1 - normalizedPos)
    const resistanceFactor = edgeDistance < 0.1 
      ? this.EDGE_RESISTANCE * (edgeDistance / 0.1)
      : 1
    
    return panValue * resistanceFactor
  }

  private smoothTransition(current: number, target: number): number {
    // Exponential smoothing for natural movement
    return current + (target - current) * this.PAN_SMOOTHING
  }

  private getRelevantEvents(
    events: MouseEvent[],
    currentTimeMs: number,
    lookAheadMs: number
  ): MouseEvent[] {
    const startTime = currentTimeMs - lookAheadMs
    const endTime = currentTimeMs + lookAheadMs
    
    return events.filter(e => 
      e.timestamp >= startTime && e.timestamp <= endTime
    )
  }

  private kMeansClustering(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number,
    k: number = 3
  ): MouseClusterInfo[] {
    if (events.length < k) {
      // Not enough events for clustering
      return [{
        centerX: events[0].x / videoWidth,
        centerY: events[0].y / videoHeight,
        velocityX: 0,
        velocityY: 0,
        weight: 1
      }]
    }
    
    // Initialize cluster centers randomly from events
    const centers: { x: number; y: number }[] = []
    const usedIndices = new Set<number>()
    
    while (centers.length < k && centers.length < events.length) {
      const idx = Math.floor(Math.random() * events.length)
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx)
        centers.push({
          x: events[idx].x / videoWidth,
          y: events[idx].y / videoHeight
        })
      }
    }
    
    // K-means iterations
    const maxIterations = 10
    let clusters: MouseEvent[][] = []
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign events to nearest center
      clusters = Array(centers.length).fill(null).map(() => [])
      
      for (const event of events) {
        const normalizedX = event.x / videoWidth
        const normalizedY = event.y / videoHeight
        
        let minDist = Infinity
        let nearestCluster = 0
        
        for (let i = 0; i < centers.length; i++) {
          const dist = Math.sqrt(
            Math.pow(normalizedX - centers[i].x, 2) +
            Math.pow(normalizedY - centers[i].y, 2)
          )
          
          if (dist < minDist) {
            minDist = dist
            nearestCluster = i
          }
        }
        
        clusters[nearestCluster].push(event)
      }
      
      // Update centers
      let converged = true
      for (let i = 0; i < centers.length; i++) {
        if (clusters[i].length > 0) {
          const newX = clusters[i].reduce((sum, e) => sum + e.x / videoWidth, 0) / clusters[i].length
          const newY = clusters[i].reduce((sum, e) => sum + e.y / videoHeight, 0) / clusters[i].length
          
          if (Math.abs(newX - centers[i].x) > 0.01 || Math.abs(newY - centers[i].y) > 0.01) {
            converged = false
          }
          
          centers[i].x = newX
          centers[i].y = newY
        }
      }
      
      if (converged) break
    }
    
    // Calculate cluster info with velocity
    return clusters.map((cluster, i) => {
      if (cluster.length === 0) {
        return {
          centerX: centers[i].x,
          centerY: centers[i].y,
          velocityX: 0,
          velocityY: 0,
          weight: 0
        }
      }
      
      // Calculate velocity from recent events
      const recentEvents = cluster.slice(-Math.min(5, cluster.length))
      let velocityX = 0
      let velocityY = 0
      
      if (recentEvents.length > 1) {
        const timeDiff = recentEvents[recentEvents.length - 1].timestamp - recentEvents[0].timestamp
        if (timeDiff > 0) {
          velocityX = (recentEvents[recentEvents.length - 1].x - recentEvents[0].x) / timeDiff
          velocityY = (recentEvents[recentEvents.length - 1].y - recentEvents[0].y) / timeDiff
        }
      }
      
      return {
        centerX: centers[i].x,
        centerY: centers[i].y,
        velocityX: velocityX / videoWidth,
        velocityY: velocityY / videoHeight,
        weight: cluster.length / events.length
      }
    }).filter(c => c.weight > 0)
  }

  private findActiveCluster(
    clusters: MouseClusterInfo[],
    currentTimeMs: number
  ): MouseClusterInfo | null {
    if (clusters.length === 0) return null
    
    // Score clusters based on weight and velocity
    let bestCluster = clusters[0]
    let bestScore = 0
    
    for (const cluster of clusters) {
      // Score based on cluster size (weight) and movement (velocity)
      const velocityMagnitude = Math.sqrt(
        cluster.velocityX * cluster.velocityX + 
        cluster.velocityY * cluster.velocityY
      )
      
      const score = cluster.weight * (1 + velocityMagnitude * this.VELOCITY_WEIGHT)
      
      if (score > bestScore) {
        bestScore = score
        bestCluster = cluster
      }
    }
    
    return bestCluster
  }
}

export const zoomPanCalculator = new ZoomPanCalculator()
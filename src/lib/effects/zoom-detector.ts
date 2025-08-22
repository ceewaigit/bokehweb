/**
 * Zoom Detection for Remotion
 * Analyzes mouse events to generate intelligent zoom blocks
 * Uses k-means clustering to follow mouse movement patterns like Screen Studio
 */

import type { MouseEvent, ZoomBlock } from '@/types/project'

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
  density: number
  stability: number
}

export class ZoomDetector {
  private readonly MIN_CLUSTER_TIME = 600 // Minimum time in cluster to trigger zoom (ms)
  private readonly MAX_CLUSTER_SIZE = 0.35 // Maximum cluster size as fraction of screen
  private readonly MIN_CLUSTER_EVENTS = 4 // Minimum events to form a cluster
  private readonly CLUSTER_TIME_WINDOW = 1500 // Time window to analyze for clusters (ms)
  private readonly CLUSTER_MERGE_DISTANCE = 0.2 // Distance to merge nearby clusters
  private readonly MIN_ZOOM_DURATION = 800 // Minimum zoom time
  private readonly MAX_ZOOM_DURATION = 10000 // Maximum zoom time
  private readonly MOVEMENT_THRESHOLD = 0.15 // Threshold for significant movement
  private readonly VELOCITY_WEIGHT = 0.3 // Weight for velocity in clustering

  detectZoomBlocks(
    mouseEvents: MouseEvent[],
    videoWidth: number,
    videoHeight: number,
    duration: number
  ): ZoomBlock[] {
    if (!mouseEvents || mouseEvents.length < this.MIN_CLUSTER_EVENTS) {
      return []
    }

    // Detect mouse clusters
    const clusters = this.detectMouseClusters(mouseEvents, videoWidth, videoHeight)

    if (clusters.length === 0) return []

    const zoomBlocks: ZoomBlock[] = []

    // Convert stable clusters to zoom blocks
    clusters.forEach(cluster => {
      const clusterDuration = cluster.endTime - cluster.startTime
      const normalizedWidth = cluster.boundingBox.width / videoWidth
      const normalizedHeight = cluster.boundingBox.height / videoHeight
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

      // Center the zoom on the cluster using screen dimensions from events
      // Get screen dimensions from the cluster's events
      const clusterEvent = cluster.events[Math.floor(cluster.events.length / 2)]
      const screenWidth = clusterEvent.screenWidth || videoWidth
      const screenHeight = clusterEvent.screenHeight || videoHeight
      
      const targetX = cluster.center.x / screenWidth
      const targetY = cluster.center.y / screenHeight
      
      console.log('[ZoomDetector] Creating zoom block:', {
        clusterCenter: cluster.center,
        screenDimensions: { screenWidth, screenHeight },
        videoDimensions: { videoWidth, videoHeight },
        normalizedTarget: { targetX, targetY },
        clusterBounds: cluster.boundingBox,
        zoomScale
      })

      // Ensure zoom doesn't exceed video duration
      const effectiveDuration = Math.min(
        clusterDuration + 1000, // Add buffer for outro
        this.MAX_ZOOM_DURATION,
        duration - cluster.startTime - 500
      )

      if (effectiveDuration > this.MIN_ZOOM_DURATION) {
        zoomBlocks.push({
          id: `zoom-cluster-${cluster.startTime}`,
          startTime: cluster.startTime,
          endTime: cluster.startTime + effectiveDuration,
          introMs: 400,
          outroMs: 500,
          scale: zoomScale,
          targetX,
          targetY,
          mode: 'auto'
        })
      }
    })

    // Merge overlapping zoom blocks
    return this.mergeOverlappingZooms(zoomBlocks)
  }

  private detectMouseClusters(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): MouseCluster[] {
    const clusters: MouseCluster[] = []
    let i = 0

    while (i < events.length) {
      const windowStart = events[i].timestamp
      const windowEnd = windowStart + this.CLUSTER_TIME_WINDOW
      const windowEvents: MouseEvent[] = []

      let j = i
      while (j < events.length && events[j].timestamp <= windowEnd) {
        windowEvents.push(events[j])
        j++
      }

      if (windowEvents.length >= this.MIN_CLUSTER_EVENTS) {
        // Use k-means to find activity centers
        const activityCenters = this.kMeansClustering(windowEvents, videoWidth, videoHeight)
        
        for (const center of activityCenters) {
          if (center.density > 0.25 && center.stability > 0.3) {
            // Check if this is a continuation of movement or a new cluster
            const shouldMerge = clusters.length > 0 && 
              this.shouldMergeWithPrevious(clusters[clusters.length - 1], center, videoWidth, videoHeight)
            
            if (shouldMerge) {
              this.mergeClusters(clusters[clusters.length - 1], center, videoWidth, videoHeight)
            } else {
              clusters.push(center)
            }
          }
        }
        
        // Skip ahead based on cluster detection
        if (activityCenters.length > 0) {
          i = j - Math.floor(this.MIN_CLUSTER_EVENTS / 2)
        }
      }

      i++
    }

    return clusters
  }

  private kMeansClustering(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number,
    k: number = 2
  ): MouseCluster[] {
    if (events.length < k) {
      return [this.analyzeCluster(events, videoWidth, videoHeight)]
    }

    // Initialize centers using k-means++
    const centers: { x: number; y: number }[] = []
    centers.push({
      x: events[Math.floor(Math.random() * events.length)].x,
      y: events[Math.floor(Math.random() * events.length)].y
    })

    // K-means++ initialization for better center selection
    for (let c = 1; c < k; c++) {
      const distances = events.map(e => {
        let minDist = Infinity
        centers.forEach(center => {
          const dist = Math.sqrt(
            Math.pow(e.x - center.x, 2) + Math.pow(e.y - center.y, 2)
          )
          minDist = Math.min(minDist, dist)
        })
        return minDist
      })

      const sumDist = distances.reduce((a, b) => a + b, 0)
      let target = Math.random() * sumDist
      let idx = 0
      
      for (let i = 0; i < distances.length; i++) {
        target -= distances[i]
        if (target <= 0) {
          idx = i
          break
        }
      }
      
      centers.push({ x: events[idx].x, y: events[idx].y })
    }

    // K-means iterations
    let clusters: MouseEvent[][] = []
    const maxIterations = 15
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign events to clusters
      clusters = Array(k).fill(null).map(() => [])
      
      events.forEach(event => {
        let minDist = Infinity
        let assignedCluster = 0
        
        centers.forEach((center, idx) => {
          const dist = Math.sqrt(
            Math.pow(event.x - center.x, 2) + 
            Math.pow(event.y - center.y, 2)
          )
          if (dist < minDist) {
            minDist = dist
            assignedCluster = idx
          }
        })
        
        clusters[assignedCluster].push(event)
      })
      
      // Update centers
      let converged = true
      clusters.forEach((cluster, idx) => {
        if (cluster.length > 0) {
          const newX = cluster.reduce((sum, e) => sum + e.x, 0) / cluster.length
          const newY = cluster.reduce((sum, e) => sum + e.y, 0) / cluster.length
          
          if (Math.abs(newX - centers[idx].x) > 1 || Math.abs(newY - centers[idx].y) > 1) {
            converged = false
          }
          
          centers[idx] = { x: newX, y: newY }
        }
      })
      
      if (converged) break
    }

    // Convert clusters to MouseCluster objects
    return clusters
      .filter(cluster => cluster.length >= this.MIN_CLUSTER_EVENTS)
      .map(cluster => this.analyzeCluster(cluster, videoWidth, videoHeight))
  }

  private analyzeCluster(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): MouseCluster {
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let sumX = 0, sumY = 0

    // Calculate velocity for movement tracking
    let velocityX = 0, velocityY = 0
    if (events.length > 1) {
      const timeDiff = events[events.length - 1].timestamp - events[0].timestamp
      if (timeDiff > 0) {
        velocityX = (events[events.length - 1].x - events[0].x) / timeDiff
        velocityY = (events[events.length - 1].y - events[0].y) / timeDiff
      }
    }

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

    // Weight recent events more heavily for center calculation
    let weightedSumX = 0, weightedSumY = 0, totalWeight = 0
    events.forEach((event, idx) => {
      const weight = 1 + (idx / events.length) * this.VELOCITY_WEIGHT
      weightedSumX += event.x * weight
      weightedSumY += event.y * weight
      totalWeight += weight
    })

    const center = {
      x: weightedSumX / totalWeight,
      y: weightedSumY / totalWeight
    }

    const area = boundingBox.width * boundingBox.height
    const maxArea = videoWidth * videoHeight
    const density = area > 0 ? 1 - (area / maxArea) : 1

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

  private shouldMergeWithPrevious(
    previousCluster: MouseCluster,
    currentCluster: MouseCluster,
    videoWidth: number,
    videoHeight: number
  ): boolean {
    // Calculate spatial distance
    const dx = (currentCluster.center.x - previousCluster.center.x) / videoWidth
    const dy = (currentCluster.center.y - previousCluster.center.y) / videoHeight
    const spatialDistance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate temporal distance
    const timeDiff = currentCluster.startTime - previousCluster.endTime
    
    // Check if this is a continuation of movement
    const isContinuation = timeDiff < 500 && spatialDistance < this.CLUSTER_MERGE_DISTANCE
    
    // Check if movement is following a path
    const isFollowingPath = timeDiff < 1000 && spatialDistance < this.MOVEMENT_THRESHOLD * 2
    
    return isContinuation || isFollowingPath
  }

  private calculateClusterDistance(
    cluster1: MouseCluster,
    cluster2: MouseCluster,
    videoWidth: number,
    videoHeight: number
  ): number {
    const dx = (cluster1.center.x - cluster2.center.x) / videoWidth
    const dy = (cluster1.center.y - cluster2.center.y) / videoHeight
    return Math.sqrt(dx * dx + dy * dy)
  }

  private mergeClusters(
    target: MouseCluster,
    source: MouseCluster,
    videoWidth: number,
    videoHeight: number
  ): void {
    target.events.push(...source.events)
    target.events.sort((a, b) => a.timestamp - b.timestamp)

    target.startTime = Math.min(target.startTime, source.startTime)
    target.endTime = Math.max(target.endTime, source.endTime)

    const merged = this.analyzeCluster(target.events, videoWidth, videoHeight)
    target.boundingBox = merged.boundingBox
    target.center = merged.center
    target.density = merged.density
    target.stability = merged.stability
  }

  private mergeOverlappingZooms(effects: ZoomBlock[]): ZoomBlock[] {
    if (effects.length < 2) return effects

    effects.sort((a, b) => a.startTime - b.startTime)

    const merged: ZoomBlock[] = []
    let current = effects[0]

    for (let i = 1; i < effects.length; i++) {
      const next = effects[i]

      if (current.endTime >= next.startTime - 500) {
        current.endTime = Math.max(current.endTime, next.endTime)
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
    return merged
  }
}
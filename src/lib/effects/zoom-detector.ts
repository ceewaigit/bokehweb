/**
 * Zoom Detection for Remotion
 * Analyzes mouse events to generate intelligent zoom blocks
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
  private readonly MIN_CLUSTER_TIME = 800 // Minimum time in cluster to trigger zoom (ms)
  private readonly MAX_CLUSTER_SIZE = 0.4 // Maximum cluster size as fraction of screen
  private readonly MIN_CLUSTER_EVENTS = 5 // Minimum events to form a cluster
  private readonly CLUSTER_TIME_WINDOW = 2000 // Time window to analyze for clusters (ms)
  private readonly CLUSTER_MERGE_DISTANCE = 0.15 // Distance to merge nearby clusters
  private readonly MIN_ZOOM_DURATION = 1000 // Minimum zoom time
  private readonly MAX_ZOOM_DURATION = 8000 // Maximum zoom time

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
      
      // Center the zoom on the cluster
      const targetX = cluster.center.x / videoWidth
      const targetY = cluster.center.y / videoHeight
      
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
        const cluster = this.analyzeCluster(windowEvents, videoWidth, videoHeight)
        
        if (cluster.density > 0.3 && cluster.stability > 0.35) {
          if (clusters.length > 0) {
            const lastCluster = clusters[clusters.length - 1]
            const distance = this.calculateClusterDistance(lastCluster, cluster, videoWidth, videoHeight)
            
            if (distance < this.CLUSTER_MERGE_DISTANCE) {
              this.mergeClusters(lastCluster, cluster, videoWidth, videoHeight)
            } else {
              clusters.push(cluster)
            }
          } else {
            clusters.push(cluster)
          }
          
          i = j - 1
        }
      }
      
      i++
    }
    
    return clusters
  }
  
  private analyzeCluster(
    events: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): MouseCluster {
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
    
    const center = {
      x: sumX / events.length,
      y: sumY / events.length
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
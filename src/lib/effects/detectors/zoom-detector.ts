/**
 * Zoom Effect Detector
 * Detects when to apply cinematic zoom effects based on user interactions
 */

import type { EffectDetector, ProjectEvent, RecordingContext, ZoomEffect } from '../types'

interface ZoomTrigger {
  timestamp: number
  score: number
  reason: 'click' | 'dwell' | 'interaction' | 'focus' | 'precision'
  x: number
  y: number
  confidence: number
}

interface InteractionCluster {
  startTime: number
  endTime: number
  centerX: number
  centerY: number
  events: ProjectEvent[]
  clickCount: number
}

export class ZoomEffectDetector implements EffectDetector {
  name = 'zoom'
  
  // Configuration
  private readonly config = {
    // Detection thresholds
    DWELL_TIME_THRESHOLD: 1000,        // ms to consider as dwelling
    DWELL_RADIUS: 50,                  // pixels for dwell detection
    CLICK_PRE_ZOOM: 200,               // ms to zoom before click
    CLICK_POST_ZOOM: 500,              // ms to hold zoom after click
    VELOCITY_THRESHOLD: 100,           // pixels/second for slow movement
    ZOOM_SCORE_THRESHOLD: 70,          // score needed to trigger zoom
    INTERACTION_CLUSTER_TIME: 3000,    // ms to group interactions
    INTERACTION_CLUSTER_RADIUS: 200,   // pixels for interaction area
    
    // Effect parameters
    ZOOM_SCALE: 2.0,
    INTRO_DURATION: 200,
    OUTRO_DURATION: 300,
    MIN_ZOOM_DURATION: 500,
    MERGE_GAP: 1500
  }
  
  constructor(config?: Partial<typeof ZoomEffectDetector.prototype.config>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }
  
  detectEffects(events: ProjectEvent[], context: RecordingContext): ZoomEffect[] {
    console.log(`[ZoomDetector] Processing ${events.length} events`)
    
    // If no events, create some demo zoom effects for testing
    if (events.length === 0 && context.duration > 0) {
      console.log('[ZoomDetector] No events found, creating demo zoom effects')
      return this.createDemoZoomEffects(context)
    }
    
    // Count event types
    const moveEvents = events.filter(e => e.type === 'move').length
    const clickEvents = events.filter(e => e.type === 'click').length
    console.log(`[ZoomDetector] Events: ${moveEvents} moves, ${clickEvents} clicks`)
    
    // Detect different trigger types
    const clickTriggers = this.detectClickBasedZooms(events, context)
    const dwellTriggers = this.detectDwellZooms(events, context)
    const interactionTriggers = this.detectInteractionClusters(events, context)
    
    console.log(`[ZoomDetector] Triggers found: ${clickTriggers.length} clicks, ${dwellTriggers.length} dwells, ${interactionTriggers.length} interactions`)
    
    // Combine and score all triggers
    const allTriggers = [...clickTriggers, ...dwellTriggers, ...interactionTriggers]
      .sort((a, b) => a.timestamp - b.timestamp)
    
    // Convert high-scoring triggers to zoom effects
    const zoomEffects = this.triggersToZoomEffects(allTriggers, context)
    
    console.log(`[ZoomDetector] Created ${zoomEffects.length} zoom effects`)
    
    // Merge overlapping or nearby effects
    const merged = this.mergeNearbyEffects(zoomEffects)
    console.log(`[ZoomDetector] After merging: ${merged.length} zoom effects`)
    
    return merged
  }
  
  /**
   * Create demo zoom effects when no metadata is available
   */
  private createDemoZoomEffects(context: RecordingContext): ZoomEffect[] {
    const effects: ZoomEffect[] = []
    const duration = context.duration
    
    // Create 2-3 zoom effects throughout the video
    if (duration > 3000) {
      // First zoom at 2 seconds
      effects.push({
        id: 'zoom-demo-1',
        type: 'zoom',
        startTime: 2000,
        endTime: Math.min(5000, duration - 1000),
        params: {
          targetX: 0.7,
          targetY: 0.3,
          scale: 2.0,
          introMs: 300,
          outroMs: 300
        }
      })
    }
    
    if (duration > 8000) {
      // Second zoom at 7 seconds
      effects.push({
        id: 'zoom-demo-2',
        type: 'zoom',
        startTime: 7000,
        endTime: Math.min(10000, duration - 1000),
        params: {
          targetX: 0.3,
          targetY: 0.6,
          scale: 2.2,
          introMs: 250,
          outroMs: 350
        }
      })
    }
    
    if (duration > 13000) {
      // Third zoom at 12 seconds
      effects.push({
        id: 'zoom-demo-3',
        type: 'zoom',
        startTime: 12000,
        endTime: Math.min(14500, duration - 500),
        params: {
          targetX: 0.5,
          targetY: 0.5,
          scale: 1.8,
          introMs: 200,
          outroMs: 300
        }
      })
    }
    
    console.log(`[ZoomDetector] Created ${effects.length} demo zoom effects`)
    return effects
  }
  
  /**
   * Detect zooms based on click events
   */
  private detectClickBasedZooms(events: ProjectEvent[], context: RecordingContext): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    const clickEvents = events.filter(e => e.type === 'click')
    
    for (const click of clickEvents) {
      // Find mouse position just before click for pre-zoom
      const preClickTime = Math.max(0, click.timestamp - this.config.CLICK_PRE_ZOOM)
      const mouseBeforeClick = this.findNearestMousePosition(events, preClickTime)
      
      triggers.push({
        timestamp: preClickTime,
        score: 85, // Clicks are high priority
        reason: 'click',
        x: mouseBeforeClick?.x || click.x,
        y: mouseBeforeClick?.y || click.y,
        confidence: 0.9
      })
    }
    
    return triggers
  }
  
  /**
   * Detect zooms based on dwelling (hovering in one area)
   */
  private detectDwellZooms(events: ProjectEvent[], context: RecordingContext): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    let dwellStart: number | null = null
    let dwellCenter = { x: 0, y: 0 }
    let dwellEvents: ProjectEvent[] = []
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (event.type !== 'move') continue
      
      if (dwellStart === null) {
        // Start new dwell
        dwellStart = event.timestamp
        dwellCenter = { x: event.x, y: event.y }
        dwellEvents = [event]
      } else {
        // Check if still dwelling
        const distance = Math.sqrt(
          Math.pow(event.x - dwellCenter.x, 2) +
          Math.pow(event.y - dwellCenter.y, 2)
        )
        
        if (distance < this.config.DWELL_RADIUS) {
          // Still dwelling, add to cluster
          dwellEvents.push(event)
          
          // Check if dwell time exceeded threshold
          const dwellTime = event.timestamp - dwellStart
          if (dwellTime >= this.config.DWELL_TIME_THRESHOLD && dwellEvents.length > 10) {
            // Calculate center of dwell area
            const avgX = dwellEvents.reduce((sum, e) => sum + e.x, 0) / dwellEvents.length
            const avgY = dwellEvents.reduce((sum, e) => sum + e.y, 0) / dwellEvents.length
            
            triggers.push({
              timestamp: dwellStart,
              score: 70, // Dwelling is medium priority
              reason: 'dwell',
              x: avgX,
              y: avgY,
              confidence: 0.7
            })
            
            // Reset for next dwell
            dwellStart = null
            dwellEvents = []
          }
        } else {
          // Movement broke dwell, reset
          dwellStart = event.timestamp
          dwellCenter = { x: event.x, y: event.y }
          dwellEvents = [event]
        }
      }
    }
    
    return triggers
  }
  
  /**
   * Detect interaction clusters (multiple clicks/actions in same area)
   */
  private detectInteractionClusters(events: ProjectEvent[], context: RecordingContext): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    const clusters: InteractionCluster[] = []
    
    // Build clusters of nearby interactions
    for (const event of events) {
      if (event.type !== 'click') continue
      
      // Find existing cluster or create new one
      let foundCluster = false
      for (const cluster of clusters) {
        const distance = Math.sqrt(
          Math.pow(event.x - cluster.centerX, 2) +
          Math.pow(event.y - cluster.centerY, 2)
        )
        
        const timeDiff = event.timestamp - cluster.endTime
        
        if (distance < this.config.INTERACTION_CLUSTER_RADIUS && 
            timeDiff < this.config.INTERACTION_CLUSTER_TIME) {
          // Add to existing cluster
          cluster.events.push(event)
          cluster.endTime = event.timestamp
          cluster.clickCount++
          
          // Recalculate center
          cluster.centerX = cluster.events.reduce((sum, e) => sum + e.x, 0) / cluster.events.length
          cluster.centerY = cluster.events.reduce((sum, e) => sum + e.y, 0) / cluster.events.length
          
          foundCluster = true
          break
        }
      }
      
      if (!foundCluster) {
        // Create new cluster
        clusters.push({
          startTime: event.timestamp,
          endTime: event.timestamp,
          centerX: event.x,
          centerY: event.y,
          events: [event],
          clickCount: 1
        })
      }
    }
    
    // Convert significant clusters to triggers
    for (const cluster of clusters) {
      if (cluster.clickCount >= 2) {
        triggers.push({
          timestamp: cluster.startTime - this.config.CLICK_PRE_ZOOM,
          score: 60 + (cluster.clickCount * 10), // More clicks = higher score
          reason: 'interaction',
          x: cluster.centerX,
          y: cluster.centerY,
          confidence: Math.min(0.95, 0.6 + cluster.clickCount * 0.1)
        })
      }
    }
    
    return triggers
  }
  
  /**
   * Find nearest mouse position to a timestamp
   */
  private findNearestMousePosition(events: ProjectEvent[], timestamp: number): ProjectEvent | null {
    let closest: ProjectEvent | null = null
    let minDiff = Infinity
    
    for (const event of events) {
      if (event.type !== 'move') continue
      const diff = Math.abs(event.timestamp - timestamp)
      if (diff < minDiff) {
        minDiff = diff
        closest = event
      }
    }
    
    return closest
  }
  
  /**
   * Convert triggers to zoom effects
   */
  private triggersToZoomEffects(triggers: ZoomTrigger[], context: RecordingContext): ZoomEffect[] {
    const effects: ZoomEffect[] = []
    
    for (const trigger of triggers) {
      if (trigger.score < this.config.ZOOM_SCORE_THRESHOLD) continue
      
      // Calculate zoom duration based on trigger type
      let duration = this.config.MIN_ZOOM_DURATION
      if (trigger.reason === 'click') {
        duration = this.config.CLICK_PRE_ZOOM + this.config.CLICK_POST_ZOOM + 200
      } else if (trigger.reason === 'dwell') {
        duration = 1500
      } else if (trigger.reason === 'interaction') {
        duration = 2000
      }
      
      const startTime = Math.max(0, trigger.timestamp)
      const endTime = Math.min(startTime + duration, context.duration)
      
      if (endTime - startTime >= this.config.MIN_ZOOM_DURATION) {
        effects.push({
          id: `zoom-${trigger.reason}-${startTime}`,
          type: 'zoom',
          startTime,
          endTime,
          params: {
            targetX: trigger.x / context.width,
            targetY: trigger.y / context.height,
            scale: this.config.ZOOM_SCALE,
            introMs: this.config.INTRO_DURATION,
            outroMs: this.config.OUTRO_DURATION
          }
        })
      }
    }
    
    return effects
  }
  
  /**
   * Merge effects that are close together
   */
  private mergeNearbyEffects(effects: ZoomEffect[]): ZoomEffect[] {
    const merged: ZoomEffect[] = []
    let lastEffect: ZoomEffect | null = null
    
    for (const effect of effects) {
      if (lastEffect && effect.startTime - lastEffect.endTime < this.config.MERGE_GAP) {
        // Extend the last effect instead of creating a new one
        lastEffect.endTime = effect.endTime
      } else {
        if (lastEffect) merged.push(lastEffect)
        lastEffect = { ...effect }
      }
    }
    
    if (lastEffect) merged.push(lastEffect)
    return merged
  }
}
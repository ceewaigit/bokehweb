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
    // Detection thresholds - RELAXED for better detection
    DWELL_TIME_THRESHOLD: 500,         // ms to consider as dwelling (was 1000)
    DWELL_RADIUS: 100,                 // pixels for dwell detection (was 50)
    CLICK_PRE_ZOOM: 200,               // ms to zoom before click
    CLICK_POST_ZOOM: 500,              // ms to hold zoom after click
    VELOCITY_THRESHOLD: 500,           // pixels/second for fast movement (was 100)
    ZOOM_SCORE_THRESHOLD: 50,          // score needed to trigger zoom (was 70)
    INTERACTION_CLUSTER_TIME: 3000,    // ms to group interactions
    INTERACTION_CLUSTER_RADIUS: 200,   // pixels for interaction area
    ACTIVITY_WINDOW: 1000,             // ms window for activity detection
    ACTIVITY_THRESHOLD: 10,            // events needed for activity burst
    
    // Effect parameters
    ZOOM_SCALE: 2.0,
    INTRO_DURATION: 200,
    OUTRO_DURATION: 300,
    MIN_ZOOM_DURATION: 300,            // Shorter minimum (was 500)
    MAX_ZOOM_DURATION: 3000,           // Maximum duration for any zoom effect
    MERGE_GAP: 300                     // Reduced to prevent over-merging
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
    const velocityClicks = this.detectVelocityBasedClicks(events, context)
    const dwellTriggers = this.detectDwellZooms(events, context)
    const interactionTriggers = this.detectInteractionClusters(events, context)
    const activityTriggers = this.detectActivityBursts(events, context)
    
    console.log(`[ZoomDetector] Triggers found: ${clickTriggers.length} clicks, ${velocityClicks.length} velocity clicks, ${dwellTriggers.length} dwells, ${interactionTriggers.length} interactions, ${activityTriggers.length} activity bursts`)
    
    // Combine and score all triggers
    const allTriggers = [...clickTriggers, ...velocityClicks, ...dwellTriggers, ...interactionTriggers, ...activityTriggers]
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
  private detectClickBasedZooms(events: ProjectEvent[], context: RecordingContext | undefined = undefined): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    const clickEvents = events.filter(e => e.type === 'click')
    
    console.log(`[ZoomDetector] Processing ${clickEvents.length} click events`)
    
    for (const click of clickEvents) {
      console.log(`[ZoomDetector] Click at ${click.timestamp}ms, position (${click.x}, ${click.y})`)
      
      // Find mouse position just before click for pre-zoom
      const preClickTime = Math.max(0, click.timestamp - this.config.CLICK_PRE_ZOOM)
      const mouseBeforeClick = this.findNearestMousePosition(events, preClickTime)
      
      const trigger = {
        timestamp: preClickTime,
        score: 95, // Clicks are highest priority
        reason: 'click' as const,
        x: mouseBeforeClick?.x || click.x,
        y: mouseBeforeClick?.y || click.y,
        confidence: 0.95
      }
      
      console.log(`[ZoomDetector] Created click trigger: timestamp=${trigger.timestamp}, x=${trigger.x}, y=${trigger.y}`)
      triggers.push(trigger)
    }
    
    return triggers
  }
  
  /**
   * Detect clicks by analyzing velocity patterns
   * A click is likely when: fast movement → sudden stop → small movement
   */
  private detectVelocityBasedClicks(events: ProjectEvent[], context: RecordingContext | undefined = undefined): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    const moveEvents = events.filter(e => e.type === 'move')
    
    for (let i = 2; i < moveEvents.length - 1; i++) {
      const prev = moveEvents[i - 1]
      const curr = moveEvents[i]
      const next = moveEvents[i + 1]
      
      // Calculate velocities
      const prevDt = curr.timestamp - prev.timestamp
      const nextDt = next.timestamp - curr.timestamp
      
      if (prevDt <= 0 || nextDt <= 0) continue
      
      const prevVelocity = Math.sqrt(
        Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
      ) / (prevDt / 1000)
      
      const currVelocity = Math.sqrt(
        Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2)
      ) / (nextDt / 1000)
      
      // Detect sudden velocity drop (likely a click)
      if (prevVelocity > this.config.VELOCITY_THRESHOLD && currVelocity < 50) {
        console.log(`[ZoomDetector] Velocity click detected at ${curr.timestamp}ms: ${prevVelocity.toFixed(0)}px/s -> ${currVelocity.toFixed(0)}px/s`)
        
        triggers.push({
          timestamp: Math.max(0, curr.timestamp - this.config.CLICK_PRE_ZOOM),
          score: 75, // High confidence for velocity-based clicks
          reason: 'click',
          x: curr.x,
          y: curr.y,
          confidence: 0.8
        })
      }
    }
    
    return triggers
  }
  
  /**
   * Detect zooms based on dwelling (hovering in one area)
   */
  private detectDwellZooms(events: ProjectEvent[], context: RecordingContext | undefined = undefined): ZoomTrigger[] {
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
            
            // Only create trigger for significant dwells
            const dwellDuration = event.timestamp - dwellStart
            if (dwellDuration >= this.config.DWELL_TIME_THRESHOLD) {
              triggers.push({
                timestamp: dwellStart,
                score: 80, // Long dwells are high priority
                reason: 'dwell',
                x: avgX,
                y: avgY,
                confidence: 0.8
              })
            }
            
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
  private detectInteractionClusters(events: ProjectEvent[], context: RecordingContext | undefined = undefined): ZoomTrigger[] {
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
   * Detect activity bursts - periods of high mouse activity
   */
  private detectActivityBursts(events: ProjectEvent[], context: RecordingContext | undefined = undefined): ZoomTrigger[] {
    const triggers: ZoomTrigger[] = []
    const moveEvents = events.filter(e => e.type === 'move')
    
    // Analyze activity in sliding windows
    const windowSize = this.config.ACTIVITY_WINDOW
    
    for (let i = 0; i < moveEvents.length; i++) {
      const windowStart = moveEvents[i].timestamp
      const windowEnd = windowStart + windowSize
      
      // Count events in this window
      const windowEvents = moveEvents.filter(e => 
        e.timestamp >= windowStart && e.timestamp < windowEnd
      )
      
      if (windowEvents.length >= this.config.ACTIVITY_THRESHOLD) {
        // Calculate center of activity
        const avgX = windowEvents.reduce((sum, e) => sum + e.x, 0) / windowEvents.length
        const avgY = windowEvents.reduce((sum, e) => sum + e.y, 0) / windowEvents.length
        
        // Calculate total movement distance
        let totalDistance = 0
        for (let j = 1; j < windowEvents.length; j++) {
          totalDistance += Math.sqrt(
            Math.pow(windowEvents[j].x - windowEvents[j-1].x, 2) +
            Math.pow(windowEvents[j].y - windowEvents[j-1].y, 2)
          )
        }
        
        // High activity = lots of events + significant movement
        if (totalDistance > 200) {
          console.log(`[ZoomDetector] Activity burst at ${windowStart}ms: ${windowEvents.length} events, ${totalDistance.toFixed(0)}px movement`)
          
          triggers.push({
            timestamp: windowStart,
            score: 60 + Math.min(20, windowEvents.length - this.config.ACTIVITY_THRESHOLD),
            reason: 'focus',
            x: avgX,
            y: avgY,
            confidence: 0.7
          })
          
          // Skip ahead to avoid overlapping detections
          i += Math.floor(windowEvents.length / 2)
        }
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
    const processedTimestamps = new Set<number>()
    
    // Sort triggers by score (highest first) to prioritize better triggers
    const sortedTriggers = [...triggers].sort((a, b) => {
      // First sort by timestamp
      const timeDiff = a.timestamp - b.timestamp
      if (Math.abs(timeDiff) < 100) {
        // If timestamps are very close, prioritize by type
        const typePriority: Record<string, number> = {
          'click': 4,
          'interaction': 3,
          'dwell': 2,
          'focus': 1,
          'precision': 0
        }
        const priorityDiff = (typePriority[b.reason] || 0) - (typePriority[a.reason] || 0)
        if (priorityDiff !== 0) return priorityDiff
        // Then by score
        return b.score - a.score
      }
      return timeDiff
    })
    
    let lastEffectEnd = 0
    
    for (const trigger of sortedTriggers) {
      console.log(`[ZoomDetector] Evaluating trigger: score=${trigger.score}, threshold=${this.config.ZOOM_SCORE_THRESHOLD}, reason=${trigger.reason}`)
      
      if (trigger.score < this.config.ZOOM_SCORE_THRESHOLD) {
        console.log(`[ZoomDetector] Trigger rejected - score too low`)
        continue
      }
      
      // Skip if we already have a trigger at this timestamp (within 200ms)
      const roundedTimestamp = Math.round(trigger.timestamp / 200) * 200
      if (processedTimestamps.has(roundedTimestamp)) {
        console.log(`[ZoomDetector] Skipping duplicate trigger at ${trigger.timestamp}ms`)
        continue
      }
      
      // Ensure minimum gap between zoom effects (at least 500ms)
      if (trigger.timestamp < lastEffectEnd + 500) {
        console.log(`[ZoomDetector] Skipping trigger at ${trigger.timestamp}ms - too close to previous effect ending at ${lastEffectEnd}ms`)
        continue
      }
      
      // Calculate zoom duration based on trigger type
      let duration = this.config.MIN_ZOOM_DURATION
      if (trigger.reason === 'click') {
        duration = this.config.CLICK_PRE_ZOOM + this.config.CLICK_POST_ZOOM + 200
      } else if (trigger.reason === 'dwell') {
        duration = Math.min(1200, this.config.MAX_ZOOM_DURATION)
      } else if (trigger.reason === 'interaction') {
        duration = Math.min(1500, this.config.MAX_ZOOM_DURATION)
      } else if (trigger.reason === 'focus' || trigger.reason === 'precision') {
        duration = Math.min(800, this.config.MAX_ZOOM_DURATION)
      }
      
      // Enforce maximum duration
      duration = Math.min(duration, this.config.MAX_ZOOM_DURATION)
      
      const startTime = Math.max(0, trigger.timestamp)
      const endTime = Math.min(startTime + duration, context.duration)
      
      // Allow shorter zooms near the end of the video
      const remainingTime = context.duration - startTime
      const minDuration = remainingTime < 500 ? Math.min(200, remainingTime) : this.config.MIN_ZOOM_DURATION
      
      console.log(`[ZoomDetector] Zoom timing: start=${startTime}, end=${endTime}, duration=${endTime - startTime}, minDuration=${minDuration}`)
      
      if (endTime - startTime >= minDuration) {
        // Account for padding when calculating zoom targets
        let normalizedX = trigger.x / context.width
        let normalizedY = trigger.y / context.height
        
        // If there's padding, we need to transform coordinates
        if (context.padding && context.padding > 0) {
          const padding = context.padding
          
          // Calculate actual video bounds
          const videoWidth = context.width - padding * 2
          const videoHeight = context.height - padding * 2
          const videoX = padding
          const videoY = padding
          
          // Transform coordinates to be relative to the actual video area
          // First, check if the trigger is within the video bounds
          if (trigger.x >= videoX && trigger.x <= videoX + videoWidth &&
              trigger.y >= videoY && trigger.y <= videoY + videoHeight) {
            // Calculate position relative to video
            normalizedX = (trigger.x - videoX) / videoWidth
            normalizedY = (trigger.y - videoY) / videoHeight
          }
          // If outside video bounds, clamp to edges
          else {
            normalizedX = Math.max(0, Math.min(1, (trigger.x - videoX) / videoWidth))
            normalizedY = Math.max(0, Math.min(1, (trigger.y - videoY) / videoHeight))
          }
        }
        
        effects.push({
          id: `zoom-${trigger.reason}-${startTime}`,
          type: 'zoom',
          startTime,
          endTime,
          params: {
            targetX: normalizedX,
            targetY: normalizedY,
            scale: this.config.ZOOM_SCALE,
            introMs: this.config.INTRO_DURATION,
            outroMs: this.config.OUTRO_DURATION
          }
        })
        processedTimestamps.add(roundedTimestamp)
        lastEffectEnd = endTime
        console.log(`[ZoomDetector] Created zoom effect: ${trigger.reason} at ${startTime}ms, ending at ${endTime}ms`)
      } else {
        console.log(`[ZoomDetector] Zoom duration too short, skipped`)
      }
    }
    
    return effects
  }
  
  /**
   * Merge effects that are close together
   */
  private mergeNearbyEffects(effects: ZoomEffect[]): ZoomEffect[] {
    if (effects.length === 0) return []
    
    const merged: ZoomEffect[] = []
    let currentGroup: ZoomEffect[] = [effects[0]]
    
    for (let i = 1; i < effects.length; i++) {
      const effect = effects[i]
      const lastInGroup = currentGroup[currentGroup.length - 1]
      
      // Check if this effect should be merged with the current group
      if (effect.startTime - lastInGroup.endTime < this.config.MERGE_GAP) {
        // Don't merge if it would create an effect longer than MAX_ZOOM_DURATION
        const groupStart = currentGroup[0].startTime
        const potentialDuration = effect.endTime - groupStart
        
        if (potentialDuration <= this.config.MAX_ZOOM_DURATION) {
          currentGroup.push(effect)
        } else {
          // Start a new group
          merged.push(this.mergeGroup(currentGroup))
          currentGroup = [effect]
        }
      } else {
        // Gap is too large, finalize current group and start new one
        merged.push(this.mergeGroup(currentGroup))
        currentGroup = [effect]
      }
    }
    
    // Don't forget the last group
    if (currentGroup.length > 0) {
      merged.push(this.mergeGroup(currentGroup))
    }
    
    return merged
  }
  
  /**
   * Merge a group of effects into a single effect
   */
  private mergeGroup(group: ZoomEffect[]): ZoomEffect {
    if (group.length === 1) return group[0]
    
    // Calculate average position for merged effect
    const avgX = group.reduce((sum, e) => sum + (e.params?.targetX || 0.5), 0) / group.length
    const avgY = group.reduce((sum, e) => sum + (e.params?.targetY || 0.5), 0) / group.length
    const maxScale = Math.max(...group.map(e => e.params?.scale || 2.0))
    
    return {
      ...group[0],
      endTime: group[group.length - 1].endTime,
      params: {
        ...group[0].params,
        targetX: avgX,
        targetY: avgY,
        scale: maxScale
      }
    }
  }
}
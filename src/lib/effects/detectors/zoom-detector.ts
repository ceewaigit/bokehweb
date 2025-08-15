/**
 * Zoom Effect Detector - Session-Based Approach
 * Detects focus sessions where the user is working in specific areas
 */

import type { EffectDetector, ProjectEvent, RecordingContext, ZoomEffect } from '../types'

interface FocusSession {
  startTime: number
  endTime: number
  events: ProjectEvent[]
  centerX: number
  centerY: number
  clickX?: number  // Position of the most important click
  clickY?: number
  maxDistance: number
  hasClicks: boolean
}

export class ZoomEffectDetector implements EffectDetector {
  name = 'zoom'
  
  // Configuration
  private readonly config = {
    // Session detection
    SESSION_INACTIVITY_THRESHOLD: 5000,    // ms of inactivity to end session (longer to keep sessions together)
    SESSION_RADIUS: 200,                   // pixels - larger area to capture related activity
    SESSION_MIN_DURATION: 1000,            // minimum session duration to create zoom
    SESSION_MIN_EVENTS: 2,                 // minimum events to consider a session
    
    // Dwell detection
    DWELL_TIME_MS: 800,                    // ms of hovering in one spot to trigger zoom
    DWELL_RADIUS: 60,                      // pixels - how still the mouse must be
    
    // Zoom parameters
    ZOOM_SCALE: 2.0,
    ZOOM_INTRO_MS: 300,
    ZOOM_OUTRO_MS: 300,
    
    // Limits
    MAX_ZOOMS_PER_MINUTE: 4,              // Fewer but more meaningful zooms
    MIN_ZOOM_GAP: 2000,                   // Larger gap to merge nearby sessions
  }
  
  constructor(config?: Partial<typeof ZoomEffectDetector.prototype.config>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }
  
  detectEffects(events: ProjectEvent[], context: RecordingContext): ZoomEffect[] {
    console.log(`[ZoomDetector] Processing ${events.length} events with session-based approach`)
    
    // If no events, return empty array
    if (events.length === 0) {
      console.log('[ZoomDetector] No events found - no zoom effects to create')
      return []
    }
    
    // Detect focus sessions
    const sessions = this.detectFocusSessions(events, context)
    console.log(`[ZoomDetector] Found ${sessions.length} focus sessions`)
    
    // Convert sessions to zoom effects
    const zoomEffects = this.sessionsToZoomEffects(sessions, context)
    console.log(`[ZoomDetector] Created ${zoomEffects.length} zoom effects`)
    
    // Apply rate limiting
    const limitedEffects = this.applyRateLimiting(zoomEffects, context)
    console.log(`[ZoomDetector] After rate limiting: ${limitedEffects.length} zoom effects`)
    
    return limitedEffects
  }
  
  /**
   * Detect focus sessions - continuous periods of activity in specific areas
   */
  private detectFocusSessions(events: ProjectEvent[], context: RecordingContext): FocusSession[] {
    const sessions: FocusSession[] = []
    let currentSession: FocusSession | null = null
    let dwellStart: { x: number, y: number, time: number } | null = null
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      
      // Check for dwelling/hovering behavior
      if (event.type === 'move' && i > 0) {
        const prevEvent = events[i - 1]
        const distance = Math.sqrt(
          Math.pow(event.x - prevEvent.x, 2) + 
          Math.pow(event.y - prevEvent.y, 2)
        )
        
        // Start tracking dwell if mouse is relatively still
        if (distance < this.config.DWELL_RADIUS) {
          if (!dwellStart) {
            dwellStart = { x: event.x, y: event.y, time: event.timestamp }
          } else {
            // Check if we've been dwelling long enough
            const dwellTime = event.timestamp - dwellStart.time
            const dwellDistance = Math.sqrt(
              Math.pow(event.x - dwellStart.x, 2) + 
              Math.pow(event.y - dwellStart.y, 2)
            )
            
            if (dwellTime >= this.config.DWELL_TIME_MS && 
                dwellDistance < this.config.DWELL_RADIUS && 
                !currentSession) {
              // Start a session for dwell behavior
              currentSession = {
                startTime: dwellStart.time,
                endTime: event.timestamp,
                events: [event],
                centerX: event.x,
                centerY: event.y,
                maxDistance: 0,
                hasClicks: false
              }
              console.log(`[ZoomDetector] Started dwell session at ${dwellStart.time}ms`)
            }
          }
        } else {
          dwellStart = null // Reset dwell tracking if mouse moved
        }
      }
      
      if (!currentSession) {
        // Start new session on click or after initial movement
        if (event.type === 'click' || (event.type === 'move' && i > 0)) {
          currentSession = {
            startTime: event.timestamp,
            endTime: event.timestamp,
            events: [event],
            centerX: event.x,
            centerY: event.y,
            maxDistance: 0,
            hasClicks: event.type === 'click'
          }
          console.log(`[ZoomDetector] Started session at ${event.timestamp}ms`)
        }
        continue
      }
      
      // Check if this event belongs to current session
      const timeSinceLastEvent = event.timestamp - currentSession.endTime
      const distanceFromCenter = Math.sqrt(
        Math.pow(event.x - currentSession.centerX, 2) +
        Math.pow(event.y - currentSession.centerY, 2)
      )
      
      // End session if: too much time passed OR moved too far away
      if (timeSinceLastEvent > this.config.SESSION_INACTIVITY_THRESHOLD ||
          distanceFromCenter > this.config.SESSION_RADIUS) {
        
        // Save session if it's significant enough
        if (currentSession.endTime - currentSession.startTime >= this.config.SESSION_MIN_DURATION &&
            currentSession.events.length >= this.config.SESSION_MIN_EVENTS) {
          sessions.push(currentSession)
          console.log(`[ZoomDetector] Ended session: ${currentSession.startTime}-${currentSession.endTime}ms (${currentSession.events.length} events)`)
        }
        
        // Start new session if this is a click or we're still moving
        if (event.type === 'click' || distanceFromCenter > this.config.SESSION_RADIUS) {
          currentSession = {
            startTime: event.timestamp,
            endTime: event.timestamp,
            events: [event],
            centerX: event.x,
            centerY: event.y,
            maxDistance: 0,
            hasClicks: event.type === 'click'
          }
        } else {
          currentSession = null
        }
        continue
      }
      
      // Add event to current session
      currentSession.events.push(event)
      currentSession.endTime = event.timestamp
      currentSession.maxDistance = Math.max(currentSession.maxDistance, distanceFromCenter)
      
      if (event.type === 'click') {
        currentSession.hasClicks = true
        // Store click position - this is where we'll zoom to
        currentSession.clickX = event.x
        currentSession.clickY = event.y
      }
      
      // For calculating session bounds, use simple average
      // But don't move the center too much - this is just for detecting if mouse left the area
      const allX = currentSession.events.map(e => e.x)
      const allY = currentSession.events.map(e => e.y)
      currentSession.centerX = allX.reduce((a, b) => a + b, 0) / allX.length
      currentSession.centerY = allY.reduce((a, b) => a + b, 0) / allY.length
    }
    
    // Don't forget the last session
    if (currentSession && 
        currentSession.endTime - currentSession.startTime >= this.config.SESSION_MIN_DURATION &&
        currentSession.events.length >= this.config.SESSION_MIN_EVENTS) {
      sessions.push(currentSession)
      console.log(`[ZoomDetector] Final session: ${currentSession.startTime}-${currentSession.endTime}ms`)
    }
    
    // Merge nearby sessions
    return this.mergeNearbySessions(sessions)
  }
  
  /**
   * Merge sessions that are close in time and space
   */
  private mergeNearbySessions(sessions: FocusSession[]): FocusSession[] {
    if (sessions.length <= 1) return sessions
    
    const merged: FocusSession[] = []
    let currentGroup: FocusSession[] = [sessions[0]]
    
    for (let i = 1; i < sessions.length; i++) {
      const session = sessions[i]
      const lastInGroup = currentGroup[currentGroup.length - 1]
      
      const timeGap = session.startTime - lastInGroup.endTime
      const distance = Math.sqrt(
        Math.pow(session.centerX - lastInGroup.centerX, 2) +
        Math.pow(session.centerY - lastInGroup.centerY, 2)
      )
      
      // More aggressive merging: merge if close in time OR close in space
      // This creates longer, more consolidated zoom sessions
      const shouldMerge = (
        timeGap < this.config.MIN_ZOOM_GAP || // Close in time
        (timeGap < this.config.MIN_ZOOM_GAP * 2 && distance < this.config.SESSION_RADIUS / 2) // Moderately close in time AND very close in space
      )
      
      if (shouldMerge) {
        currentGroup.push(session)
      } else {
        // Save current group and start new one
        merged.push(this.mergeSessionGroup(currentGroup))
        currentGroup = [session]
      }
    }
    
    // Don't forget the last group
    if (currentGroup.length > 0) {
      merged.push(this.mergeSessionGroup(currentGroup))
    }
    
    console.log(`[ZoomDetector] Merged ${sessions.length} sessions into ${merged.length}`)
    return merged
  }
  
  /**
   * Merge a group of sessions into one
   */
  private mergeSessionGroup(group: FocusSession[]): FocusSession {
    if (group.length === 1) return group[0]
    
    const allEvents = group.flatMap(s => s.events)
    const hasClicks = group.some(s => s.hasClicks)
    
    // Calculate weighted center
    let totalX = 0, totalY = 0, totalWeight = 0
    for (const session of group) {
      const weight = session.events.length
      totalX += session.centerX * weight
      totalY += session.centerY * weight
      totalWeight += weight
    }
    
    return {
      startTime: group[0].startTime,
      endTime: group[group.length - 1].endTime,
      events: allEvents,
      centerX: totalX / totalWeight,
      centerY: totalY / totalWeight,
      maxDistance: Math.max(...group.map(s => s.maxDistance)),
      hasClicks
    }
  }
  
  /**
   * Convert focus sessions to zoom effects
   */
  private sessionsToZoomEffects(sessions: FocusSession[], context: RecordingContext): ZoomEffect[] {
    const effects: ZoomEffect[] = []
    
    for (const session of sessions) {
      // Include sessions with clicks OR sufficient dwell time
      const duration = session.endTime - session.startTime
      const isDwellSession = duration >= this.config.DWELL_TIME_MS && session.maxDistance < this.config.DWELL_RADIUS
      
      if (!session.hasClicks && !isDwellSession && duration < 2000) {
        console.log(`[ZoomDetector] Skipping session without significant activity: ${session.startTime}-${session.endTime}ms`)
        continue
      }
      
      // Use click position if available, otherwise use session center
      const targetX = session.clickX ?? session.centerX
      const targetY = session.clickY ?? session.centerY
      
      // Calculate normalized position
      let normalizedX = targetX / context.width
      let normalizedY = targetY / context.height
      
      // Account for padding if present
      if (context.padding && context.padding > 0) {
        const padding = context.padding
        const videoWidth = context.width - padding * 2
        const videoHeight = context.height - padding * 2
        
        normalizedX = (targetX - padding) / videoWidth
        normalizedY = (targetY - padding) / videoHeight
        
        // Clamp to valid range
        normalizedX = Math.max(0, Math.min(1, normalizedX))
        normalizedY = Math.max(0, Math.min(1, normalizedY))
      }
      
      effects.push({
        id: `zoom-session-${session.startTime}`,
        type: 'zoom',
        startTime: Math.max(0, session.startTime - 200), // Start slightly before session
        endTime: Math.min(session.endTime + 1000, context.duration), // Add more padding at end
        params: {
          targetX: normalizedX,
          targetY: normalizedY,
          scale: this.config.ZOOM_SCALE,
          introMs: this.config.ZOOM_INTRO_MS,
          outroMs: this.config.ZOOM_OUTRO_MS
        }
      })
      
      console.log(`[ZoomDetector] Created zoom for session: ${session.startTime}-${session.endTime}ms at (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`)
    }
    
    return effects
  }
  
  /**
   * Apply rate limiting to prevent too many zoom effects
   */
  private applyRateLimiting(effects: ZoomEffect[], context: RecordingContext): ZoomEffect[] {
    if (effects.length === 0) return effects
    
    // Calculate maximum allowed zooms
    const durationMinutes = context.duration / 60000
    const maxZooms = Math.ceil(durationMinutes * this.config.MAX_ZOOMS_PER_MINUTE)
    
    if (effects.length <= maxZooms) {
      return effects
    }
    
    // Sort by priority (sessions with more events/clicks are higher priority)
    // For now, just take the first N effects
    console.log(`[ZoomDetector] Rate limiting: keeping ${maxZooms} of ${effects.length} effects`)
    return effects.slice(0, maxZooms)
  }
  
}
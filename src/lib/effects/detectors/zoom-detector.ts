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
  maxDistance: number
  hasClicks: boolean
}

export class ZoomEffectDetector implements EffectDetector {
  name = 'zoom'
  
  // Configuration
  private readonly config = {
    // Session detection
    SESSION_INACTIVITY_THRESHOLD: 2000,    // ms of inactivity to end session
    SESSION_RADIUS: 400,                   // pixels - area to consider same session
    SESSION_MIN_DURATION: 2000,            // minimum session duration to create zoom
    SESSION_MIN_EVENTS: 5,                 // minimum events to consider a session
    
    // Zoom parameters
    ZOOM_SCALE: 2.0,
    ZOOM_INTRO_MS: 300,
    ZOOM_OUTRO_MS: 300,
    
    // Limits
    MAX_ZOOMS_PER_MINUTE: 4,              // Maximum zoom effects per minute of video
    MIN_ZOOM_GAP: 1000,                   // Minimum gap between zoom effects
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
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      
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
      }
      
      // Update center as weighted average (recent events have more weight)
      const weight = 0.1
      currentSession.centerX = currentSession.centerX * (1 - weight) + event.x * weight
      currentSession.centerY = currentSession.centerY * (1 - weight) + event.y * weight
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
      
      // Merge if close in time AND space
      if (timeGap < this.config.MIN_ZOOM_GAP && distance < this.config.SESSION_RADIUS) {
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
      // Skip sessions without clicks unless they're very long
      const duration = session.endTime - session.startTime
      if (!session.hasClicks && duration < 4000) {
        console.log(`[ZoomDetector] Skipping session without clicks: ${session.startTime}-${session.endTime}ms`)
        continue
      }
      
      // Calculate normalized position
      let normalizedX = session.centerX / context.width
      let normalizedY = session.centerY / context.height
      
      // Account for padding if present
      if (context.padding && context.padding > 0) {
        const padding = context.padding
        const videoWidth = context.width - padding * 2
        const videoHeight = context.height - padding * 2
        
        normalizedX = (session.centerX - padding) / videoWidth
        normalizedY = (session.centerY - padding) / videoHeight
        
        // Clamp to valid range
        normalizedX = Math.max(0, Math.min(1, normalizedX))
        normalizedY = Math.max(0, Math.min(1, normalizedY))
      }
      
      effects.push({
        id: `zoom-session-${session.startTime}`,
        type: 'zoom',
        startTime: session.startTime,
        endTime: Math.min(session.endTime + 500, context.duration), // Add a bit of padding
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
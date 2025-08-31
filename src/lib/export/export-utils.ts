/**
 * Export utilities for cleaner export operations
 */

import type { MouseEvent } from '@/types/project'

export interface FFmpegMouseEvent {
  timestamp: number
  mouseX: number
  mouseY: number
  captureWidth: number
  captureHeight: number
}

export class ExportUtils {
  /**
   * Transform mouse events from recording format to FFmpeg format
   * Single source of truth for mouse event transformation
   */
  static transformMouseEvents(mouseEvents: MouseEvent[]): FFmpegMouseEvent[] {
    return mouseEvents.map(event => ({
      timestamp: event.timestamp,
      mouseX: event.x,
      mouseY: event.y,
      captureWidth: event.captureWidth || event.screenWidth || 1920,
      captureHeight: event.captureHeight || event.screenHeight || 1080
    }))
  }

  /**
   * Check if timeline has significant gaps between clips
   */
  static hasSignificantGaps(clips: Array<{ startTime: number; duration: number }>, threshold = 10): boolean {
    if (clips.length <= 1) return false
    
    for (let i = 1; i < clips.length; i++) {
      const prevClip = clips[i - 1]
      const currClip = clips[i]
      const gap = currClip.startTime - (prevClip.startTime + prevClip.duration)
      
      if (gap > threshold) {
        return true
      }
    }
    
    return false
  }

  /**
   * Build timeline segments including gaps
   */
  static buildTimelineSegments(clips: Array<{ startTime: number; duration: number; id: string }>) {
    const segments: Array<{ 
      type: 'clip' | 'gap'
      clip?: { startTime: number; duration: number; id: string }
      duration: number
      startTime: number 
    }> = []
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      
      // Add gap before this clip if needed
      if (i === 0 && clip.startTime > 0) {
        // Gap at the beginning
        segments.push({
          type: 'gap',
          duration: clip.startTime,
          startTime: 0
        })
      } else if (i > 0) {
        const prevClip = clips[i - 1]
        const gapStart = prevClip.startTime + prevClip.duration
        const gapDuration = clip.startTime - gapStart
        
        if (gapDuration > 10) { // More than 10ms gap
          segments.push({
            type: 'gap',
            duration: gapDuration,
            startTime: gapStart
          })
        }
      }
      
      // Add the clip
      segments.push({
        type: 'clip',
        clip,
        duration: clip.duration,
        startTime: clip.startTime
      })
    }
    
    return segments
  }
}
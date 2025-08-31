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

}
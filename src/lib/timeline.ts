import type { Clip, ZoomBlock } from '@/types/project'

// Timeline layout constants
export const TIMELINE_LAYOUT = {
  RULER_HEIGHT: 32,
  TRACK_LABEL_WIDTH: 42,
  TRACK_PADDING: 4,
  MIN_CLIP_WIDTH: 40,
  SNAP_THRESHOLD: 8,
  SNAP_INTERVAL: 100,
} as const

// Timeline utilities
export class TimelineUtils {
  static timeToPixel(time: number, pixelsPerMs: number): number {
    return time * pixelsPerMs
  }

  static pixelToTime(pixel: number, pixelsPerMs: number): number {
    return pixel / pixelsPerMs
  }

  static snapToGrid(time: number, interval: number = TIMELINE_LAYOUT.SNAP_INTERVAL): number {
    return Math.round(time / interval) * interval
  }

  static calculatePixelsPerMs(viewportWidth: number, zoom: number): number {
    // Use more of the viewport width for timeline
    const usableWidth = viewportWidth - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
    const basePixelsPerMs = usableWidth / 10000
    return basePixelsPerMs * zoom
  }

  static calculateTimelineWidth(duration: number, pixelsPerMs: number, minWidth: number): number {
    // Add 30% extra padding beyond the last clip for better editing experience
    const extraPadding = duration * 0.3
    const totalDuration = duration + extraPadding
    const calculatedWidth = totalDuration * pixelsPerMs
    const minUsableWidth = minWidth - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
    return Math.max(calculatedWidth, minUsableWidth)
  }

  static calculateOptimalZoom(duration: number, viewportWidth: number): number {
    // We want to show the full duration plus 10% padding on screen initially
    const targetDuration = duration * 1.1
    
    // Base scale is 10 seconds visible at zoom 1.0
    const baseVisibleDuration = 10000 // 10 seconds in ms
    
    // Calculate required zoom to fit target duration in viewport
    const optimalZoom = baseVisibleDuration / targetDuration
    
    // Clamp zoom to reasonable values
    // Minimum 0.1 (very zoomed out), maximum 2.0 (for initial view)
    const clampedZoom = Math.max(0.1, Math.min(2.0, optimalZoom))
    
    // Round to nearest 0.05 for cleaner values
    return Math.round(clampedZoom * 20) / 20
  }


  static getRulerIntervals(zoom: number): { major: number; minor: number } {
    if (zoom < 0.5) {
      return { major: 5000, minor: 1000 }
    } else if (zoom < 1) {
      return { major: 2000, minor: 500 }
    } else if (zoom > 2) {
      return { major: 1000, minor: 50 }
    }
    return { major: 1000, minor: 100 }
  }
}

// Drag handler factories
export function createClipDragBoundFunc(
  trackY: number,
  pixelsPerMs: number,
  snapToGrid: boolean = true
) {
  return (pos: { x: number; y: number }) => {
    let newX = Math.max(TIMELINE_LAYOUT.TRACK_LABEL_WIDTH, pos.x)

    if (snapToGrid) {
      const time = TimelineUtils.pixelToTime(
        newX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH,
        pixelsPerMs
      )
      const snappedTime = TimelineUtils.snapToGrid(time)
      newX = TimelineUtils.timeToPixel(snappedTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
    }

    return {
      x: newX,
      y: trackY + TIMELINE_LAYOUT.TRACK_PADDING
    }
  }
}

// Helper to check if a clip would overlap at a given position
export function checkClipOverlap(
  proposedStartTime: number,
  duration: number,
  otherClips: Array<{ startTime: number; duration: number }>,
  minGap: number = 50
): { hasOverlap: boolean; nearestValidPosition?: number } {
  for (const clip of otherClips) {
    const clipEnd = clip.startTime + clip.duration
    const proposedEnd = proposedStartTime + duration

    // Check for overlap with gap
    if (proposedStartTime < clipEnd + minGap && proposedEnd > clip.startTime - minGap) {
      // Calculate nearest valid position
      const afterClip = clipEnd + minGap
      const beforeClip = Math.max(0, clip.startTime - duration - minGap)

      // Choose the closest valid position
      const distanceAfter = Math.abs(proposedStartTime - afterClip)
      const distanceBefore = Math.abs(proposedStartTime - beforeClip)

      return {
        hasOverlap: true,
        nearestValidPosition: distanceAfter < distanceBefore ? afterClip : beforeClip
      }
    }
  }

  return { hasOverlap: false }
}

// Helper to find magnetic snap points
export function findSnapPoints(
  otherClips: Array<{ startTime: number; duration: number }>,
  snapThreshold: number = 100
): number[] {
  const snapPoints: number[] = [0] // Always include timeline start

  for (const clip of otherClips) {
    snapPoints.push(clip.startTime) // Clip start
    snapPoints.push(clip.startTime + clip.duration) // Clip end
  }

  return snapPoints
}


// Keyboard shortcut handlers
export const TimelineKeyboardShortcuts = {
  play: ' ',
  split: 's',
  delete: ['Delete', 'Backspace'],
  copy: ['Meta+c', 'Control+c'],
  paste: ['Meta+v', 'Control+v'],
  duplicate: ['Meta+d', 'Control+d'],
  selectAll: ['Meta+a', 'Control+a'],
  deselect: 'Escape',
}


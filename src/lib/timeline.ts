import type { Clip, ZoomBlock } from '@/types/project'

// Timeline layout constants (minimal set - tracks are now dynamic)
export const TIMELINE_LAYOUT = {
  RULER_HEIGHT: 32,
  TRACK_LABEL_WIDTH: 42,
  TRACK_PADDING: 4,
  MIN_CLIP_WIDTH: 40,
  SNAP_THRESHOLD: 8,
  SNAP_INTERVAL: 100,
  // Legacy track heights - only for fallback, should not be used
  VIDEO_TRACK_HEIGHT: 100,
  AUDIO_TRACK_HEIGHT: 70,
  ZOOM_TRACK_HEIGHT: 60,
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
    // Ensure timeline uses full available width
    const calculatedWidth = duration * pixelsPerMs
    const minUsableWidth = minWidth - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
    return Math.max(calculatedWidth, minUsableWidth)
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

  // These methods are now deprecated since we use dynamic heights
  // Keeping minimal version for any remaining references
  static getTrackY(trackType: 'video' | 'zoom' | 'audio', hasZoomTrack: boolean = false): number {
    // Simple fallback - should migrate away from this
    const videoY = TIMELINE_LAYOUT.RULER_HEIGHT
    switch (trackType) {
      case 'video':
        return videoY
      case 'zoom':
        return videoY + TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT
      case 'audio':
        return videoY + TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT + (hasZoomTrack ? TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT : 0)
    }
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


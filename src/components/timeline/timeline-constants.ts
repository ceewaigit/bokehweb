// Timeline layout constants
export const TIMELINE_LAYOUT = {
  RULER_HEIGHT: 32,
  TRACK_LABEL_WIDTH: 80,
  VIDEO_TRACK_HEIGHT: 180,  // Increased from 120 for better visibility
  AUDIO_TRACK_HEIGHT: 80,   // Increased from 60 for better visibility
  ZOOM_TRACK_HEIGHT: 48,
  TRACK_PADDING: 4,
  MIN_CLIP_WIDTH: 40,
  SNAP_THRESHOLD: 10,
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
    const basePixelsPerMs = (viewportWidth - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH) / 10000
    return basePixelsPerMs * zoom
  }

  static calculateTimelineWidth(duration: number, pixelsPerMs: number, minWidth: number): number {
    return Math.max(duration * pixelsPerMs, minWidth - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH)
  }

  static formatTime(timeMs: number): string {
    if (timeMs < 1000) {
      return `${timeMs}ms`
    }
    return `${(timeMs / 1000).toFixed(1)}s`
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

  static getTrackY(trackType: 'video' | 'zoom' | 'audio', hasZoomTrack: boolean = false): number {
    const videoY = TIMELINE_LAYOUT.RULER_HEIGHT
    
    switch (trackType) {
      case 'video':
        return videoY
      case 'zoom':
        return videoY + TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT
      case 'audio':
        return hasZoomTrack
          ? videoY + TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT + TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT
          : videoY + TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT
    }
  }

  static getTotalHeight(hasZoomTrack: boolean = false): number {
    return (
      TIMELINE_LAYOUT.RULER_HEIGHT +
      TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT +
      TIMELINE_LAYOUT.AUDIO_TRACK_HEIGHT +
      (hasZoomTrack ? TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT : 0)
    )
  }
}

// Drag handler factory
export function createDragBoundFunc(
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
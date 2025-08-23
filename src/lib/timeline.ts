import type { Clip, ZoomBlock } from '@/types/project'

// Timeline layout constants
export const TIMELINE_LAYOUT = {
  RULER_HEIGHT: 36,
  TRACK_LABEL_WIDTH: 42,
  VIDEO_TRACK_HEIGHT: 90,
  AUDIO_TRACK_HEIGHT: 60,
  ZOOM_TRACK_HEIGHT: 50,
  TRACK_PADDING: 3,
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

// Zoom block collision detection utilities
export class ZoomBlockUtils {
  /**
   * Check if two zoom blocks overlap
   */
  static blocksOverlap(block1: ZoomBlock, block2: ZoomBlock): boolean {
    if (block1.id === block2.id) return false
    return block1.startTime < block2.endTime && block1.endTime > block2.startTime
  }

  /**
   * Check if a zoom block overlaps with any other blocks
   */
  static hasOverlap(
    blockId: string,
    startTime: number,
    endTime: number,
    allBlocks: ZoomBlock[]
  ): boolean {
    return allBlocks.some(block => {
      if (block.id === blockId) return false
      return startTime < block.endTime && endTime > block.startTime
    })
  }

  /**
   * Find the next valid position for a zoom block to avoid overlaps
   */
  static findNextValidPosition(
    blockId: string,
    desiredStart: number,
    duration: number,
    allBlocks: ZoomBlock[],
    clipDuration: number
  ): number {
    const otherBlocks = allBlocks
      .filter(b => b.id !== blockId)
      .sort((a, b) => a.startTime - b.startTime)

    // Check if desired position works
    const desiredEnd = desiredStart + duration
    if (!this.hasOverlap(blockId, desiredStart, desiredEnd, allBlocks)) {
      // Make sure it fits within clip bounds
      if (desiredEnd <= clipDuration) {
        return desiredStart
      }
      // If it extends past clip, try to fit it at the end
      const adjustedStart = Math.max(0, clipDuration - duration)
      if (!this.hasOverlap(blockId, adjustedStart, clipDuration, allBlocks)) {
        return adjustedStart
      }
    }

    // Find gaps between blocks
    let lastEnd = 0
    for (const block of otherBlocks) {
      const gapStart = lastEnd
      const gapEnd = block.startTime
      const gapSize = gapEnd - gapStart

      if (gapSize >= duration && desiredStart < gapEnd) {
        // Found a suitable gap
        return Math.max(gapStart, desiredStart)
      }
      lastEnd = block.endTime
    }

    // Check gap after last block
    if (lastEnd + duration <= clipDuration) {
      return lastEnd
    }

    // No valid position found, return original
    return desiredStart
  }

  /**
   * Constrain zoom block within clip boundaries
   */
  static constrainToClip(
    startTime: number,
    endTime: number,
    clipDuration: number
  ): { startTime: number; endTime: number } {
    const duration = endTime - startTime

    if (startTime < 0) {
      return { startTime: 0, endTime: Math.min(duration, clipDuration) }
    }

    if (endTime > clipDuration) {
      return {
        startTime: Math.max(0, clipDuration - duration),
        endTime: clipDuration
      }
    }

    return { startTime, endTime }
  }

  /**
   * Get valid resize bounds for a zoom block
   */
  static getResizeBounds(
    block: ZoomBlock,
    side: 'left' | 'right',
    allBlocks: ZoomBlock[],
    clipDuration: number
  ): { min: number; max: number } {
    const otherBlocks = allBlocks
      .filter(b => b.id !== block.id)
      .sort((a, b) => a.startTime - b.startTime)

    if (side === 'left') {
      // Find the maximum we can extend left
      let minStart = 0

      // Check for blocks to the left
      for (const other of otherBlocks) {
        if (other.endTime <= block.startTime) {
          minStart = Math.max(minStart, other.endTime)
        }
      }

      // Don't allow shrinking too much (minimum 100ms duration)
      const maxStart = block.endTime - 100

      return { min: minStart, max: maxStart }
    } else {
      // Find the maximum we can extend right
      let maxEnd = clipDuration

      // Check for blocks to the right
      for (const other of otherBlocks) {
        if (other.startTime >= block.endTime) {
          maxEnd = Math.min(maxEnd, other.startTime)
          break
        }
      }

      // Don't allow shrinking too much (minimum 100ms duration)
      const minEnd = block.startTime + 100

      return { min: minEnd, max: maxEnd }
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

export function createZoomBlockDragBoundFunc(
  blockId: string,
  duration: number,
  allBlocks: ZoomBlock[],
  clipDuration: number,
  clipX: number,
  trackY: number,
  pixelsPerMs: number
) {
  return (pos: { x: number; y: number }) => {
    // Convert pixel position to time relative to clip start
    const requestedTime = Math.max(0, TimelineUtils.pixelToTime(pos.x - clipX, pixelsPerMs))
    const requestedEnd = requestedTime + duration

    // Check boundaries first
    let validStartTime = requestedTime
    if (requestedEnd > clipDuration) {
      validStartTime = Math.max(0, clipDuration - duration)
    }

    // Check for overlaps with other blocks
    const otherBlocks = allBlocks.filter(b => b.id !== blockId)
    for (const block of otherBlocks) {
      // Check if requested position would overlap with this block
      if (validStartTime < block.endTime && validStartTime + duration > block.startTime) {
        // Try positioning before this block
        if (block.startTime - duration >= 0) {
          validStartTime = Math.max(0, block.startTime - duration)
        } else {
          // Try positioning after this block
          validStartTime = block.endTime
        }

        // Check if new position is valid
        const newEnd = validStartTime + duration
        if (newEnd > clipDuration) {
          // Can't fit after this block, stay at original position
          const currentBlock = allBlocks.find(b => b.id === blockId)
          if (currentBlock) {
            validStartTime = currentBlock.startTime
          }
        }
      }
    }

    // Ensure we don't go negative or past clip duration
    validStartTime = Math.max(0, Math.min(validStartTime, clipDuration - duration))

    // Convert back to pixels
    const validX = clipX + TimelineUtils.timeToPixel(validStartTime, pixelsPerMs)

    return {
      x: validX,
      y: trackY // Keep on same track
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

export const createDragBoundFunc = createClipDragBoundFunc
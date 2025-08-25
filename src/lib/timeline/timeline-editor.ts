import type { ZoomBlock, Clip } from '@/types/project'

export interface EditingState {
  blockId: string
  clipId: string
  startTime: number
  endTime: number
  type: 'zoom' | 'clip'
  operation: 'resize-left' | 'resize-right' | 'move' | 'intro' | 'outro'
}

export class TimelineEditor {
  private editingState: EditingState | null = null
  private constraints: {
    minDuration: number
    maxDuration: number
    clipBounds: { start: number; end: number }
  } = {
    minDuration: 100,
    maxDuration: Infinity,
    clipBounds: { start: 0, end: Infinity }
  }

  // Start editing operation
  startEdit(
    blockId: string,
    clipId: string,
    startTime: number,
    endTime: number,
    operation: EditingState['operation'],
    clipDuration: number
  ) {
    this.editingState = {
      blockId,
      clipId,
      startTime,
      endTime,
      type: 'zoom',
      operation
    }
    this.constraints.clipBounds = { start: 0, end: clipDuration }
  }

  // Update position during drag/resize
  updatePosition(deltaTime: number, allBlocks: ZoomBlock[]): { startTime: number; endTime: number } | null {
    if (!this.editingState) return null

    const { startTime, endTime, operation, blockId } = this.editingState
    let newStartTime = startTime
    let newEndTime = endTime

    switch (operation) {
      case 'resize-left':
        newStartTime = startTime + deltaTime
        // Keep end time fixed when resizing from left
        break

      case 'resize-right':
        // Keep start time fixed when resizing from right
        newEndTime = endTime + deltaTime
        break

      case 'move':
        const duration = endTime - startTime
        newStartTime = startTime + deltaTime
        newEndTime = newStartTime + duration
        break
    }

    // Apply constraints
    const validated = this.validatePosition(
      blockId,
      newStartTime,
      newEndTime,
      allBlocks
    )

    return validated
  }

  // Validate and constrain block position
  private validatePosition(
    blockId: string,
    startTime: number,
    endTime: number,
    allBlocks: ZoomBlock[]
  ): { startTime: number; endTime: number } {
    // Ensure minimum duration
    const duration = endTime - startTime
    if (duration < this.constraints.minDuration) {
      if (this.editingState?.operation === 'resize-left') {
        startTime = endTime - this.constraints.minDuration
      } else {
        endTime = startTime + this.constraints.minDuration
      }
    }

    // Clip bounds
    startTime = Math.max(this.constraints.clipBounds.start, startTime)
    endTime = Math.min(this.constraints.clipBounds.end, endTime)

    // Ensure block fits within clip
    if (endTime - startTime > this.constraints.clipBounds.end - startTime) {
      endTime = this.constraints.clipBounds.end
    }
    if (startTime < this.constraints.clipBounds.start) {
      startTime = this.constraints.clipBounds.start
    }

    // Check collisions with other blocks
    const otherBlocks = allBlocks.filter(b => b.id !== blockId)
    for (const block of otherBlocks) {
      // Check for overlap
      if (startTime < block.endTime && endTime > block.startTime) {
        // Resolve collision based on operation
        if (this.editingState?.operation === 'resize-right' || this.editingState?.operation === 'move') {
          // Snap to left edge of blocking block
          if (startTime < block.startTime) {
            endTime = Math.min(endTime, block.startTime)
          }
        }
        if (this.editingState?.operation === 'resize-left' || this.editingState?.operation === 'move') {
          // Snap to right edge of blocking block
          if (endTime > block.endTime) {
            startTime = Math.max(startTime, block.endTime)
          }
        }
      }
    }

    return { startTime, endTime }
  }

  // Commit the edit
  commitEdit(): { startTime: number; endTime: number } | null {
    if (!this.editingState) return null
    const result = {
      startTime: this.editingState.startTime,
      endTime: this.editingState.endTime
    }
    this.editingState = null
    return result
  }

  // Cancel editing
  cancelEdit() {
    this.editingState = null
  }

  // Get current editing state
  getEditingState() {
    return this.editingState
  }

  // Helper to convert pixel delta to time delta
  static pixelDeltaToTimeDelta(pixelDelta: number, pixelsPerMs: number): number {
    return pixelDelta / pixelsPerMs
  }

  // Helper to convert time delta to pixel delta
  static timeDeltaToPixelDelta(timeDelta: number, pixelsPerMs: number): number {
    return timeDelta * pixelsPerMs
  }
}

// Singleton instance for the app
export const timelineEditor = new TimelineEditor()
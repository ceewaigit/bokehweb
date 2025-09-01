import type { Clip } from '@/types/project'

export interface SnapPoint {
  position: number // Time in ms
  type: 'clip-start' | 'clip-end' | 'timeline-start'
  clipId?: string
}

export interface SnapResult {
  snapPosition: number | null
  distance: number
  shouldSnap: boolean
  snapType?: 'clip-start' | 'clip-end' | 'timeline-start'
}

export interface ValidDropResult {
  position: number
  isValid: boolean
  snappedTo?: SnapPoint
  wouldOverlap?: boolean
}

export interface SnapGuide {
  x: number // Pixel position
  type: 'start' | 'end' | 'timeline'
  isActive: boolean
}

export class MagneticSnap {
  private snapThresholdPixels: number
  private snapThresholdMs: number
  
  constructor(
    snapThresholdPixels: number = 10,
    pixelsPerMs: number = 1
  ) {
    this.snapThresholdPixels = snapThresholdPixels
    this.snapThresholdMs = snapThresholdPixels / pixelsPerMs
  }
  
  /**
   * Update the pixels per ms ratio (call when zoom changes)
   */
  updatePixelsPerMs(pixelsPerMs: number) {
    this.snapThresholdMs = this.snapThresholdPixels / pixelsPerMs
  }
  
  /**
   * Find all snap points from clips
   */
  findSnapPoints(clips: Clip[], excludeClipId?: string): SnapPoint[] {
    const snapPoints: SnapPoint[] = []
    
    // Always include timeline start
    snapPoints.push({
      position: 0,
      type: 'timeline-start'
    })
    
    // Add start and end of each clip (except the one being dragged)
    for (const clip of clips) {
      if (clip.id === excludeClipId) continue
      
      snapPoints.push({
        position: clip.startTime,
        type: 'clip-start',
        clipId: clip.id
      })
      
      snapPoints.push({
        position: clip.startTime + clip.duration,
        type: 'clip-end',
        clipId: clip.id
      })
    }
    
    // Sort by position for efficient searching
    return snapPoints.sort((a, b) => a.position - b.position)
  }
  
  /**
   * Find the nearest snap point to a given position
   */
  getNearestSnapPoint(
    position: number,
    snapPoints: SnapPoint[],
    clipDuration?: number
  ): SnapResult {
    let nearest: SnapPoint | null = null
    let minDistance = Infinity
    
    for (const point of snapPoints) {
      // Check both clip start and end positions for snapping
      const distances = [
        Math.abs(position - point.position), // Clip start to snap point
      ]
      
      // If we know the clip duration, also check clip end alignment
      if (clipDuration !== undefined) {
        distances.push(Math.abs((position + clipDuration) - point.position))
      }
      
      for (const distance of distances) {
        if (distance < minDistance) {
          minDistance = distance
          nearest = point
          // Adjust position if we're snapping the clip end
          if (clipDuration && distance === distances[1]) {
            nearest = {
              ...point,
              position: point.position - clipDuration
            }
          }
        }
      }
    }
    
    const shouldSnap = minDistance <= this.snapThresholdMs
    
    return {
      snapPosition: shouldSnap && nearest ? nearest.position : null,
      distance: minDistance,
      shouldSnap,
      snapType: nearest?.type
    }
  }
  
  /**
   * Check if a clip would overlap at a given position
   */
  checkOverlap(
    startTime: number,
    duration: number,
    clips: Clip[],
    excludeClipId?: string
  ): boolean {
    const endTime = startTime + duration
    
    for (const clip of clips) {
      if (clip.id === excludeClipId) continue
      
      const clipEnd = clip.startTime + clip.duration
      
      // Check for any overlap
      if (startTime < clipEnd && endTime > clip.startTime) {
        return true
      }
    }
    
    return false
  }
  
  /**
   * Find a valid drop position, considering snapping and overlaps
   */
  findValidDropPosition(
    proposedTime: number,
    duration: number,
    clips: Clip[],
    excludeClipId?: string,
    pixelsPerMs: number = 1
  ): ValidDropResult {
    // Update threshold based on current zoom
    this.updatePixelsPerMs(pixelsPerMs)
    
    // Find snap points
    const snapPoints = this.findSnapPoints(clips, excludeClipId)
    
    // Check for nearby snap point
    const snapResult = this.getNearestSnapPoint(proposedTime, snapPoints, duration)
    
    // Use snapped position if available, otherwise proposed
    const targetPosition = snapResult.shouldSnap && snapResult.snapPosition !== null
      ? snapResult.snapPosition
      : proposedTime
    
    // Check for overlap at target position
    const wouldOverlap = this.checkOverlap(targetPosition, duration, clips, excludeClipId)
    
    return {
      position: targetPosition,
      isValid: !wouldOverlap,
      snappedTo: snapResult.shouldSnap ? snapPoints.find(p => 
        Math.abs(p.position - targetPosition) < 1 ||
        Math.abs(p.position - (targetPosition + duration)) < 1
      ) : undefined,
      wouldOverlap
    }
  }
  
  /**
   * Get visual guides for snapping (for rendering snap lines)
   */
  getSnapGuides(
    draggedClipStart: number,
    draggedClipDuration: number,
    clips: Clip[],
    excludeClipId?: string,
    pixelsPerMs: number = 1
  ): SnapGuide[] {
    const guides: SnapGuide[] = []
    const snapPoints = this.findSnapPoints(clips, excludeClipId)
    const draggedClipEnd = draggedClipStart + draggedClipDuration
    
    for (const point of snapPoints) {
      const startDistance = Math.abs(draggedClipStart - point.position)
      const endDistance = Math.abs(draggedClipEnd - point.position)
      
      // Check if either edge is near this snap point
      const isNearStart = startDistance <= this.snapThresholdMs
      const isNearEnd = endDistance <= this.snapThresholdMs
      
      if (isNearStart || isNearEnd) {
        guides.push({
          x: point.position * pixelsPerMs,
          type: point.type === 'timeline-start' ? 'timeline' : 
                point.type === 'clip-start' ? 'start' : 'end',
          isActive: true
        })
      }
    }
    
    return guides
  }
  
  /**
   * Find the nearest gap where a clip could fit
   */
  findNearestGap(
    duration: number,
    clips: Clip[],
    preferredPosition: number = 0
  ): number | null {
    // Sort clips by start time
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime)
    
    // Check gap at the beginning
    if (sortedClips.length === 0 || sortedClips[0].startTime >= duration) {
      return 0
    }
    
    // Check gaps between clips
    for (let i = 0; i < sortedClips.length - 1; i++) {
      const gapStart = sortedClips[i].startTime + sortedClips[i].duration
      const gapEnd = sortedClips[i + 1].startTime
      const gapSize = gapEnd - gapStart
      
      if (gapSize >= duration) {
        // Found a gap that fits
        if (preferredPosition >= gapStart && preferredPosition + duration <= gapEnd) {
          return preferredPosition // Preferred position fits in this gap
        }
        return gapStart // Place at start of gap
      }
    }
    
    // Place after last clip
    const lastClip = sortedClips[sortedClips.length - 1]
    return lastClip.startTime + lastClip.duration
  }
}

// Singleton instance for consistent behavior across components
let magneticSnapInstance: MagneticSnap | null = null

export function getMagneticSnap(pixelsPerMs?: number): MagneticSnap {
  if (!magneticSnapInstance) {
    magneticSnapInstance = new MagneticSnap(10, pixelsPerMs || 1)
  } else if (pixelsPerMs !== undefined) {
    magneticSnapInstance.updatePixelsPerMs(pixelsPerMs)
  }
  return magneticSnapInstance
}
/**
 * Metadata converter utilities
 * Converts between different metadata formats used across the app
 */

import type { RecordingMetadata, MouseEvent, ClickEvent, KeyboardEvent } from '@/types/project'

export interface UnifiedMetadataEvent {
  timestamp: number
  mouseX: number
  mouseY: number
  eventType: 'mouse' | 'click' | 'keypress'
  key?: string
  button?: 'left' | 'right' | 'middle'
}

/**
 * Convert project metadata to unified event format for rendering
 */
export function convertMetadataToEvents(metadata: RecordingMetadata): UnifiedMetadataEvent[] {
  const events: UnifiedMetadataEvent[] = []

  // Convert mouse events
  if (Array.isArray(metadata.mouseEvents)) {
    for (const event of metadata.mouseEvents) {
      events.push({
        timestamp: event.timestamp,
        mouseX: event.x,
        mouseY: event.y,
        eventType: 'mouse'
      })
    }
  }

  // Convert click events
  if (Array.isArray(metadata.clickEvents)) {
    for (const event of metadata.clickEvents) {
      events.push({
        timestamp: event.timestamp,
        mouseX: event.x,
        mouseY: event.y,
        eventType: 'click',
        button: event.button
      })
    }
  }

  // Convert keyboard events
  if (Array.isArray(metadata.keyboardEvents)) {
    for (const event of metadata.keyboardEvents) {
      events.push({
        timestamp: event.timestamp,
        mouseX: 0, // Keyboard events don't have position
        mouseY: 0,
        eventType: 'keypress',
        key: event.key
      })
    }
  }

  // Sort by timestamp to ensure correct playback order
  return events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
}

/**
 * Convert electron metadata array to project metadata format
 */
export function convertElectronMetadataToProject(electronMetadata: any[]): RecordingMetadata {
  const metadata: RecordingMetadata = {
    mouseEvents: [],
    clickEvents: [],
    keyboardEvents: [],
    screenEvents: []
  }

  for (const event of electronMetadata) {
    switch (event.eventType) {
      case 'mouse':
        metadata.mouseEvents.push({
          timestamp: event.timestamp,
          x: event.mouseX,
          y: event.mouseY,
          screenWidth: event.screenWidth || 1920,
          screenHeight: event.screenHeight || 1080
        })
        break

      case 'click':
        metadata.clickEvents.push({
          timestamp: event.timestamp,
          x: event.mouseX,
          y: event.mouseY,
          button: event.button || 'left'
        })
        break

      case 'keypress':
        if (event.key) {
          metadata.keyboardEvents.push({
            timestamp: event.timestamp,
            key: event.key,
            modifiers: event.modifiers || []
          })
        }
        break
    }
  }

  return metadata
}

/**
 * Convert legacy metadata format to unified events
 */
export function convertLegacyMetadata(legacyMetadata: any): UnifiedMetadataEvent[] {
  // Handle if it's already in the unified format
  if (Array.isArray(legacyMetadata)) {
    return legacyMetadata.filter(event =>
      event && typeof event.timestamp === 'number' && event.eventType
    )
  }

  // Handle if it's in the project metadata format
  if (legacyMetadata && typeof legacyMetadata === 'object') {
    if (legacyMetadata.mouseEvents || legacyMetadata.clickEvents || legacyMetadata.keyboardEvents) {
      return convertMetadataToEvents(legacyMetadata as RecordingMetadata)
    }
  }

  // Return empty array if format is unknown
  return []
}

/**
 * Merge multiple metadata sources into unified events
 */
export function mergeMetadataEvents(...sources: (UnifiedMetadataEvent[] | null | undefined)[]): UnifiedMetadataEvent[] {
  const merged: UnifiedMetadataEvent[] = []

  for (const source of sources) {
    if (source && Array.isArray(source)) {
      merged.push(...source)
    }
  }

  // Remove duplicates and sort by timestamp
  const unique = new Map<string, UnifiedMetadataEvent>()
  for (const event of merged) {
    const key = `${event.timestamp}-${event.eventType}-${event.mouseX}-${event.mouseY}`
    if (!unique.has(key)) {
      unique.set(key, event)
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp)
}
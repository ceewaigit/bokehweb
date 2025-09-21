/**
 * Optimized metadata filtering utilities
 * Pre-filters metadata for chunks to avoid redundant processing in workers
 */

interface TimeBasedEvent {
  time?: number;
  timestamp?: number;
  [key: string]: any;
}

interface MetadataArrays {
  events?: TimeBasedEvent[];
  cursor?: TimeBasedEvent[];
  keyboard?: TimeBasedEvent[];
  clicks?: TimeBasedEvent[];
  scrolls?: TimeBasedEvent[];
  mouseEvents?: TimeBasedEvent[];
  keyboardEvents?: TimeBasedEvent[];
  clickEvents?: TimeBasedEvent[];
  scrollEvents?: TimeBasedEvent[];
  [key: string]: any;
}

/**
 * Binary search to find first event index >= targetTime
 */
function findFirstEventIndex(events: TimeBasedEvent[], targetTime: number): number {
  let left = 0;
  let right = events.length - 1;
  let result = events.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const eventTime = events[mid].timestamp ?? events[mid].time ?? 0;
    
    if (eventTime >= targetTime) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return result;
}

/**
 * Binary search to find last event index <= targetTime
 */
function findLastEventIndex(events: TimeBasedEvent[], targetTime: number): number {
  let left = 0;
  let right = events.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const eventTime = events[mid].timestamp ?? events[mid].time ?? 0;
    
    if (eventTime <= targetTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

/**
 * Efficiently filter events within a time range using binary search
 */
function filterEventsByTimeRange(
  events: TimeBasedEvent[] | undefined,
  startTimeMs: number,
  endTimeMs: number,
  adjustTime: boolean = true
): TimeBasedEvent[] {
  if (!events || events.length === 0) {
    return [];
  }

  // Use binary search to find the range
  const startIdx = findFirstEventIndex(events, startTimeMs);
  const endIdx = findLastEventIndex(events, endTimeMs);

  if (startIdx > endIdx || startIdx >= events.length || endIdx < 0) {
    return [];
  }

  // Extract the slice
  const filtered = events.slice(startIdx, endIdx + 1);

  // Adjust timestamps if needed
  if (adjustTime && filtered.length > 0) {
    return filtered.map(event => {
      const eventTime = event.timestamp ?? event.time ?? 0;
      return {
        ...event,
        timestamp: eventTime - startTimeMs,
        time: eventTime - startTimeMs
      };
    });
  }

  return filtered;
}

/**
 * Pre-filter metadata for a specific chunk
 */
export function filterMetadataForChunk(
  metadata: MetadataArrays,
  startTimeMs: number,
  endTimeMs: number
): MetadataArrays {
  const filtered: MetadataArrays = { ...metadata };

  // Filter all time-based event arrays
  const eventArrayKeys = [
    'events', 'cursor', 'keyboard', 'clicks', 'scrolls',
    'mouseEvents', 'keyboardEvents', 'clickEvents', 'scrollEvents'
  ];

  for (const key of eventArrayKeys) {
    if (Array.isArray(metadata[key])) {
      filtered[key] = filterEventsByTimeRange(
        metadata[key] as TimeBasedEvent[],
        startTimeMs,
        endTimeMs,
        true // Adjust timestamps relative to chunk start
      );
    }
  }

  return filtered;
}

/**
 * Pre-filter all metadata for multiple chunks at once
 */
export function preFilterMetadataForChunks(
  metadataMap: Map<string, MetadataArrays>,
  chunks: Array<{ startTimeMs: number; endTimeMs: number; index: number }>
): Map<number, Map<string, MetadataArrays>> {
  const result = new Map<number, Map<string, MetadataArrays>>();

  // Process each chunk
  for (const chunk of chunks) {
    const chunkMetadata = new Map<string, MetadataArrays>();
    
    // Filter metadata for each recording
    for (const [recordingId, metadata] of metadataMap) {
      const filtered = filterMetadataForChunk(
        metadata,
        chunk.startTimeMs,
        chunk.endTimeMs
      );
      
      // Only include if there's actual data
      const hasData = Object.keys(filtered).some(key => {
        const value = filtered[key];
        return Array.isArray(value) && value.length > 0;
      });
      
      if (hasData) {
        chunkMetadata.set(recordingId, filtered);
      }
    }
    
    result.set(chunk.index, chunkMetadata);
  }

  return result;
}

/**
 * Get recordings used in a time range
 */
export function getRecordingsInTimeRange(
  segments: any[],
  startTimeMs: number,
  endTimeMs: number
): Set<string> {
  const recordingIds = new Set<string>();

  for (const segment of segments) {
    // Check if segment overlaps with time range
    if (segment.endTime >= startTimeMs && segment.startTime <= endTimeMs) {
      // Extract recording IDs from clips
      if (segment.clips && Array.isArray(segment.clips)) {
        for (const clipData of segment.clips) {
          if (clipData.recording?.id) {
            recordingIds.add(clipData.recording.id);
          }
        }
      }
    }
  }

  return recordingIds;
}
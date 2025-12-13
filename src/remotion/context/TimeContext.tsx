/**
 * Time Context - Provides time coordinate utilities throughout the composition tree
 *
 * This context eliminates prop drilling of timelinePosition and clips[] by providing
 * a centralized source of truth for time calculations.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { Clip, Recording } from '@/types/project';
import { findClipAtTimelinePosition } from '@/lib/timeline/time-space-converter';

export interface TimeContextValue {
  // Timeline metadata
  totalDurationMs: number;
  fps: number;

  // Clips and recordings
  clips: Clip[];
  recordingsMap: Map<string, Recording>;

  // Utility functions
  getClipAtTimelinePosition: (timelineMs: number) => Clip | null;
  getRecording: (recordingId: string) => Recording | null;
}

const TimeContext = createContext<TimeContextValue | null>(null);

interface TimeProviderProps {
  clips: Clip[];
  recordings: Recording[];
  fps: number;
  children: React.ReactNode;
}

export function TimeProvider({ clips, recordings, fps, children }: TimeProviderProps) {
  const value = useMemo<TimeContextValue>(() => {
    // Calculate total timeline duration
    const totalDurationMs = clips.length > 0
      ? Math.max(...clips.map(c => c.startTime + c.duration))
      : 0;

    // Create efficient recordings lookup map
    const recordingsMap = new Map(
      recordings.map(r => [r.id, r])
    );

    // Find clip at a specific timeline position
    const getClipAtTimelinePosition = (timelineMs: number): Clip | null => {
      // Delegate to the shared, unit-tested implementation to keep boundary behavior consistent.
      return findClipAtTimelinePosition(timelineMs, clips);
    };

    // Get recording by ID
    const getRecording = (recordingId: string): Recording | null => {
      return recordingsMap.get(recordingId) || null;
    };

    return {
      totalDurationMs,
      fps,
      clips,
      recordingsMap,
      getClipAtTimelinePosition,
      getRecording,
    };
  }, [clips, recordings, fps]);

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

/**
 * Hook to access time context
 * Throws if used outside TimeProvider
 */
export function useTimeContext(): TimeContextValue {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error('useTimeContext must be used within TimeProvider');
  }
  return context;
}

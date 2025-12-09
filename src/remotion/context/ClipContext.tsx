/**
 * Clip Context - Provides current clip data to all layers within a clip sequence
 *
 * This context provides clip-specific data without prop drilling.
 * Each ClipSequence provides its own ClipContext.
 * 
 * SIMPLIFIED: All effects are now in timeline-space, no dual-space filtering needed.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { Clip, Recording, Effect, MouseEvent, ClickEvent, ScrollEvent } from '@/types/project';
import { useTimeContext } from './TimeContext';
import { useVideoUrl } from '../hooks/useVideoUrl';

export interface ClipContextValue {
  clip: Clip;
  recording: Recording;
  videoUrl: string;

  // Filtered metadata (only events within this clip's source range)
  cursorEvents: MouseEvent[];
  clickEvents: ClickEvent[];
  keystrokeEvents: any[];
  scrollEvents: ScrollEvent[];

  // Filtered effects (only effects that overlap this clip's timeline range)
  effects: Effect[];
}

const ClipContext = createContext<ClipContextValue | null>(null);

interface ClipProviderProps {
  clip: Clip;
  effects: Effect[];
  videoUrls?: Record<string, string>;
  children: React.ReactNode;
}

export function ClipProvider({ clip, effects, videoUrls, children }: ClipProviderProps) {
  const { getRecording } = useTimeContext();

  const value = useMemo<ClipContextValue>(() => {
    const recording = getRecording(clip.recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${clip.recordingId}`);
    }

    const metadata = recording.metadata || {};
    const sourceIn = clip.sourceIn || 0;
    const sourceOut = clip.sourceOut || recording.duration;

    // Filter metadata to only events within this clip's source range
    const cursorEvents = ((metadata as any).mouseEvents || []).filter(
      (e: any) => e.timestamp >= sourceIn && e.timestamp <= sourceOut
    );

    const clickEvents = ((metadata as any).clickEvents || []).filter(
      (e: any) => e.timestamp >= sourceIn && e.timestamp <= sourceOut
    );

    const keystrokeEvents = ((metadata as any).keyboardEvents || []).filter(
      (e: any) => e.timestamp >= sourceIn && e.timestamp <= sourceOut
    );

    const scrollEvents = ((metadata as any).scrollEvents || []).filter(
      (e: any) => e.timestamp >= sourceIn && e.timestamp <= sourceOut
    );

    // Filter effects by timeline range (all effects are now in timeline-space)
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    const filteredEffects = effects.filter(effect =>
      effect.startTime < clipEnd && effect.endTime > clipStart
    );

    return {
      clip,
      recording,
      videoUrl: '',
      cursorEvents,
      clickEvents,
      keystrokeEvents,
      scrollEvents,
      effects: filteredEffects,
    };
  }, [clip, effects, getRecording]);


  // Use hook to resolve video URL based on environment
  const videoUrl = useVideoUrl({ recording: value.recording, videoUrls }) || '';

  // Merge into final context value
  const finalValue = useMemo(
    () => ({ ...value, videoUrl }),
    [value, videoUrl]
  );

  return <ClipContext.Provider value={finalValue}>{children}</ClipContext.Provider>;
}

/**
 * Hook to access clip context
 * Throws if used outside ClipProvider
 */
export function useClipContext(): ClipContextValue {
  const context = useContext(ClipContext);
  if (!context) {
    throw new Error('useClipContext must be used within ClipProvider');
  }
  return context;
}

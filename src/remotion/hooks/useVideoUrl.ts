/**
 * Resolve video URL for a recording
 * Handles both preview (blob URLs) and export (file URLs) environments
 */

import { useMemo } from 'react';
import { getRemotionEnvironment } from 'remotion';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import type { Recording } from '@/types/project';

export interface UseVideoUrlProps {
  recording: Recording | null | undefined;
  videoUrls?: Record<string, string>; // From inputProps during export
}

export function useVideoUrl({ recording, videoUrls }: UseVideoUrlProps): string | undefined {
  const { isRendering } = getRemotionEnvironment();

  return useMemo(() => {
    if (!recording) return undefined;

    // PRIORITY 1: Export mode - use file:// URLs from videoUrls prop
    // This is set during export to provide direct file access
    if (isRendering && videoUrls && videoUrls[recording.id]) {
      return videoUrls[recording.id];
    }

    // Also check videoUrls even if not isRendering (for consistency if provided)
    if (videoUrls && videoUrls[recording.id]) {
      return videoUrls[recording.id];
    }

    // PRIORITY 2: Preview mode - use blob URL cache
    // Blob URLs are created for preview and offer best performance
    const cachedUrl = RecordingStorage.getBlobUrl(recording.id);
    if (cachedUrl) {
      return cachedUrl;
    }

    // PRIORITY 3: Fallback to video-stream protocol
    // Custom protocol registered in main process
    if (recording.filePath) {
      return `video-stream://local/${encodeURIComponent(recording.filePath)}`;
    }

    // Last resort
    return `video-stream://${recording.id}`;
  }, [recording, isRendering, videoUrls]);
}

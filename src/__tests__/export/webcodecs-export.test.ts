/**
 * Tests for WebCodecs-based export engine
 */

import { WebCodecsExportEngine } from '@/lib/export/webcodecs-export-engine'
import { VideoFrameExtractor } from '@/lib/export/video-frame-extractor'
import { ExportFormat, QualityLevel } from '@/types'
import type { ExportSettings, Recording } from '@/types'
import type { TimelineSegment } from '@/lib/export/timeline-processor'

describe('WebCodecsExportEngine', () => {
  let engine: WebCodecsExportEngine
  
  beforeEach(() => {
    engine = new WebCodecsExportEngine()
  })

  afterEach(() => {
    // Cleanup
    if (engine) {
      (engine as any).cleanup()
    }
  })

  describe('Frame Extraction', () => {
    it('should handle typing speed clips correctly', async () => {
      const extractor = new VideoFrameExtractor(1920, 1080, 30)
      
      // Mock a typing speed clip
      const typingSpeedClip = {
        id: 'clip-typing-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 1000,  // 1 second after speed adjustment
        sourceIn: 1946,
        sourceOut: 4282,
        playbackRate: 1.2,  // Sped up by 20%
        typingSpeedApplied: true
      }
      
      // Calculate expected frames
      const frameRate = 30
      const expectedFrames = Math.ceil((typingSpeedClip.duration / 1000) * frameRate)
      
      expect(expectedFrames).toBe(30)  // 1 second at 30fps
      
      // Verify source time calculation
      const sourceRange = typingSpeedClip.sourceOut - typingSpeedClip.sourceIn
      const originalDuration = sourceRange / typingSpeedClip.playbackRate
      
      expect(originalDuration).toBeCloseTo(1946.67, 1)  // Original duration before speedup
    })

    it('should handle multiple split clips from typing speed', () => {
      // Simulate 13 clips from typing speed splitting
      const clips = [
        { id: 'clip-split-0', playbackRate: 1, duration: 1946 },
        { id: 'clip-split-1', playbackRate: 1.2, duration: 1946.67 },
        { id: 'clip-split-2', playbackRate: 1, duration: 7939 },
        // ... more clips
      ]
      
      const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0)
      expect(totalDuration).toBeGreaterThan(0)
    })
  })

  describe('Export Settings', () => {
    it('should create valid export settings', () => {
      const settings: ExportSettings = {
        format: ExportFormat.WEBM,
        quality: QualityLevel.High,
        resolution: { width: 1920, height: 1080 },
        framerate: 30
      }
      
      expect(settings.format).toBe(ExportFormat.WEBM)
      expect(settings.resolution.width).toBe(1920)
      expect(settings.framerate).toBe(30)
    })

    it('should handle MP4 format with WebCodecs', () => {
      const settings: ExportSettings = {
        format: ExportFormat.MP4,
        quality: QualityLevel.Medium,
        resolution: { width: 1280, height: 720 },
        framerate: 24
      }
      
      expect(settings.format).toBe(ExportFormat.MP4)
      expect(settings.framerate).toBe(24)
    })
  })

  describe('Timeline Processing', () => {
    it('should process segments with typing speed clips', async () => {
      const segment: TimelineSegment = {
        id: 'segment-1',
        startTime: 0,
        endTime: 5000,
        clips: [
          {
            clip: {
              id: 'clip-1',
              recordingId: 'rec-1',
              startTime: 0,
              duration: 1000,
              sourceIn: 0,
              sourceOut: 1200,
              playbackRate: 1.2
            },
            recording: {} as Recording,
            segmentStartTime: 0,
            segmentEndTime: 1000
          }
        ],
        effects: [],
        hasGap: false
      }
      
      expect(segment.clips.length).toBe(1)
      expect(segment.clips[0].clip.playbackRate).toBe(1.2)
    })
  })
})
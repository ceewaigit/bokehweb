import { useMemo } from 'react'
import { computeCameraState, type CameraPhysicsState, type ParsedZoomBlock } from '@/lib/effects/utils/camera-calculator'
import { calculateVideoPosition } from '@/remotion/compositions/utils/video-position'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { EffectType } from '@/types/project'
import type { Effect, Recording } from '@/types/project'
import { getActiveClipDataAtFrame } from '@/remotion/utils/get-active-clip-data-at-frame'
import type { FrameLayoutItem } from '@/lib/timeline/frame-layout'

export function usePrecomputedCameraPath(args: {
  enabled: boolean
  currentFrame: number
  frameLayout: FrameLayoutItem[]
  fps: number
  videoWidth: number
  videoHeight: number
  sourceVideoWidth?: number
  sourceVideoHeight?: number
  effects: Effect[]
  getRecording: (recordingId: string) => Recording | null | undefined
}): { activeZoomBlock: ParsedZoomBlock | undefined; zoomCenter: { x: number; y: number } } | null {
  const {
    enabled,
    currentFrame,
    frameLayout,
    fps,
    videoWidth,
    videoHeight,
    sourceVideoWidth,
    sourceVideoHeight,
    effects,
    getRecording,
  } = args

  const frames = useMemo(() => {
    if (!enabled) return null
    if (!frameLayout || frameLayout.length === 0) return null

    const totalFrames = frameLayout[frameLayout.length - 1].endFrame
    const physics: CameraPhysicsState = {
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      lastTimeMs: 0,
      lastSourceTimeMs: 0,
    }

    const out: { activeZoomBlock: ParsedZoomBlock | undefined; zoomCenter: { x: number; y: number } }[] = new Array(totalFrames)

    for (let f = 0; f < totalFrames; f++) {
      const tMs = (f / fps) * 1000
      const clipData = getActiveClipDataAtFrame({ frame: f, frameLayout, fps, effects, getRecording })
      if (!clipData) {
        out[f] = { activeZoomBlock: undefined, zoomCenter: { x: 0.5, y: 0.5 } }
        continue
      }

      const { recording, sourceTimeMs, effects: clipEffects } = clipData
      const backgroundEffect = EffectsFactory.getActiveEffectAtTime(clipEffects, EffectType.Background, sourceTimeMs)
      const backgroundData = backgroundEffect ? EffectsFactory.getBackgroundData(backgroundEffect) : null
      const padding = backgroundData?.padding || 0

      // Use stable videoWidth/videoHeight for camera calculation
      // This ensures preview and export compute identical camera positions
      const videoArea = calculateVideoPosition(
        videoWidth,
        videoHeight,
        sourceVideoWidth ?? videoWidth,
        sourceVideoHeight ?? videoHeight,
        padding
      )

      const overscan = (() => {
        if (!videoArea || videoArea.drawWidth <= 0 || videoArea.drawHeight <= 0) return undefined
        const leftPx = videoArea.offsetX
        const rightPx = videoWidth - videoArea.offsetX - videoArea.drawWidth
        const topPx = videoArea.offsetY
        const bottomPx = videoHeight - videoArea.offsetY - videoArea.drawHeight
        return {
          left: Math.max(0, leftPx / videoArea.drawWidth),
          right: Math.max(0, rightPx / videoArea.drawWidth),
          top: Math.max(0, topPx / videoArea.drawHeight),
          bottom: Math.max(0, bottomPx / videoArea.drawHeight),
        }
      })()

      const computed = computeCameraState({
        effects: clipEffects,
        timelineMs: tMs,
        sourceTimeMs,
        recording,
        outputWidth: videoWidth,
        outputHeight: videoHeight,
        overscan,
        physics,
        // We simulate sequentially into a lookup table, so stateful physics is safe here.
        deterministic: false,
      })

      Object.assign(physics, computed.physics)
      out[f] = { activeZoomBlock: computed.activeZoomBlock, zoomCenter: computed.zoomCenter }
    }

    return out
  }, [
    enabled,
    frameLayout,
    fps,
    effects,
    getRecording,
    sourceVideoHeight,
    sourceVideoWidth,
    videoHeight,
    videoWidth,
  ])

  if (!frames) return null
  return frames[currentFrame] ?? null
}


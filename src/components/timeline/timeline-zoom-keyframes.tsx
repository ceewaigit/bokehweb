import React, { useState } from 'react'
import { Group, Circle, Rect, Text } from 'react-konva'
import type { Clip } from '@/types/project'
import { TIMELINE_LAYOUT, TimelineUtils } from './timeline-constants'

interface TimelineZoomKeyframesProps {
  clip: Clip
  pixelsPerMs: number
  trackY: number
  onKeyframeUpdate: (clipId: string, keyframeIndex: number, newTime: number) => void
}

export const TimelineZoomKeyframes = React.memo(({
  clip,
  pixelsPerMs,
  trackY,
  onKeyframeUpdate
}: TimelineZoomKeyframesProps) => {
  const [draggedKeyframe, setDraggedKeyframe] = useState<number | null>(null)
  const [hoverKeyframe, setHoverKeyframe] = useState<number | null>(null)

  if (!clip.effects?.zoom?.enabled || !clip.effects.zoom.keyframes?.length) {
    return null
  }

  const keyframes = clip.effects.zoom.keyframes
  const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
  const clipWidth = TimelineUtils.timeToPixel(clip.duration, pixelsPerMs)
  const trackHeight = TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT

  const segments: React.ReactNode[] = []
  const handles: React.ReactNode[] = []

  // Build segments
  for (let i = 0; i < keyframes.length - 1; i++) {
    const kf = keyframes[i]
    const nextKf = keyframes[i + 1]
    
    // Only show segments where zoom is active
    if (kf.zoom <= 1.01 && nextKf.zoom <= 1.01) continue

    const x1 = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
    const x2 = clipX + TimelineUtils.timeToPixel(nextKf.time, pixelsPerMs)
    const segmentWidth = x2 - x1
    
    // Skip very small segments
    if (segmentWidth < 10) continue
    
    const maxZoom = Math.max(kf.zoom, nextKf.zoom)
    const zoomText = maxZoom.toFixed(1) + 'x'
    const isAuto = clip.effects?.zoom?.sensitivity > 0

    segments.push(
      <Group key={`segment-${i}`} listening={false}>
        <Rect
          x={x1}
          y={trackY + 8}
          width={segmentWidth}
          height={trackHeight - 16}
          fill="#5b21b6"
          cornerRadius={8}
          stroke="#7c3aed"
          strokeWidth={1}
          listening={false}
        />
        {segmentWidth > 80 && (
          <React.Fragment>
            <Text
              x={x1 + 12}
              y={trackY + trackHeight / 2 - 6}
              text="🔍"
              fontSize={12}
              fill="white"
              listening={false}
            />
            <Text
              x={x1 + 32}
              y={trackY + trackHeight / 2 - 6}
              text="Zoom"
              fontSize={12}
              fill="white"
              fontStyle="normal"
              listening={false}
            />
            <Text
              x={x1 + segmentWidth / 2 - 20}
              y={trackY + trackHeight / 2 - 6}
              text={zoomText}
              fontSize={12}
              fill="white"
              fontStyle="bold"
              listening={false}
            />
            {isAuto && segmentWidth > 140 && (
              <React.Fragment>
                <Rect
                  x={x1 + segmentWidth - 50}
                  y={trackY + trackHeight / 2 - 8}
                  width={35}
                  height={16}
                  fill="rgba(255, 255, 255, 0.2)"
                  cornerRadius={8}
                  listening={false}
                />
                <Text
                  x={x1 + segmentWidth - 44}
                  y={trackY + trackHeight / 2 - 6}
                  text="Auto"
                  fontSize={10}
                  fill="white"
                  listening={false}
                />
              </React.Fragment>
            )}
          </React.Fragment>
        )}
      </Group>
    )
  }

  // Build handles
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]
    const x = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
    const y = trackY + trackHeight / 2
    const isDragging = draggedKeyframe === i
    const isHover = hoverKeyframe === i

    handles.push(
      <Group key={`keyframe-${i}`}>
        <Rect
          x={x - 2}
          y={trackY + 4}
          width={4}
          height={trackHeight - 8}
          fill="rgba(255, 255, 255, 0.3)"
          cornerRadius={2}
        />
        <Circle
          x={x}
          y={y}
          radius={isDragging ? 10 : isHover ? 9 : 8}
          fill={isDragging ? '#ffffff' : isHover ? '#e0e7ff' : 'rgba(255, 255, 255, 0.9)'}
          stroke={isDragging ? '#5b21b6' : '#7c3aed'}
          strokeWidth={2}
          opacity={1}
          draggable
          dragBoundFunc={(pos) => {
            const minX = clipX
            const maxX = clipX + clipWidth
            const minDistance = 5
            const prevX = i > 0 
              ? clipX + TimelineUtils.timeToPixel(keyframes[i - 1].time, pixelsPerMs) + minDistance 
              : minX
            const nextX = i < keyframes.length - 1 
              ? clipX + TimelineUtils.timeToPixel(keyframes[i + 1].time, pixelsPerMs) - minDistance 
              : maxX
            
            return {
              x: Math.max(prevX, Math.min(nextX, pos.x)),
              y: y
            }
          }}
          onDragStart={() => {
            setDraggedKeyframe(i)
          }}
          onDragEnd={(e) => {
            const newX = e.target.x()
            const newTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
            onKeyframeUpdate(clip.id, i, newTime)
            setDraggedKeyframe(null)
          }}
          onMouseEnter={() => {
            setHoverKeyframe(i)
            document.body.style.cursor = 'ew-resize'
          }}
          onMouseLeave={() => {
            setHoverKeyframe(null)
            if (!isDragging) {
              document.body.style.cursor = 'default'
            }
          }}
          onMouseDown={() => {
            document.body.style.cursor = 'ew-resize'
          }}
          onMouseUp={() => {
            document.body.style.cursor = isHover ? 'ew-resize' : 'default'
          }}
        />
        {(isHover || isDragging) && (
          <React.Fragment>
            <Rect
              x={x - 30}
              y={trackY - 20}
              width={60}
              height={18}
              fill="rgba(0, 0, 0, 0.9)"
              cornerRadius={4}
            />
            <Text
              x={x - 30}
              y={trackY - 17}
              width={60}
              text={`${(kf.time / 1000).toFixed(1)}s`}
              fontSize={11}
              fill="white"
              align="center"
            />
          </React.Fragment>
        )}
      </Group>
    )
  }

  return (
    <Group>
      {segments}
      {handles}
    </Group>
  )
})

TimelineZoomKeyframes.displayName = 'TimelineZoomKeyframes'
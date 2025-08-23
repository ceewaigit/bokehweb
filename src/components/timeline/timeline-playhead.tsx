import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TIMELINE_LAYOUT, TimelineUtils } from '@/lib/timeline'

interface TimelinePlayheadProps {
  currentTime: number
  totalHeight: number
  pixelsPerMs: number
  timelineWidth: number
  maxTime: number
  onSeek: (time: number) => void
}

export const TimelinePlayhead = React.memo(({
  currentTime,
  totalHeight,
  pixelsPerMs,
  timelineWidth,
  maxTime,
  onSeek
}: TimelinePlayheadProps) => {
  const x = TimelineUtils.timeToPixel(currentTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH

  return (
    <Group
      x={x}
      y={0}
      draggable
      dragBoundFunc={(pos) => {
        const newX = Math.max(
          TIMELINE_LAYOUT.TRACK_LABEL_WIDTH,
          Math.min(timelineWidth + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH, pos.x)
        )
        return { x: newX, y: 0 }
      }}
      onDragMove={(e) => {
        const newX = e.target.x() - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
        const time = TimelineUtils.pixelToTime(newX, pixelsPerMs)
        onSeek(Math.max(0, Math.min(maxTime, time)))
      }}
    >
      <Line
        points={[0, 0, 0, totalHeight]}
        stroke="hsl(var(--destructive))"
        strokeWidth={1.5}
        hitStrokeWidth={8}
        opacity={0.9}
      />
      <Rect
        x={-5}
        y={-1}
        width={10}
        height={10}
        fill="hsl(var(--destructive))"
        rotation={45}
        opacity={0.9}
      />
    </Group>
  )
})
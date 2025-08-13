import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TIMELINE_LAYOUT, TimelineUtils } from './timeline-constants'

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
        points={[1, 0, 1, totalHeight]}
        stroke="rgba(0, 0, 0, 0.5)"
        strokeWidth={3}
        listening={false}
      />
      <Line
        points={[0, 0, 0, totalHeight]}
        stroke="#dc2626"
        strokeWidth={2}
        hitStrokeWidth={10}
      />
      <Rect
        x={-7}
        y={-2}
        width={14}
        height={14}
        fill="#dc2626"
        rotation={45}
        shadowColor="black"
        shadowBlur={3}
        shadowOpacity={0.5}
      />
    </Group>
  )
})
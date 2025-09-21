import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import { clamp } from '@/lib/utils'

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
  const colors = useTimelineColors()
  const x = TimeConverter.msToPixels(currentTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

  return (
    <Group
      x={x}
      y={0}
      draggable
      dragBoundFunc={(pos) => {
        const newX = Math.max(
          TimelineConfig.TRACK_LABEL_WIDTH,
          Math.min(timelineWidth + TimelineConfig.TRACK_LABEL_WIDTH, pos.x)
        )
        return { x: newX, y: 0 }
      }}
      onDragMove={(e) => {
        const newX = e.target.x() - TimelineConfig.TRACK_LABEL_WIDTH
        const time = TimeConverter.pixelsToMs(newX, pixelsPerMs)
        onSeek(clamp(time, 0, maxTime))
      }}
    >
      {/* Playhead line */}
      <Line
        points={[0, 0, 0, totalHeight]}
        stroke={colors.playhead}
        strokeWidth={2}
        hitStrokeWidth={8}
        opacity={1}
      />
      {/* Diamond centered on line */}
      <Rect
        x={0}
        y={-6}
        width={12}
        height={12}
        fill={colors.playhead}
        rotation={45}
        opacity={1}
      />
    </Group>
  )
})
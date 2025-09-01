import React from 'react'
import { Group, Line, Rect } from 'react-konva'
import { TIMELINE_LAYOUT, TimelineUtils } from '@/lib/timeline'
import { useTimelineColors } from '@/lib/timeline/colors'

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
        
        // Debug: Show exact playhead position
        console.log('Playhead at pixel:', e.target.x(), '=> time:', time, 'ms (', (time/1000).toFixed(2), 's)')
        
        onSeek(Math.max(0, Math.min(maxTime, time)))
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
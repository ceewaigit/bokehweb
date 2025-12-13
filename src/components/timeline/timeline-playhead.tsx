import React, { useState } from 'react'
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
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const x = TimeConverter.msToPixels(currentTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
  const isActive = isHovered || isDragging

  // Handle dimensions
  const handleWidth = 12
  const handleHeight = 16
  const handleRadius = 4

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
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      onDragMove={(e) => {
        const newX = e.target.x() - TimelineConfig.TRACK_LABEL_WIDTH
        const time = TimeConverter.pixelsToMs(newX, pixelsPerMs)
        onSeek(clamp(time, 0, maxTime))
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main playhead line - clean and crisp */}
      <Line
        points={[0, handleHeight, 0, totalHeight]}
        stroke={colors.playhead}
        strokeWidth={1.5}
        hitStrokeWidth={10}
        opacity={isActive ? 1 : 0.85}
      />

      {/* Handle body - clean pill shape */}
      <Rect
        x={-handleWidth / 2}
        y={0}
        width={handleWidth}
        height={handleHeight}
        fill={colors.playhead}
        cornerRadius={handleRadius}
        opacity={isActive ? 1 : 0.9}
      />

      {/* Subtle top highlight for depth */}
      <Rect
        x={-handleWidth / 2 + 2}
        y={2}
        width={handleWidth - 4}
        height={3}
        fill="rgba(255, 255, 255, 0.25)"
        cornerRadius={1.5}
        listening={false}
      />
    </Group>
  )
})
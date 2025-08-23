import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { TIMELINE_LAYOUT } from '@/lib/timeline'

interface TimelineTrackProps {
  type: 'video' | 'zoom' | 'audio'
  y: number
  width: number
  height: number
}

export const TimelineTrack = React.memo(({ type, y, width, height }: TimelineTrackProps) => {
  const getTrackStyle = () => {
    switch (type) {
      case 'video':
        return { bgFill: 'hsl(var(--background))', bgOpacity: 0.4, labelText: 'V', labelSize: 10 }
      case 'zoom':
        return { bgFill: 'hsl(var(--primary))', bgOpacity: 0.05, labelText: 'Z', labelSize: 10 }
      case 'audio':
        return { bgFill: 'hsl(var(--background))', bgOpacity: 0.3, labelText: 'A', labelSize: 10 }
    }
  }

  const style = getTrackStyle()

  return (
    <Group>
      <Rect
        x={0}
        y={y}
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={style.bgOpacity}
      />
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
        height={height}
        fill="hsl(var(--card))"
        opacity={0.5}
      />
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH - 1}
        height={height}
        stroke="hsl(var(--border))"
        strokeWidth={0.5}
        fill="transparent"
        opacity={0.3}
      />
      <Text
        x={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH / 2 - 4}
        y={y + height / 2 - 5}
        text={style.labelText}
        fontSize={style.labelSize}
        fill="hsl(var(--muted-foreground))"
        fontFamily="monospace"
        fontStyle="bold"
        opacity={0.7}
      />
    </Group>
  )
})
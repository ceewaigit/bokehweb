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
        return { bgFill: '#09090b', bgOpacity: 0.5, labelText: 'V', labelSize: 11 }
      case 'zoom':
        return { bgFill: '#3b82f6', bgOpacity: 0.08, labelText: 'Z', labelSize: 11 }
      case 'audio':
        return { bgFill: '#09090b', bgOpacity: 0.4, labelText: 'A', labelSize: 11 }
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
        fill="#18181b"
        opacity={0.9}
      />
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH - 1}
        height={height}
        stroke="#27272a"
        strokeWidth={1}
        fill="transparent"
        opacity={0.5}
      />
      <Text
        x={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH / 2 - 4}
        y={y + height / 2 - 5}
        text={style.labelText}
        fontSize={style.labelSize}
        fill={type === 'zoom' ? '#60a5fa' : '#a1a1aa'}
        fontFamily="monospace"
        fontStyle="bold"
      />
    </Group>
  )
})
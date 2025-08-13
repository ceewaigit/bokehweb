import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { TIMELINE_LAYOUT } from './timeline-constants'

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
        return { bgFill: '#0a0a0f', bgOpacity: 0.8, labelText: 'Video', labelSize: 12 }
      case 'zoom':
        return { bgFill: 'rgba(59, 130, 246, 0.08)', bgOpacity: 1, labelText: 'Zoom', labelSize: 11 }
      case 'audio':
        return { bgFill: '#0a0a0f', bgOpacity: 0.6, labelText: 'Audio', labelSize: 12 }
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
        fill="#1a1a2e"
      />
      <Text
        x={10}
        y={y + height / 2 - 6}
        text={style.labelText}
        fontSize={style.labelSize}
        fill={type === 'zoom' ? '#60a5fa' : '#e2e8f0'}
        fontStyle={type === 'zoom' ? 'italic' : 'normal'}
      />
    </Group>
  )
})
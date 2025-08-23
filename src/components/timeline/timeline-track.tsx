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
        return { 
          bgFill: 'hsl(240, 5%, 6%)', 
          bgOpacity: 0.5, 
          labelText: 'V', 
          labelColor: 'hsl(240, 5%, 65%)'
        }
      case 'zoom':
        return { 
          bgFill: 'hsl(221, 83%, 53%)', 
          bgOpacity: 0.05, 
          labelText: 'Z', 
          labelColor: 'hsl(199, 89%, 48%)'
        }
      case 'audio':
        return { 
          bgFill: 'hsl(240, 5%, 6%)', 
          bgOpacity: 0.3, 
          labelText: 'A', 
          labelColor: 'hsl(240, 5%, 65%)'
        }
    }
  }

  const style = getTrackStyle()

  return (
    <Group>
      {/* Track background */}
      <Rect
        x={0}
        y={y}
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={style.bgOpacity}
      />
      
      {/* Track label background */}
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
        height={height}
        fill="hsl(240, 10%, 10%)"
        opacity={0.95}
      />
      
      {/* Track label border */}
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH - 1}
        height={height}
        stroke="hsl(240, 5%, 20%)"
        strokeWidth={1}
        fill="transparent"
        opacity={0.6}
      />
      
      {/* Track label text */}
      <Text
        x={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH / 2 - 4}
        y={y + height / 2 - 5}
        text={style.labelText}
        fontSize={12}
        fill={style.labelColor}
        fontFamily="system-ui"
        fontStyle="bold"
      />
    </Group>
  )
})
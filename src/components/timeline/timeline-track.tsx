import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { TIMELINE_LAYOUT } from '@/lib/timeline'
import { useTimelineColors } from '@/lib/timeline/colors'

interface TimelineTrackProps {
  type: 'video' | 'zoom' | 'keystroke' | 'audio'
  y: number
  width: number
  height: number
}

export const TimelineTrack = React.memo(({ type, y, width, height }: TimelineTrackProps) => {
  const colors = useTimelineColors()
  
  const getTrackStyle = () => {
    switch (type) {
      case 'video':
        return { 
          bgFill: colors.background, 
          bgOpacity: 0.5, 
          labelText: 'V', 
          labelColor: colors.mutedForeground
        }
      case 'zoom':
        return { 
          bgFill: colors.muted, 
          bgOpacity: 0.05, 
          labelText: 'Z', 
          labelColor: colors.info
        }
      case 'keystroke':
        return { 
          bgFill: colors.muted, 
          bgOpacity: 0.05, 
          labelText: 'K', 
          labelColor: colors.warning
        }
      case 'audio':
        return { 
          bgFill: colors.background, 
          bgOpacity: 0.3, 
          labelText: 'A', 
          labelColor: colors.mutedForeground
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
        stroke={colors.muted}
        strokeWidth={4}
      />
      
      {/* Track label background */}
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH}
        height={height}
        fill={colors.background}
        opacity={0.95}
      />
      
      {/* Track label border */}
      <Rect
        x={0}
        y={y}
        width={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH - 1}
        height={height}
        stroke={colors.border}
        strokeWidth={1}
        fill="transparent"
        opacity={0.6}
      />
      
      {/* Track label text */}
      <Text
        x={TIMELINE_LAYOUT.TRACK_LABEL_WIDTH / 2}
        y={y + height / 2}
        text={style.labelText}
        fontSize={11}
        fill={style.labelColor}
        fontFamily="system-ui"
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        offsetX={style.labelText.length * 3}
        offsetY={5.5}
      />
    </Group>
  )
})
import React from 'react'
import { Line, Text } from 'react-konva'
import { TIMELINE_LAYOUT, TimelineUtils } from '@/lib/timeline'
import { formatTime } from '@/lib/utils'

interface TimelineRulerProps {
  duration: number
  zoom: number
  pixelsPerMs: number
}

export const TimelineRuler = React.memo(({ duration, zoom, pixelsPerMs }: TimelineRulerProps) => {
  const { major, minor } = TimelineUtils.getRulerIntervals(zoom)
  const marks: React.ReactNode[] = []

  for (let time = 0; time <= duration; time += minor) {
    const isMajor = time % major === 0
    const x = TimelineUtils.timeToPixel(time, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH

    marks.push(
      <Line
        key={`mark-${time}`}
        points={[x, TIMELINE_LAYOUT.RULER_HEIGHT - (isMajor ? 16 : 8), x, TIMELINE_LAYOUT.RULER_HEIGHT]}
        stroke="#666"
        strokeWidth={isMajor ? 2 : 1}
      />
    )

    if (isMajor) {
      marks.push(
        <Text
          key={`label-${time}`}
          x={x + 4}
          y={4}
          text={formatTime(time)}
          fontSize={11}
          fill="#999"
        />
      )
    }
  }

  return <>{marks}</>
})
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
        points={[x, TIMELINE_LAYOUT.RULER_HEIGHT - (isMajor ? 12 : 6), x, TIMELINE_LAYOUT.RULER_HEIGHT]}
        stroke="#71717a"
        strokeWidth={isMajor ? 1.5 : 0.5}
        opacity={isMajor ? 0.8 : 0.4}
      />
    )

    if (isMajor) {
      marks.push(
        <Text
          key={`label-${time}`}
          x={x + 2}
          y={3}
          text={formatTime(time)}
          fontSize={9}
          fill="#a1a1aa"
          fontFamily="monospace"
          opacity={0.9}
        />
      )
    }
  }

  return <>{marks}</>
})
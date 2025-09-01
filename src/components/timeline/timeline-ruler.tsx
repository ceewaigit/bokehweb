import React from 'react'
import { Line, Text } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-converter'
import { formatTime } from '@/lib/utils'
import { useTimelineColors } from '@/lib/timeline/colors'

interface TimelineRulerProps {
  duration: number
  stageWidth: number
  zoom: number
  pixelsPerMs: number
}

export const TimelineRuler = React.memo(({ duration, stageWidth, zoom, pixelsPerMs }: TimelineRulerProps) => {
  const colors = useTimelineColors()
  const { major, minor } = TimeConverter.getRulerIntervals(zoom)
  const marks: React.ReactNode[] = []

  // Calculate the maximum time we need to render marks for based on stage width
  const maxTimeForStage = TimeConverter.pixelsToMs(stageWidth - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
  const maxTime = Math.max(duration, maxTimeForStage)

  for (let time = 0; time <= maxTime; time += minor) {
    const isMajor = time % major === 0
    const x = TimeConverter.msToPixels(time, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH

    // Only render marks that are within the stage width
    if (x > stageWidth) break

    marks.push(
      <Line
        key={`mark-${time}`}
        points={[x, TimelineConfig.RULER_HEIGHT - (isMajor ? 12 : 6), x, TimelineConfig.RULER_HEIGHT]}
        stroke={colors.mutedForeground}
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
          fontSize={10}
          fill={colors.mutedForeground}
          fontFamily="system-ui"
          opacity={0.9}
        />
      )
    }
  }

  return <>{marks}</>
})
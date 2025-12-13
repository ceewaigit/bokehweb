import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { useTimelineColors } from '@/lib/timeline/colors'
import { TimelineTrackType } from '@/types/project'
import { useWindowAppearanceStore } from '@/stores/window-appearance-store'

interface TimelineTrackProps {
  type: TimelineTrackType
  y: number
  width: number
  height: number
  muted?: boolean
}

export const TimelineTrack = React.memo(({ type, y, width, height, muted = false }: TimelineTrackProps) => {
  const colors = useTimelineColors()
  const windowSurfaceMode = useWindowAppearanceStore((s) => s.mode)
  const windowSurfaceOpacity = useWindowAppearanceStore((s) => s.opacity)

  const getTrackStyle = () => {
    switch (type) {
      case TimelineTrackType.Video:
        return {
          bgFill: colors.background,
          bgOpacity: 0.5,
          labelText: 'V',
          labelColor: colors.mutedForeground
        }
      case TimelineTrackType.Zoom:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'Z',
          labelColor: colors.info
        }
      case TimelineTrackType.Screen:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'S',
          labelColor: colors.accent
        }
      case TimelineTrackType.Keystroke:
        return {
          bgFill: colors.muted,
          bgOpacity: 0.05,
          labelText: 'K',
          labelColor: colors.warning
        }
      case TimelineTrackType.Audio:
        return {
          bgFill: colors.background,
          bgOpacity: 0.3,
          labelText: 'A',
          labelColor: colors.mutedForeground
        }
    }
  }

  const style = getTrackStyle()
  const isSolid = windowSurfaceMode === 'solid'
  const baseOpacity = isSolid ? 1 : Math.min(0.5, Math.max(0.04, windowSurfaceOpacity))

  return (
    <Group>
      {/* Track background */}
      <Rect
        x={0}
        y={y}
        width={width}
        height={height}
        fill={style.bgFill}
        opacity={
          isSolid
            ? baseOpacity * (muted ? Math.min(1, (style.bgOpacity || 0) + 0.2) : (style.bgOpacity || 0))
            : baseOpacity * (muted ? 0.12 : 0.08)
        }
        stroke={colors.muted}
        strokeWidth={4}
      />

      {/* Track label background */}
      <Rect
        x={0}
        y={y}
        width={TimelineConfig.TRACK_LABEL_WIDTH}
        height={height}
        fill={muted ? colors.muted : colors.background}
        opacity={isSolid ? baseOpacity * (muted ? 0.35 : 0.95) : baseOpacity * (muted ? 0.22 : 0.3)}
      />

      {/* Track label border */}
      <Rect
        x={0}
        y={y}
        width={TimelineConfig.TRACK_LABEL_WIDTH - 1}
        height={height}
        stroke={colors.border}
        strokeWidth={1}
        fill={"transparent"}
        opacity={muted ? 0.3 : 0.6}
      />

      {/* Track label text */}
      <Text
        x={TimelineConfig.TRACK_LABEL_WIDTH / 2}
        y={y + height / 2}
        text={style.labelText}
        fontSize={11}
        fill={muted ? colors.mutedForeground : style.labelColor}
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

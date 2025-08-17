import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import type { Clip } from '@/types/project'
import { TIMELINE_LAYOUT, TimelineUtils, createDragBoundFunc } from '@/lib/timeline'

interface TimelineClipProps {
  clip: Clip
  trackType: 'video' | 'audio'
  trackY: number
  pixelsPerMs: number
  isSelected: boolean
  onSelect: (clipId: string) => void
  onDragEnd: (clipId: string, newStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
}

export const TimelineClip = React.memo(({
  clip,
  trackType,
  trackY,
  pixelsPerMs,
  isSelected,
  onSelect,
  onDragEnd,
  onContextMenu
}: TimelineClipProps) => {
  const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TIMELINE_LAYOUT.MIN_CLIP_WIDTH,
    TimelineUtils.timeToPixel(clip.duration, pixelsPerMs)
  )

  const trackHeight = trackType === 'video' 
    ? TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT 
    : TIMELINE_LAYOUT.AUDIO_TRACK_HEIGHT

  const fillColor = trackType === 'video' ? '#2563eb' : '#10b981'
  const strokeColor = trackType === 'video'
    ? (isSelected ? '#60a5fa' : '#1e40af')
    : (isSelected ? '#34d399' : '#059669')

  return (
    <Group
      x={clipX}
      y={trackY + TIMELINE_LAYOUT.TRACK_PADDING}
      draggable
      dragBoundFunc={createDragBoundFunc(trackY, pixelsPerMs)}
      onDragEnd={(e) => {
        const newX = e.target.x()
        const newTime = TimelineUtils.pixelToTime(
          newX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH,
          pixelsPerMs
        )
        onDragEnd(clip.id, Math.max(0, newTime))
      }}
      onClick={() => onSelect(clip.id)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }
      }}
    >
      <Rect
        width={clipWidth}
        height={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 3 : 1}
        cornerRadius={trackType === 'video' ? 6 : 4}
        shadowColor="black"
        shadowBlur={trackType === 'video' ? 5 : 3}
        shadowOpacity={trackType === 'video' ? 0.3 : 0.2}
        shadowOffsetY={trackType === 'video' ? 2 : 1}
      />

      <Text
        x={8}
        y={trackType === 'video' ? trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2 - 20 : 8}
        text={`${trackType === 'video' ? 'Clip' : 'Audio'} ${clip.id.slice(-4)}`}
        fontSize={12}
        fill="white"
        fontStyle={trackType === 'video' ? 'bold' : 'normal'}
      />

      {/* Effect badges for video clips - simple indicators */}
      {trackType === 'video' && (
        <Group x={8} y={8}>
          {/* Stack badges horizontally with proper spacing */}
          {clip.effects?.zoom?.enabled && (
            <Group x={0} y={0}>
              <Rect width={45} height={18} fill="rgba(59, 130, 246, 0.9)" cornerRadius={3} />
              <Text x={6} y={4} text="Zoom" fontSize={10} fill="white" />
            </Group>
          )}

          {clip.effects?.cursor?.visible && (
            <Group x={clip.effects?.zoom?.enabled ? 50 : 0} y={0}>
              <Rect width={45} height={18} fill="rgba(34, 197, 94, 0.9)" cornerRadius={3} />
              <Text x={5} y={4} text="Cursor" fontSize={10} fill="white" />
            </Group>
          )}

          {clip.effects?.background?.type && clip.effects.background.type !== 'none' && (
            <Group 
              x={
                (clip.effects?.zoom?.enabled ? 50 : 0) + 
                (clip.effects?.cursor?.visible ? 50 : 0)
              } 
              y={0}
            >
              <Rect width={30} height={18} fill="rgba(168, 85, 247, 0.9)" cornerRadius={3} />
              <Text x={8} y={4} text="BG" fontSize={10} fill="white" />
            </Group>
          )}
        </Group>
      )}
    </Group>
  )
})
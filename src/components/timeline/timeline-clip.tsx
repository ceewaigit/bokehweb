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
  selectedEffectType?: 'zoom' | 'cursor' | 'background' | null
  onSelect: (clipId: string) => void
  onSelectEffect?: (type: 'zoom' | 'cursor' | 'background') => void
  onDragEnd: (clipId: string, newStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
}

export const TimelineClip = React.memo(({
  clip,
  trackType,
  trackY,
  pixelsPerMs,
  isSelected,
  selectedEffectType,
  onSelect,
  onSelectEffect,
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

  const fillColor = trackType === 'video' ? '#3b82f6' : '#10b981'
  const strokeColor = isSelected 
    ? '#fafafa'
    : 'transparent'

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
        strokeWidth={isSelected ? 2 : 0.5}
        cornerRadius={4}
        opacity={isSelected ? 1 : 0.85}
        shadowColor="black"
        shadowBlur={isSelected ? 8 : 2}
        shadowOpacity={0.2}
        shadowOffsetY={1}
      />

      <Text
        x={6}
        y={6}
        text={`${clip.id.slice(-4)}`}
        fontSize={10}
        fill="white"
        fontFamily="monospace"
        fontStyle="bold"
      />

      {/* Effect badges for video clips - clickable indicators */}
      {trackType === 'video' && (() => {
        const badges = []
        let xOffset = 0
        
        const handleBadgeClick = (e: any, type: 'zoom' | 'cursor' | 'background') => {
          e.cancelBubble = true
          onSelect(clip.id)
          onSelectEffect?.(type)
        }
        
        if (clip.effects?.zoom?.enabled) {
          badges.push(
            <Group 
              key="zoom"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'zoom')}
              onTap={(e) => handleBadgeClick(e, 'zoom')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'zoom' ? "#3b82f6" : "#71717a"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'zoom' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="Z" fontSize={9} fill="white" fontFamily="monospace" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }
        
        if (clip.effects?.cursor?.visible) {
          badges.push(
            <Group 
              key="cursor"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'cursor')}
              onTap={(e) => handleBadgeClick(e, 'cursor')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'cursor' ? "#10b981" : "#71717a"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'cursor' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="C" fontSize={9} fill="white" fontFamily="monospace" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }
        
        if (clip.effects?.background?.type && clip.effects.background.type !== 'none') {
          badges.push(
            <Group 
              key="bg"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'background')}
              onTap={(e) => handleBadgeClick(e, 'background')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'background' ? "#a855f7" : "#71717a"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'background' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="B" fontSize={9} fill="white" fontFamily="monospace" fontStyle="bold" />
            </Group>
          )
        }
        
        return badges.length > 0 ? <Group x={6} y={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2 - 20}>{badges}</Group> : null
      })()}
    </Group>
  )
})
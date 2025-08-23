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

  const fillColor = trackType === 'video' ? '#2563eb' : '#10b981'
  const strokeColor = isSelected 
    ? (trackType === 'video' ? '#60a5fa' : '#34d399')
    : (trackType === 'video' ? '#1e40af' : '#059669')

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
                width={45} 
                height={18} 
                fill={selectedEffectType === 'zoom' ? "#3b82f6" : "rgba(59, 130, 246, 0.9)"} 
                cornerRadius={3}
                stroke={selectedEffectType === 'zoom' ? "white" : undefined}
                strokeWidth={selectedEffectType === 'zoom' ? 2 : 0}
              />
              <Text x={6} y={4} text="Zoom" fontSize={10} fill="white" fontStyle={selectedEffectType === 'zoom' ? 'bold' : 'normal'} />
            </Group>
          )
          xOffset += 50
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
                width={45} 
                height={18} 
                fill={selectedEffectType === 'cursor' ? "#22c55e" : "rgba(34, 197, 94, 0.9)"} 
                cornerRadius={3}
                stroke={selectedEffectType === 'cursor' ? "white" : undefined}
                strokeWidth={selectedEffectType === 'cursor' ? 2 : 0}
              />
              <Text x={5} y={4} text="Cursor" fontSize={10} fill="white" fontStyle={selectedEffectType === 'cursor' ? 'bold' : 'normal'} />
            </Group>
          )
          xOffset += 50
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
                width={30} 
                height={18} 
                fill={selectedEffectType === 'background' ? "#a855f7" : "rgba(168, 85, 247, 0.9)"} 
                cornerRadius={3}
                stroke={selectedEffectType === 'background' ? "white" : undefined}
                strokeWidth={selectedEffectType === 'background' ? 2 : 0}
              />
              <Text x={8} y={4} text="BG" fontSize={10} fill="white" fontStyle={selectedEffectType === 'background' ? 'bold' : 'normal'} />
            </Group>
          )
        }
        
        return badges.length > 0 ? <Group x={8} y={8}>{badges}</Group> : null
      })()}
    </Group>
  )
})
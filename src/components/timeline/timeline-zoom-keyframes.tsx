import React, { useState } from 'react'
import { Group, Circle, Rect, Text } from 'react-konva'
import type { Clip } from '@/types/project'
import { TIMELINE_LAYOUT, TimelineUtils } from './timeline-constants'

interface TimelineZoomKeyframesProps {
  clip: Clip
  pixelsPerMs: number
  trackY: number
  onKeyframeUpdate: (clipId: string, keyframeIndex: number, newTime: number) => void
}

export const TimelineZoomKeyframes = React.memo(({
  clip,
  pixelsPerMs,
  trackY,
  onKeyframeUpdate
}: TimelineZoomKeyframesProps) => {
  const [draggedKeyframe, setDraggedKeyframe] = useState<number | null>(null)
  const [hoverKeyframe, setHoverKeyframe] = useState<number | null>(null)

  if (!clip.effects?.zoom?.enabled || !clip.effects.zoom.keyframes?.length) {
    return null
  }

  const keyframes = clip.effects.zoom.keyframes
  const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
  const clipWidth = TimelineUtils.timeToPixel(clip.duration, pixelsPerMs)
  const trackHeight = TIMELINE_LAYOUT.ZOOM_TRACK_HEIGHT

  return (
    <Group>
      {/* Draw zoom segments as clean bars */}
      {keyframes.slice(0, -1).map((kf, i) => {
        const nextKf = keyframes[i + 1]
        
        // Only show segments where zoom is active
        if (kf.zoom <= 1 && nextKf.zoom <= 1) return null

        const x1 = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
        const x2 = clipX + TimelineUtils.timeToPixel(nextKf.time, pixelsPerMs)
        const segmentWidth = x2 - x1
        
        // Get the average zoom for this segment
        const avgZoom = (kf.zoom + nextKf.zoom) / 2
        const zoomText = avgZoom.toFixed(1) + 'x'
        
        // Determine if this is an auto-zoom segment (could be based on some criteria)
        const isAuto = clip.effects?.zoom?.sensitivity > 0

        return (
          <Group key={`segment-${i}`}>
            {/* Main zoom bar */}
            <Rect
              x={x1}
              y={trackY + 8}
              width={segmentWidth}
              height={trackHeight - 16}
              fill="#5b21b6"
              cornerRadius={8}
              stroke="#7c3aed"
              strokeWidth={1}
            />
            
            {/* Icon and text container */}
            <Group x={x1 + 12} y={trackY + trackHeight / 2 - 8}>
              {/* Zoom icon (simplified) */}
              <Rect
                x={0}
                y={0}
                width={16}
                height={16}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                cornerRadius={2}
              />
              <Text
                x={2}
                y={3}
                text="🔍"
                fontSize={10}
                fill="white"
              />
              
              {/* Zoom text */}
              <Text
                x={24}
                y={2}
                text="Zoom"
                fontSize={12}
                fill="white"
                fontStyle="normal"
              />
              
              {/* Zoom level */}
              <Text
                x={segmentWidth / 2 - 20}
                y={2}
                text={zoomText}
                fontSize={12}
                fill="white"
                fontStyle="bold"
              />
              
              {/* Auto indicator if applicable */}
              {isAuto && segmentWidth > 120 && (
                <Group x={segmentWidth - 60} y={0}>
                  <Rect
                    x={0}
                    y={0}
                    width={40}
                    height={16}
                    fill="rgba(255, 255, 255, 0.2)"
                    cornerRadius={8}
                  />
                  <Text
                    x={8}
                    y={2}
                    text="Auto"
                    fontSize={11}
                    fill="white"
                  />
                </Group>
              )}
            </Group>
          </Group>
        )
      })}

      {/* Draw keyframe handles at segment boundaries */}
      {keyframes.map((kf, i) => {
        const x = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
        const y = trackY + trackHeight / 2
        const isActive = kf.zoom > 1
        const isDragging = draggedKeyframe === i
        const isHover = hoverKeyframe === i
        
        // Don't show handles at the very start/end of the clip
        if (i === 0 || i === keyframes.length - 1) return null

        return (
          <Group key={`keyframe-${i}`}>
            {/* Keyframe handle - vertical line style */}
            <Rect
              x={x - 2}
              y={trackY + 4}
              width={4}
              height={trackHeight - 8}
              fill="rgba(255, 255, 255, 0.3)"
              cornerRadius={2}
            />
            
            {/* Draggable handle */}
            <Circle
              x={x}
              y={y}
              radius={isDragging ? 8 : isHover ? 7 : 6}
              fill={isDragging ? '#ffffff' : isHover ? '#e0e7ff' : '#cbd5e1'}
              stroke={isDragging ? '#5b21b6' : '#7c3aed'}
              strokeWidth={2}
              opacity={isHover || isDragging ? 1 : 0.8}
              draggable
              dragBoundFunc={(pos) => {
                // Constrain to clip bounds
                const minX = clipX + 20
                const maxX = clipX + clipWidth - 20
                
                // Prevent dragging past neighboring keyframes
                const prevX = i > 0 ? clipX + TimelineUtils.timeToPixel(keyframes[i - 1].time, pixelsPerMs) + 20 : minX
                const nextX = i < keyframes.length - 1 ? clipX + TimelineUtils.timeToPixel(keyframes[i + 1].time, pixelsPerMs) - 20 : maxX
                
                return {
                  x: Math.max(prevX, Math.min(nextX, pos.x)),
                  y: y // Keep Y fixed
                }
              }}
              onDragStart={() => {
                setDraggedKeyframe(i)
              }}
              onDragEnd={(e) => {
                const newX = e.target.x()
                const newTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
                onKeyframeUpdate(clip.id, i, newTime)
                setDraggedKeyframe(null)
              }}
              onMouseEnter={() => {
                setHoverKeyframe(i)
                document.body.style.cursor = 'ew-resize'
              }}
              onMouseLeave={() => {
                setHoverKeyframe(null)
                if (!isDragging) {
                  document.body.style.cursor = 'default'
                }
              }}
              onMouseDown={() => {
                document.body.style.cursor = 'ew-resize'
              }}
              onMouseUp={() => {
                document.body.style.cursor = isHover ? 'ew-resize' : 'default'
              }}
            />

            {/* Time label on hover or drag */}
            {(isHover || isDragging) && (
              <Group x={x - 30} y={trackY - 20}>
                <Rect
                  width={60}
                  height={18}
                  fill="rgba(0, 0, 0, 0.9)"
                  cornerRadius={4}
                />
                <Text
                  x={0}
                  y={3}
                  width={60}
                  text={`${(kf.time / 1000).toFixed(1)}s`}
                  fontSize={11}
                  fill="white"
                  align="center"
                />
              </Group>
            )}
          </Group>
        )
      })}
    </Group>
  )
})

TimelineZoomKeyframes.displayName = 'TimelineZoomKeyframes'
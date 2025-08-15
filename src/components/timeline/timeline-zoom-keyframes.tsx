import React, { useState } from 'react'
import { Group, Circle, Line, Rect, Text } from 'react-konva'
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

  // Calculate the height for zoom value visualization
  const getKeyframeY = (zoom: number) => {
    // Map zoom from 1-2 to track height
    const normalizedZoom = Math.max(0, Math.min(1, (zoom - 1)))
    return trackY + trackHeight - (normalizedZoom * (trackHeight - 20))
  }

  return (
    <Group>
      {/* Draw connections between keyframes */}
      {keyframes.slice(0, -1).map((kf, i) => {
        const nextKf = keyframes[i + 1]
        const x1 = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
        const x2 = clipX + TimelineUtils.timeToPixel(nextKf.time, pixelsPerMs)
        const y1 = getKeyframeY(kf.zoom)
        const y2 = getKeyframeY(nextKf.zoom)

        // Only draw if there's actual zoom
        if (kf.zoom <= 1 && nextKf.zoom <= 1) return null

        return (
          <Line
            key={`line-${i}`}
            points={[x1, y1, x2, y2]}
            stroke="rgba(59, 130, 246, 0.5)"
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
          />
        )
      })}

      {/* Draw zoom area fill - properly sized based on time */}
      {keyframes.slice(0, -1).map((kf, i) => {
        const nextKf = keyframes[i + 1]
        if (kf.zoom <= 1 && nextKf.zoom <= 1) return null

        const x1 = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
        const x2 = clipX + TimelineUtils.timeToPixel(nextKf.time, pixelsPerMs)
        const y1 = getKeyframeY(kf.zoom)
        const y2 = getKeyframeY(nextKf.zoom)
        const baseY = trackY + trackHeight - 20

        // Create a polygon to show the zoom area properly
        return (
          <Group key={`fill-${i}`}>
            {/* Fill under the zoom curve */}
            <Line
              points={[
                x1, y1,
                x2, y2,
                x2, baseY,
                x1, baseY
              ]}
              closed
              fill="rgba(59, 130, 246, 0.15)"
            />
            {/* Stronger fill for the actual zoom area */}
            <Rect
              x={x1}
              y={Math.min(y1, y2)}
              width={x2 - x1}
              height={Math.max(baseY - Math.min(y1, y2), 2)}
              fill="rgba(59, 130, 246, 0.1)"
            />
          </Group>
        )
      })}

      {/* Draw keyframe points */}
      {keyframes.map((kf, i) => {
        const x = clipX + TimelineUtils.timeToPixel(kf.time, pixelsPerMs)
        const y = getKeyframeY(kf.zoom)
        const isActive = kf.zoom > 1
        const isDragging = draggedKeyframe === i
        const isHover = hoverKeyframe === i

        return (
          <Group key={`keyframe-${i}`}>
            {/* Keyframe circle */}
            <Circle
              x={x}
              y={y}
              radius={isDragging ? 7 : isHover ? 6 : 5}
              fill={isActive ? '#3b82f6' : '#94a3b8'}
              stroke={isDragging ? '#1e40af' : '#ffffff'}
              strokeWidth={2}
              draggable
              dragBoundFunc={(pos) => {
                // Constrain to clip bounds
                const minX = clipX
                const maxX = clipX + clipWidth
                
                // Prevent dragging past neighboring keyframes
                const prevX = i > 0 ? clipX + TimelineUtils.timeToPixel(keyframes[i - 1].time, pixelsPerMs) + 10 : minX
                const nextX = i < keyframes.length - 1 ? clipX + TimelineUtils.timeToPixel(keyframes[i + 1].time, pixelsPerMs) - 10 : maxX
                
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
                document.body.style.cursor = 'grab'
              }}
              onMouseLeave={() => {
                setHoverKeyframe(null)
                if (!isDragging) {
                  document.body.style.cursor = 'default'
                }
              }}
              onMouseDown={() => {
                document.body.style.cursor = 'grabbing'
              }}
              onMouseUp={() => {
                document.body.style.cursor = isHover ? 'grab' : 'default'
              }}
            />

            {/* Zoom value label on hover or drag */}
            {(isHover || isDragging) && (
              <Group x={x - 20} y={y - 25}>
                <Rect
                  width={40}
                  height={20}
                  fill="rgba(0, 0, 0, 0.8)"
                  cornerRadius={3}
                />
                <Text
                  x={0}
                  y={5}
                  width={40}
                  text={`${kf.zoom.toFixed(1)}x`}
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
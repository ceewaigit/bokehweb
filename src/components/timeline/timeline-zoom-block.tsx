import React, { useState } from 'react'
import { Rect, Group, Text, Line, Circle } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { TimelineUtils } from '@/lib/timeline'
import { useTimelineColors } from '@/lib/timeline/colors'
import { timelineEditor } from '@/lib/timeline/timeline-editor'

interface TimelineZoomBlockProps {
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
  introMs?: number
  outroMs?: number
  scale: number
  isSelected: boolean
  allBlocks: ZoomBlock[]
  blockId: string
  clipId: string
  clipX: number
  clipDuration: number
  pixelsPerMs: number
  onSelect: () => void
  onDragEnd: (newX: number) => void
  onIntroChange: (newIntroMs: number) => void
  onOutroChange: (newOutroMs: number) => void
  onUpdate: (updates: Partial<ZoomBlock>) => void  // Single update method only
}

export const TimelineZoomBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  introMs = 300,
  outroMs = 300,
  scale,
  isSelected,
  allBlocks,
  blockId,
  clipId,
  clipX,
  clipDuration,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onIntroChange,
  onOutroChange,
  onUpdate
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors() // Need this for dynamic theme changes
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // Show controls when selected or hovered
  const showControls = isSelected || isHovered
  const handleSize = 8 // Smaller, more refined handles
  const introOutroHandleRadius = 4

  // Calculate intro/outro widths as proportion of total width
  const totalDuration = endTime - startTime
  const introWidth = Math.max(2, ((introMs || 0) / totalDuration) * width)
  const outroWidth = Math.max(2, ((outroMs || 0) / totalDuration) * width)

  // Opacity and styling based on state
  const blockOpacity = isDragging ? 0.7 : (isSelected ? 0.95 : 0.85)
  const strokeWidth = isSelected ? 1.5 : (isHovered ? 1 : 0)
  const shadowBlur = isSelected ? 6 : (isHovered ? 4 : 2)

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        // Initialize editor on first drag movement
        if (!timelineEditor.getEditingState()) {
          timelineEditor.startEdit(
            blockId,
            clipId,
            startTime,
            endTime,
            'move',
            clipDuration
          )
        }
        
        // Calculate time delta from position change
        const deltaX = pos.x - x
        const timeDelta = TimelineUtils.pixelToTime(deltaX, pixelsPerMs)
        
        // Get validated position from editor
        const validated = timelineEditor.updatePosition(timeDelta, allBlocks)
        if (!validated) return { x, y }
        
        // Convert validated time back to position
        const newX = clipX + TimelineUtils.timeToPixel(validated.startTime, pixelsPerMs)
        
        return {
          x: newX,
          y: y
        }
      }}
      onDragStart={() => {
        setIsDragging(true)
        timelineEditor.startEdit(
          blockId,
          clipId,
          startTime,
          endTime,
          'move',
          clipDuration
        )
      }}
      onDragEnd={(e) => {
        setIsDragging(false)
        
        // Commit the edit and update
        const result = timelineEditor.commitEdit()
        if (result) {
          onUpdate({
            startTime: result.startTime,
            endTime: result.endTime
          })
        }
        
        onDragEnd(e.target.x())
      }}
      onClick={onSelect}
      onTap={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main zoom block - uses theme colors */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={colors.zoomBlock}
        cornerRadius={4}
        opacity={blockOpacity}
        stroke={isSelected ? colors.primary : (isHovered ? colors.zoomBlockHover : undefined)}
        strokeWidth={strokeWidth}
        shadowColor="black"
        shadowBlur={shadowBlur}
        shadowOpacity={0.2}
        shadowOffsetY={1}
      />

      {/* Intro section (zoom in) - subtle overlay */}
      {introWidth > 2 && (
        <Rect
          x={0}
          y={0}
          width={introWidth}
          height={height}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: introWidth, y: 0 }}
          fillLinearGradientColorStops={[
            0, 'rgba(255, 255, 255, 0.15)',
            1, 'rgba(255, 255, 255, 0)'
          ]}
          cornerRadius={[4, 0, 0, 4]}
          listening={false}
        />
      )}

      {/* Outro section (zoom out) - subtle overlay */}
      {outroWidth > 2 && (
        <Rect
          x={width - outroWidth}
          y={0}
          width={outroWidth}
          height={height}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: outroWidth, y: 0 }}
          fillLinearGradientColorStops={[
            0, 'rgba(255, 255, 255, 0)',
            1, 'rgba(255, 255, 255, 0.15)'
          ]}
          cornerRadius={[0, 4, 4, 0]}
          listening={false}
        />
      )}

      {/* Zoom level indicator - minimal and elegant */}
      <Group x={8} y={height / 2 - 7}>
        <Text
          x={0}
          y={0}
          text={`${scale.toFixed(1)}×`}
          fontSize={11}
          fill="white"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui"
          fontStyle={isSelected ? "500" : "normal"}
          shadowColor="black"
          shadowBlur={2}
          shadowOpacity={0.3}
        />
      </Group>

      {/* Intro/outro adjustment handles - only when controls are visible */}
      {showControls && (
        <>
          {/* Intro adjustment line and handle */}
          {introWidth > 10 && (
            <Group>
              <Line
                points={[introWidth, 4, introWidth, height - 4]}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth={1}
                dash={[2, 2]}
              />
              <Circle
                x={introWidth}
                y={height / 2}
                radius={introOutroHandleRadius}
                fill="white"
                stroke="rgba(0, 0, 0, 0.2)"
                strokeWidth={1}
                shadowColor="black"
                shadowBlur={2}
                shadowOpacity={0.2}
                cursor="ew-resize"
                draggable
                dragBoundFunc={(pos) => ({
                  x: Math.max(10, Math.min(width / 2 - 10, pos.x)),
                  y: y + height / 2
                })}
                onDragEnd={(e) => {
                  const newIntroWidth = e.target.x()
                  const newIntroMs = (newIntroWidth / width) * totalDuration
                  onIntroChange(Math.round(newIntroMs))
                }}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = 'ew-resize'
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = 'default'
                }}
              />
            </Group>
          )}

          {/* Outro adjustment line and handle */}
          {outroWidth > 10 && (
            <Group>
              <Line
                points={[width - outroWidth, 4, width - outroWidth, height - 4]}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth={1}
                dash={[2, 2]}
              />
              <Circle
                x={width - outroWidth}
                y={height / 2}
                radius={introOutroHandleRadius}
                fill="white"
                stroke="rgba(0, 0, 0, 0.2)"
                strokeWidth={1}
                shadowColor="black"
                shadowBlur={2}
                shadowOpacity={0.2}
                cursor="ew-resize"
                draggable
                dragBoundFunc={(pos) => ({
                  x: Math.max(width / 2 + 10, Math.min(width - 10, pos.x)),
                  y: y + height / 2
                })}
                onDragEnd={(e) => {
                  const newOutroWidth = width - e.target.x()
                  const newOutroMs = (newOutroWidth / width) * totalDuration
                  onOutroChange(Math.round(newOutroMs))
                }}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = 'ew-resize'
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = 'default'
                }}
              />
            </Group>
          )}

          {/* Resize handles - refined appearance */}
          {/* Left resize handle */}
          <Rect
            x={-handleSize / 2}
            y={height / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            stroke="rgba(99, 102, 241, 0.5)"
            strokeWidth={1}
            cornerRadius={2}
            shadowColor="black"
            shadowBlur={2}
            shadowOpacity={0.2}
            cursor="ew-resize"
            draggable
            onDragStart={() => {
              setIsResizing(true)
              timelineEditor.startEdit(
                blockId,
                clipId,
                startTime,
                endTime,
                'resize-left',
                clipDuration
              )
            }}
            dragBoundFunc={(pos) => {
              // Calculate time delta from handle movement
              const handleDelta = pos.x - (-handleSize / 2)
              const timeDelta = TimelineUtils.pixelToTime(handleDelta, pixelsPerMs)
              
              // Use timeline editor to validate position
              const validated = timelineEditor.updatePosition(timeDelta, allBlocks)
              if (!validated) return pos

              // Convert validated time back to handle position
              const finalTimeDelta = validated.startTime - startTime
              const finalHandleDelta = TimelineUtils.timeToPixel(finalTimeDelta, pixelsPerMs)
              const finalX = -handleSize / 2 + finalHandleDelta

              return {
                x: finalX,
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              setIsResizing(false)
              
              // Calculate final time delta
              const handleDelta = e.target.x() - (-handleSize / 2)
              const timeDelta = TimelineUtils.pixelToTime(handleDelta, pixelsPerMs)
              
              // Get validated position from editor
              const validated = timelineEditor.updatePosition(timeDelta, allBlocks)
              timelineEditor.commitEdit()

              if (validated) {
                onUpdate({
                  startTime: validated.startTime
                })
              }
            }}
            onMouseEnter={(e) => {
              const container = e.target.getStage()?.container()
              if (container) container.style.cursor = 'ew-resize'
            }}
            onMouseLeave={(e) => {
              const container = e.target.getStage()?.container()
              if (container && !isResizing) container.style.cursor = 'default'
            }}
          />

          {/* Right resize handle */}
          <Rect
            x={width - handleSize / 2}
            y={height / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            stroke="rgba(99, 102, 241, 0.5)"
            strokeWidth={1}
            cornerRadius={2}
            shadowColor="black"
            shadowBlur={2}
            shadowOpacity={0.2}
            cursor="ew-resize"
            draggable
            onDragStart={() => {
              setIsResizing(true)
              timelineEditor.startEdit(
                blockId,
                clipId,
                startTime,
                endTime,
                'resize-right',
                clipDuration
              )
            }}
            dragBoundFunc={(pos) => {
              // Calculate time delta from handle movement
              const handleDelta = pos.x - (width - handleSize / 2)
              const timeDelta = TimelineUtils.pixelToTime(handleDelta, pixelsPerMs)
              
              // Use timeline editor to validate position
              const validated = timelineEditor.updatePosition(timeDelta, allBlocks)
              if (!validated) return pos

              // Convert validated time back to handle position
              const finalTimeDelta = validated.endTime - endTime
              const finalHandleDelta = TimelineUtils.timeToPixel(finalTimeDelta, pixelsPerMs)
              const finalX = width - handleSize / 2 + finalHandleDelta

              return {
                x: finalX,
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              setIsResizing(false)
              
              // Calculate final time delta
              const handleDelta = e.target.x() - (width - handleSize / 2)
              const timeDelta = TimelineUtils.pixelToTime(handleDelta, pixelsPerMs)
              
              // Get validated position from editor
              const validated = timelineEditor.updatePosition(timeDelta, allBlocks)
              timelineEditor.commitEdit()

              if (validated) {
                onUpdate({
                  endTime: validated.endTime
                })
              }
            }}
            onMouseEnter={(e) => {
              const container = e.target.getStage()?.container()
              if (container) container.style.cursor = 'ew-resize'
            }}
            onMouseLeave={(e) => {
              const container = e.target.getStage()?.container()
              if (container && !isResizing) container.style.cursor = 'default'
            }}
          />
        </>
      )}
    </Group>
  )
})

TimelineZoomBlock.displayName = 'TimelineZoomBlock'
import React, { useState, useRef } from 'react'
import { Rect, Group, Text, Line, Circle } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { createZoomBlockDragBoundFunc, TimelineUtils } from '@/lib/timeline'
import { useTimelineColors } from '@/lib/timeline/colors'

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
  allBlocks: ZoomBlock[]  // All zoom blocks for collision detection
  blockId: string
  clipX: number  // Clip's x position for coordinate conversion
  clipDuration: number  // Clip duration for bounds checking
  pixelsPerMs: number  // For coordinate conversion
  onSelect: () => void
  onDragEnd: (newX: number) => void
  onResize: (newWidth: number, side: 'left' | 'right') => void
  onIntroChange: (newIntroMs: number) => void
  onOutroChange: (newOutroMs: number) => void
  onUpdate?: (updates: Partial<ZoomBlock>) => void  // Direct update callback
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
  clipX,
  clipDuration,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onResize,
  onIntroChange,
  onOutroChange,
  onUpdate
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors() // Need this for dynamic theme changes
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  
  // Track initial drag positions for accurate resize calculations
  const initialDragData = useRef<{ width: number; startTime: number; endTime: number } | null>(null)

  // Show controls when selected or hovered
  const showControls = isSelected || isHovered
  const handleSize = 8 // Smaller, more refined handles
  const introOutroHandleRadius = 4

  // Calculate intro/outro widths as proportion of total width
  const totalDuration = endTime - startTime
  const introWidth = Math.max(2, ((introMs || 0) / totalDuration) * width)
  const outroWidth = Math.max(2, ((outroMs || 0) / totalDuration) * width)

  // Create drag bound function with collision detection
  const dragBoundFunc = React.useMemo(() =>
    createZoomBlockDragBoundFunc(
      blockId,
      totalDuration,
      allBlocks,
      clipDuration,
      clipX,
      y,
      pixelsPerMs
    ), [blockId, totalDuration, allBlocks, clipDuration, clipX, y, pixelsPerMs]
  )

  // Opacity and styling based on state
  const blockOpacity = isDragging ? 0.7 : (isSelected ? 0.95 : 0.85)
  const strokeWidth = isSelected ? 1.5 : (isHovered ? 1 : 0)
  const shadowBlur = isSelected ? 6 : (isHovered ? 4 : 2)

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={dragBoundFunc}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(e) => {
        setIsDragging(false)
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
              initialDragData.current = { width, startTime, endTime }
            }}
            dragBoundFunc={(pos) => {
              // Calculate minimum x based on previous blocks
              let minX = -width + handleSize // Can't invert the block
              
              const prevBlocks = allBlocks
                .filter(b => b.id !== blockId && b.endTime <= startTime)
                .sort((a, b) => b.endTime - a.endTime)
              
              if (prevBlocks.length > 0) {
                const gap = startTime - prevBlocks[0].endTime
                const maxMove = TimelineUtils.timeToPixel(gap, pixelsPerMs)
                minX = Math.max(minX, -maxMove - handleSize / 2)
              }
              
              // Don't allow making the block too small (min 100ms)
              const minDuration = 100
              const maxMove = width - TimelineUtils.timeToPixel(minDuration, pixelsPerMs)
              const maxX = maxMove - handleSize / 2
              
              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              setIsResizing(false)
              if (!initialDragData.current) return
              
              const deltaX = e.target.x() + handleSize / 2
              const timeDelta = TimelineUtils.pixelToTime(-deltaX, pixelsPerMs)
              
              console.log('Left resize end:', {
                deltaX,
                timeDelta,
                oldStartTime: initialDragData.current.startTime,
                newStartTime: initialDragData.current.startTime + timeDelta
              })
              
              if (onUpdate) {
                onUpdate({
                  startTime: Math.max(0, initialDragData.current.startTime + timeDelta)
                  // endTime stays the same
                })
              } else {
                onResize(width - deltaX, 'left')
              }
              
              initialDragData.current = null
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
              initialDragData.current = { width, startTime, endTime }
            }}
            dragBoundFunc={(pos) => {
              // Calculate maximum x based on next blocks and clip duration
              let maxX = TimelineUtils.timeToPixel(clipDuration - startTime, pixelsPerMs) - handleSize / 2
              
              const nextBlocks = allBlocks
                .filter(b => b.id !== blockId && b.startTime >= endTime)
                .sort((a, b) => a.startTime - b.startTime)
              
              if (nextBlocks.length > 0) {
                const gap = nextBlocks[0].startTime - endTime
                const availableSpace = TimelineUtils.timeToPixel(endTime - startTime + gap, pixelsPerMs)
                maxX = Math.min(maxX, availableSpace - handleSize / 2)
              }
              
              // Don't allow making the block too small (min 100ms)
              const minDuration = 100
              const minWidth = TimelineUtils.timeToPixel(minDuration, pixelsPerMs)
              const minX = minWidth - handleSize / 2
              
              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              setIsResizing(false)
              if (!initialDragData.current) return
              
              const handleX = e.target.x() + handleSize / 2
              const newWidth = handleX
              const newDuration = TimelineUtils.pixelToTime(newWidth, pixelsPerMs)
              const newEndTime = initialDragData.current.startTime + newDuration
              
              console.log('Right resize end:', {
                handleX,
                newWidth,
                oldWidth: initialDragData.current.width,
                newDuration,
                oldEndTime: initialDragData.current.endTime,
                newEndTime
              })
              
              if (onUpdate) {
                onUpdate({
                  endTime: Math.min(clipDuration, newEndTime)
                })
              } else {
                onResize(newWidth, 'right')
              }
              
              initialDragData.current = null
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
import React from 'react'
import { Rect, Group, Text, Line } from 'react-konva'
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
}

export const TimelineZoomBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  introMs,
  outroMs,
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
  onOutroChange
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors()
  const handleSize = 12 // Bigger handles for easier grabbing

  // Calculate intro/outro widths as proportion of total width
  const totalDuration = endTime - startTime
  const introWidth = ((introMs || 0) / totalDuration) * width
  const outroWidth = ((outroMs || 0) / totalDuration) * width

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

  return (
    <Group
      x={x}
      y={y}
      draggable
      dragBoundFunc={dragBoundFunc}
      onDragEnd={(e) => onDragEnd(e.target.x())}
      onClick={onSelect}
      onTap={onSelect}
    >
      {/* Main zoom block */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={colors.zoomBlock}
        cornerRadius={6}
        opacity={isSelected ? 1 : 0.85}
        stroke={isSelected ? colors.foreground : undefined}
        strokeWidth={isSelected ? 2 : 0}
        shadowColor="black"
        shadowBlur={isSelected ? 8 : 2}
        shadowOpacity={0.3}
      />

      {/* Intro section (zoom in) */}
      <Rect
        x={0}
        y={0}
        width={introWidth}
        height={height}
        fill={colors.zoomBlockHover}
        cornerRadius={[6, 0, 0, 6]}
        opacity={0.8}
      />

      {/* Outro section (zoom out) */}
      <Rect
        x={width - outroWidth}
        y={0}
        width={outroWidth}
        height={height}
        fill={colors.zoomBlockHover}
        cornerRadius={[0, 6, 6, 0]}
        opacity={0.8}
      />

      {/* Zoom level indicator */}
      <Group x={10} y={height / 2 - 8}>
        <Rect
          x={0}
          y={0}
          width={30}
          height={16}
          fill={isSelected ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)"}
          cornerRadius={4}
        />
        <Text
          x={5}
          y={2}
          text={`${scale.toFixed(1)}x`}
          fontSize={isSelected ? 12 : 11}
          fill="white"
          fontFamily="system-ui"
          fontStyle={isSelected ? "bold" : "normal"}
        />
      </Group>

      {/* Auto label if applicable */}
      <Text
        x={width - 40}
        y={height / 2 - 6}
        text="Auto"
        fontSize={10}
        fill="rgba(255,255,255,0.8)"
        fontFamily="system-ui"
      />

      {/* Intro/outro duration indicators */}
      {isSelected && (
        <>
          {/* Intro handle */}
          <Line
            points={[introWidth, 0, introWidth, height]}
            stroke="white"
            strokeWidth={2}
            opacity={0.5}
            draggable
            dragBoundFunc={(pos) => ({
              x: Math.max(10, Math.min(width / 2, pos.x)),
              y: y
            })}
            onDragEnd={(e) => {
              const newIntroWidth = e.target.x()
              const newIntroMs = (newIntroWidth / width) * totalDuration
              onIntroChange(Math.round(newIntroMs))
            }}
          />

          {/* Outro handle */}
          <Line
            points={[width - outroWidth, 0, width - outroWidth, height]}
            stroke="white"
            strokeWidth={2}
            opacity={0.5}
            draggable
            dragBoundFunc={(pos) => ({
              x: Math.max(width / 2, Math.min(width - 10, pos.x)),
              y: y
            })}
            onDragEnd={(e) => {
              const newOutroWidth = width - e.target.x()
              const newOutroMs = (newOutroWidth / width) * totalDuration
              onOutroChange(Math.round(newOutroMs))
            }}
          />

          {/* Resize handles with full collision detection */}
          {/* Left handle */}
          <Rect
            x={-handleSize / 2}
            y={height / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={1}
            cornerRadius={2}
            cursor="ew-resize"
            draggable
            dragBoundFunc={(pos) => {
              // Find the maximum we can move left (minimum start time)
              let minStartTime = 0

              // Check for collision with other blocks to the left
              const sortedBlocks = allBlocks
                .filter(b => b.id !== blockId && b.endTime <= startTime)
                .sort((a, b) => b.endTime - a.endTime)

              if (sortedBlocks.length > 0) {
                // Can't move past the nearest block to the left
                minStartTime = sortedBlocks[0].endTime
              }

              // Calculate position constraints
              const minX = TimelineUtils.timeToPixel(minStartTime - startTime, pixelsPerMs) - handleSize / 2
              const maxX = width - TimelineUtils.timeToPixel(100, pixelsPerMs) - handleSize / 2 // Min 100ms duration

              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              const handleX = e.target.x() + handleSize / 2
              const deltaX = handleX - 0
              const newWidth = width - deltaX
              onResize(newWidth, 'left')
            }}
          />

          {/* Right handle */}
          <Rect
            x={width - handleSize / 2}
            y={height / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={1}
            cornerRadius={2}
            cursor="ew-resize"
            draggable
            dragBoundFunc={(pos) => {
              // Find the maximum we can extend right
              let maxEndTime = clipDuration

              // Check for collision with other blocks to the right
              const sortedBlocks = allBlocks
                .filter(b => b.id !== blockId && b.startTime >= endTime)
                .sort((a, b) => a.startTime - b.startTime)

              if (sortedBlocks.length > 0) {
                // Can't extend past the nearest block to the right
                maxEndTime = Math.min(maxEndTime, sortedBlocks[0].startTime)
              }

              // Calculate position constraints
              const minX = TimelineUtils.timeToPixel(100, pixelsPerMs) - handleSize / 2 // Min 100ms duration
              const maxX = TimelineUtils.timeToPixel(maxEndTime - startTime, pixelsPerMs) - handleSize / 2

              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + height / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              const handleX = e.target.x() + handleSize / 2
              const newWidth = handleX
              onResize(newWidth, 'right')
            }}
          />
        </>
      )}
    </Group>
  )
})
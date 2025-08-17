import React from 'react'
import { Rect, Group, Text, Line } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { createZoomBlockDragBoundFunc, ZoomBlockUtils, TimelineUtils } from '@/lib/timeline'

interface TimelineZoomBlockProps {
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
  introMs: number
  outroMs: number
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
  // Use the provided height prop instead of hardcoded value
  const blockHeight = height
  const handleSize = 8
  
  // Calculate intro/outro widths as proportion of total width
  const totalDuration = endTime - startTime
  const introWidth = (introMs / totalDuration) * width
  const outroWidth = (outroMs / totalDuration) * width
  
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
        height={blockHeight}
        fill="#7B5AFF"
        cornerRadius={8}
        opacity={isSelected ? 1 : 0.8}
        stroke={isSelected ? '#fff' : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
      
      {/* Intro section (zoom in) */}
      <Rect
        x={0}
        y={0}
        width={introWidth}
        height={blockHeight}
        fill="#6B4AEF"
        cornerRadius={[8, 0, 0, 8]}
        opacity={0.8}
      />
      
      {/* Outro section (zoom out) */}
      <Rect
        x={width - outroWidth}
        y={0}
        width={outroWidth}
        height={blockHeight}
        fill="#6B4AEF"
        cornerRadius={[0, 8, 8, 0]}
        opacity={0.8}
      />
      
      {/* Zoom level indicator */}
      <Group x={10} y={blockHeight / 2 - 8}>
        <Rect
          x={0}
          y={0}
          width={30}
          height={16}
          fill="rgba(0,0,0,0.3)"
          cornerRadius={4}
        />
        <Text
          x={5}
          y={2}
          text={`${scale.toFixed(1)}x`}
          fontSize={11}
          fill="white"
          fontFamily="system-ui"
        />
      </Group>
      
      {/* Auto label if applicable */}
      <Text
        x={width - 40}
        y={blockHeight / 2 - 6}
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
            points={[introWidth, 0, introWidth, blockHeight]}
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
            points={[width - outroWidth, 0, width - outroWidth, blockHeight]}
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
          
          {/* Resize handles with collision detection */}
          <Rect
            x={-handleSize / 2}
            y={blockHeight / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            cursor="ew-resize"
            draggable
            dragBoundFunc={(pos) => {
              // Get resize bounds with collision detection
              const bounds = ZoomBlockUtils.getResizeBounds(
                { id: blockId, startTime, endTime, introMs, outroMs, scale, targetX: 0.5, targetY: 0.5, mode: 'auto' },
                'left',
                allBlocks,
                clipDuration
              )
              const minX = clipX + TimelineUtils.timeToPixel(bounds.min - startTime, pixelsPerMs) - handleSize / 2
              const maxX = clipX + TimelineUtils.timeToPixel(bounds.max - startTime, pixelsPerMs) - handleSize / 2
              
              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + blockHeight / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              const deltaX = e.target.x() - (-handleSize / 2)
              const newWidth = width - deltaX
              // For left handle, we need to update both position and width
              onResize(newWidth, 'left')
            }}
          />
          
          <Rect
            x={width - handleSize / 2}
            y={blockHeight / 2 - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="white"
            cursor="ew-resize"
            draggable
            dragBoundFunc={(pos) => {
              // Get resize bounds with collision detection
              const bounds = ZoomBlockUtils.getResizeBounds(
                { id: blockId, startTime, endTime, introMs, outroMs, scale, targetX: 0.5, targetY: 0.5, mode: 'auto' },
                'right',
                allBlocks,
                clipDuration
              )
              const minX = TimelineUtils.timeToPixel(bounds.min - startTime, pixelsPerMs) - handleSize / 2
              const maxX = TimelineUtils.timeToPixel(bounds.max - startTime, pixelsPerMs) - handleSize / 2
              
              return {
                x: Math.max(minX, Math.min(maxX, pos.x)),
                y: y + blockHeight / 2 - handleSize / 2
              }
            }}
            onDragEnd={(e) => {
              const newWidth = e.target.x() + handleSize / 2
              onResize(newWidth, 'right')
            }}
          />
        </>
      )}
    </Group>
  )
})
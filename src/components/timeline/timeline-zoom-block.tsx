import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { TimelineUtils } from '@/lib/timeline'
import { useTimelineColors } from '@/lib/timeline/colors'
import Konva from 'konva'

interface TimelineZoomBlockProps {
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
  scale: number
  introMs?: number
  outroMs?: number
  isSelected: boolean
  allBlocks: ZoomBlock[]
  blockId: string
  clipX: number
  pixelsPerMs: number
  onSelect: () => void
  onDragEnd: (newX: number) => void
  onUpdate: (updates: Partial<ZoomBlock>) => void
}

export const TimelineZoomBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  scale,
  introMs = 500,
  outroMs = 500,
  isSelected,
  allBlocks,
  blockId,
  clipX,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onUpdate
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors()
  const [isDragging, setIsDragging] = useState(false)
  const [currentX, setCurrentX] = useState(x)
  const [currentWidth, setCurrentWidth] = useState(width)
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // Sync position and width when not dragging/resizing
  useEffect(() => {
    if (!isDragging) {
      setCurrentX(x)
      setCurrentWidth(width)
    }
  }, [x, width, isDragging])

  // Setup transformer
  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  // Get valid position for dragging
  const getValidDragPosition = (proposedX: number): number => {
    const gap = 5
    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: clipX + TimelineUtils.timeToPixel(b.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(b.endTime, pixelsPerMs)
      }))
      .sort((a, b) => a.x - b.x)

    // Check for collision
    for (const block of blocks) {
      if (proposedX < block.endX && (proposedX + width) > block.x) {
        // Collision detected - snap to the closer side
        const leftDistance = Math.abs(block.x - gap - width - proposedX)
        const rightDistance = Math.abs(block.endX + gap - proposedX)

        if (leftDistance < rightDistance) {
          return Math.max(clipX, block.x - width - gap)
        } else {
          return block.endX + gap
        }
      }
    }

    // Edge snapping (no collision)
    const snapThreshold = 10
    for (const block of blocks) {
      if (Math.abs(proposedX - (block.endX + gap)) < snapThreshold) {
        return block.endX + gap
      }
      if (Math.abs((proposedX + width) - (block.x - gap)) < snapThreshold) {
        return block.x - width - gap
      }
    }

    return Math.max(clipX, proposedX)
  }

  // Get valid size for resizing
  const getValidResizeWidth = (proposedWidth: number, x: number, resizingLeft: boolean): { width: number; x: number } => {
    const gap = 5
    const minWidth = TimelineUtils.timeToPixel(100, pixelsPerMs)
    let finalWidth = Math.max(minWidth, proposedWidth)
    let finalX = x

    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: clipX + TimelineUtils.timeToPixel(b.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(b.endTime, pixelsPerMs)
      }))

    // Check collision when resizing
    for (const block of blocks) {
      if (resizingLeft) {
        // Resizing from left edge
        if (finalX < block.endX && (finalX + finalWidth) > block.x) {
          if (finalX < block.endX && finalX > block.x) {
            // Limit resize at collision point
            finalX = block.endX + gap
            finalWidth = (x + width) - finalX
          }
        }
      } else {
        // Resizing from right edge
        const newEndX = x + finalWidth
        if (x < block.endX && newEndX > block.x) {
          if (newEndX > block.x && newEndX < block.endX) {
            // Limit resize at collision point
            finalWidth = block.x - x - gap
          }
        }
      }
    }

    return { width: Math.max(minWidth, finalWidth), x: finalX }
  }

  // Generate zoom curve visualization
  const generateZoomCurve = () => {
    const points: number[] = []
    const w = currentWidth // Use current width for real-time updates

    // Ensure we have valid dimensions
    if (!w || !height || isNaN(w) || isNaN(height)) {
      return points
    }

    const curveHeight = height - 20
    const curveY = height / 2

    // Calculate phase widths
    const introWidth = Math.min(TimelineUtils.timeToPixel(introMs, pixelsPerMs), w * 0.4)
    const outroWidth = Math.min(TimelineUtils.timeToPixel(outroMs, pixelsPerMs), w * 0.4)
    const plateauWidth = Math.max(0, w - introWidth - outroWidth)

    // Ensure valid widths
    if (isNaN(introWidth) || isNaN(outroWidth) || isNaN(plateauWidth)) {
      return points
    }

    const scaleHeight = Math.min((scale - 1) * 0.3, 0.8)
    const steps = 20

    // Intro
    for (let i = 0; i <= steps * 0.3; i++) {
      const t = i / (steps * 0.3)
      const easeT = t * t * (3 - 2 * t)
      points.push(introWidth * t)
      points.push(curveY - (curveHeight / 2) * easeT * scaleHeight)
    }

    // Plateau
    if (plateauWidth > 0) {
      for (let i = 0; i <= steps * 0.4; i++) {
        const t = i / (steps * 0.4)
        points.push(introWidth + plateauWidth * t)
        points.push(curveY - (curveHeight / 2) * scaleHeight)
      }
    }

    // Outro
    for (let i = 0; i <= steps * 0.3; i++) {
      const t = i / (steps * 0.3)
      const easeT = 1 - (1 - t) * (1 - t) * (3 - 2 * (1 - t))
      points.push(introWidth + plateauWidth + outroWidth * t)
      points.push(curveY - (curveHeight / 2) * (1 - easeT) * scaleHeight)
    }

    return points
  }

  const curvePoints = generateZoomCurve()

  return (
    <>
      <Group
        ref={groupRef}
        x={currentX}
        y={y}
        draggable
        dragBoundFunc={(pos) => {
          const validX = getValidDragPosition(pos.x)
          setCurrentX(validX)
          return { x: validX, y: y }
        }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(e) => {
          setIsDragging(false)
          const finalX = e.target.x()
          const newStartTime = TimelineUtils.pixelToTime(finalX - clipX, pixelsPerMs)
          const duration = endTime - startTime

          onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: newStartTime + duration
          })

          onDragEnd(finalX)
        }}
        onClick={onSelect}
      >
        <Rect
          x={0}
          y={0}
          width={currentWidth}
          height={height}
          fill={colors.zoomBlock || 'rgba(147, 51, 234, 0.85)'}
          cornerRadius={4}
          opacity={isDragging ? 0.7 : (isSelected ? 0.95 : 0.85)}
          stroke={isSelected ? colors.primary : undefined}
          strokeWidth={isSelected ? 1.5 : 0}
          shadowColor="black"
          shadowBlur={isSelected ? 6 : 2}
          shadowOpacity={0.2}
          shadowOffsetY={1}
        />

        {/* Zoom curve visualization */}
        {curvePoints.length > 0 && (
          <>
            <Line
              points={curvePoints}
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />

            <Line
              points={[
                ...curvePoints,
                currentWidth, height / 2,
                0, height / 2
              ]}
              fill="rgba(255, 255, 255, 0.15)"
              closed={true}
              listening={false}
            />
          </>
        )}

        <Text
          x={8}
          y={6}
          text={`${scale.toFixed(1)}×`}
          fontSize={11}
          fill="white"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display'"
          fontStyle={isSelected ? "500" : "normal"}
          shadowColor="black"
          shadowBlur={2}
          shadowOpacity={0.3}
          listening={false}
        />
      </Group>

      {/* Transformer outside of group to avoid parent-child error */}
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            // Determine which side is being resized
            const resizingLeft = newBox.x !== oldBox.x
            const currentPos = currentX
            
            // Get valid resize dimensions
            const valid = getValidResizeWidth(newBox.width, resizingLeft ? newBox.x : currentPos, resizingLeft)
            
            newBox.width = valid.width
            newBox.x = resizingLeft ? valid.x : currentPos
            newBox.height = oldBox.height
            
            // Update width state for real-time preview
            setCurrentWidth(valid.width)
            if (resizingLeft) {
              setCurrentX(valid.x)
            }

            return newBox
          }}
          borderStroke={colors.primary || '#6366f1'}
          borderStrokeWidth={1}
          anchorFill="white"
          anchorStroke={colors.primary || '#6366f1'}
          anchorStrokeWidth={1}
          anchorSize={10}
          anchorCornerRadius={2}
          onTransformEnd={(e) => {
            const node = groupRef.current
            if (!node) return

            // The width and position are already updated via boundBoxFunc
            const finalWidth = currentWidth
            const finalX = currentX

            // Calculate new times
            const newStartTime = TimelineUtils.pixelToTime(finalX - clipX, pixelsPerMs)
            const newEndTime = newStartTime + TimelineUtils.pixelToTime(finalWidth, pixelsPerMs)

            onUpdate({
              startTime: Math.max(0, newStartTime),
              endTime: newEndTime
            })
          }}
        />
      )}
    </>
  )
})

TimelineZoomBlock.displayName = 'TimelineZoomBlock'
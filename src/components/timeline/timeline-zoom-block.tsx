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
  const shapeRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  // Helper function to check if a position overlaps with any other blocks
  const checkOverlap = (x: number, width: number, excludeId: string = blockId): boolean => {
    for (const block of allBlocks.filter(b => b.id !== excludeId)) {
      const blockX = clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)
      const blockWidth = TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)
      const blockEndX = blockX + blockWidth
      
      if (x < blockEndX && (x + width) > blockX) {
        return true
      }
    }
    return false
  }

  // Helper function to find the next available position
  const findNextAvailablePosition = (x: number, width: number, direction: 'left' | 'right'): number => {
    const gap = 5
    let candidateX = x
    
    // Get all block positions sorted by x position
    const blockPositions = allBlocks
      .filter(b => b.id !== blockId)
      .map(block => ({
        x: clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(block.endTime, pixelsPerMs)
      }))
      .sort((a, b) => a.x - b.x)
    
    if (direction === 'right') {
      // Find the first available position to the right
      for (const block of blockPositions) {
        if (block.x >= candidateX) {
          candidateX = block.endX + gap
          if (!checkOverlap(candidateX, width)) {
            return candidateX
          }
        }
      }
    } else {
      // Find the first available position to the left
      for (let i = blockPositions.length - 1; i >= 0; i--) {
        const block = blockPositions[i]
        if (block.endX <= candidateX + width) {
          candidateX = block.x - width - gap
          if (!checkOverlap(candidateX, width)) {
            return Math.max(clipX, candidateX)
          }
        }
      }
    }
    
    return candidateX
  }

  // Calculate snap positions and prevent overlaps
  const getSnappedPosition = (proposedX: number, proposedWidth: number, isResizing: boolean = false) => {
    let finalX = proposedX
    let finalWidth = proposedWidth
    const snapThreshold = 10
    const gap = 5
    const minWidth = TimelineUtils.timeToPixel(100, pixelsPerMs)

    if (checkOverlap(proposedX, proposedWidth)) {
      if (isResizing) {
        // When resizing, stop at the edge
        const resizingRight = proposedWidth > TimelineUtils.timeToPixel(endTime - startTime, pixelsPerMs)
        
        for (const block of allBlocks.filter(b => b.id !== blockId)) {
          const blockX = clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)
          const blockWidth = TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)
          const blockEndX = blockX + blockWidth
          
          if (proposedX < blockEndX && (proposedX + proposedWidth) > blockX) {
            if (resizingRight) {
              finalWidth = Math.max(blockX - proposedX - gap, minWidth)
            } else {
              finalX = blockEndX + gap
              finalWidth = Math.max(proposedWidth, minWidth)
            }
            break
          }
        }
      } else {
        // When dragging, find nearest available position
        const currentX = clipX + TimelineUtils.timeToPixel(startTime, pixelsPerMs)
        const direction = proposedX > currentX ? 'right' : 'left'
        finalX = findNextAvailablePosition(proposedX, width, direction)
      }
    } else {
      // Try snapping to edges
      for (const block of allBlocks.filter(b => b.id !== blockId)) {
        const blockX = clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)
        const blockWidth = TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)
        const blockEndX = blockX + blockWidth
        
        if (Math.abs(proposedX - blockEndX) < snapThreshold) {
          const snappedX = blockEndX + gap
          if (!checkOverlap(snappedX, finalWidth)) {
            finalX = snappedX
          }
        } else if (Math.abs((proposedX + proposedWidth) - blockX) < snapThreshold) {
          if (isResizing) {
            const snappedWidth = blockX - proposedX - gap
            if (!checkOverlap(proposedX, snappedWidth)) {
              finalWidth = snappedWidth
            }
          } else {
            const snappedX = blockX - proposedWidth - gap
            if (!checkOverlap(snappedX, proposedWidth)) {
              finalX = snappedX
            }
          }
        }
      }
    }

    // Apply constraints
    finalX = Math.max(clipX, finalX)
    finalWidth = Math.max(minWidth, finalWidth)

    // Final safety check
    if (checkOverlap(finalX, finalWidth)) {
      const direction = finalX > (clipX + TimelineUtils.timeToPixel(startTime, pixelsPerMs)) ? 'right' : 'left'
      finalX = findNextAvailablePosition(finalX, finalWidth, direction)
    }

    return { x: finalX, width: finalWidth }
  }

  // Generate points for the zoom curve visualization
  const generateZoomCurve = () => {
    const points: number[] = []
    const curveHeight = height - 20
    const curveY = y + height / 2
    
    // Calculate widths based on intro/outro durations
    const introWidth = Math.min(TimelineUtils.timeToPixel(introMs, pixelsPerMs), width * 0.4)
    const outroWidth = Math.min(TimelineUtils.timeToPixel(outroMs, pixelsPerMs), width * 0.4)
    const plateauWidth = Math.max(width * 0.2, width - introWidth - outroWidth)
    
    const steps = 30
    const scaleHeight = Math.min((scale - 1) * 0.3, 0.8)
    
    // Intro curve
    const introSteps = Math.floor(steps * (introWidth / width))
    for (let i = 0; i <= introSteps; i++) {
      const t = i / introSteps
      const easeT = t * t * (3 - 2 * t)
      points.push(x + introWidth * t)
      points.push(curveY - (curveHeight / 2) * easeT * scaleHeight)
    }
    
    // Plateau
    const plateauSteps = Math.floor(steps * (plateauWidth / width))
    for (let i = 0; i <= plateauSteps; i++) {
      const t = i / plateauSteps
      points.push(x + introWidth + plateauWidth * t)
      points.push(curveY - (curveHeight / 2) * scaleHeight)
    }
    
    // Outro curve
    const outroSteps = Math.floor(steps * (outroWidth / width))
    for (let i = 0; i <= outroSteps; i++) {
      const t = i / outroSteps
      const easeT = 1 - (1 - t) * (1 - t) * (3 - 2 * (1 - t))
      points.push(x + introWidth + plateauWidth + outroWidth * t)
      points.push(curveY - (curveHeight / 2) * (1 - easeT) * scaleHeight)
    }
    
    return points
  }

  return (
    <Group>
      <Rect
        ref={shapeRef}
        x={x}
        y={y}
        width={width}
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
        draggable
        dragBoundFunc={(pos) => {
          const snapped = getSnappedPosition(pos.x, width, false)
          return {
            x: snapped.x,
            y: y
          }
        }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(e) => {
          setIsDragging(false)
          const newX = e.target.x()
          const newStartTime = TimelineUtils.pixelToTime(newX - clipX, pixelsPerMs)
          const duration = endTime - startTime

          onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: newStartTime + duration
          })

          onDragEnd(newX)
        }}
        onClick={onSelect}
        onTransformEnd={(e) => {
          const node = e.target
          const scaleX = node.scaleX()
          const newWidth = Math.max(TimelineUtils.timeToPixel(100, pixelsPerMs), width * scaleX)
          const newX = node.x()

          // Reset scale
          node.scaleX(1)
          node.scaleY(1)

          // Apply snapping
          const snapped = getSnappedPosition(newX, newWidth, true)
          node.width(snapped.width)
          node.x(snapped.x)

          // Calculate new times
          const newStartTime = TimelineUtils.pixelToTime(snapped.x - clipX, pixelsPerMs)
          const newEndTime = newStartTime + TimelineUtils.pixelToTime(snapped.width, pixelsPerMs)

          onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: newEndTime
          })
        }}
      />

      {/* Zoom curve visualization */}
      <Line
        points={generateZoomCurve()}
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth={1.5}
        lineCap="round"
        lineJoin="round"
        listening={false}
        dash={[2, 2]}
      />

      {/* Filled area under curve */}
      <Line
        points={[
          ...generateZoomCurve(),
          x + width, y + height / 2, // End at baseline
          x, y + height / 2 // Back to start at baseline
        ]}
        fill="rgba(255, 255, 255, 0.08)"
        closed={true}
        listening={false}
      />

      {/* Zoom level text */}
      <Text
        x={x + 8}
        y={y + 6}
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

      {/* Transformer for resizing */}
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            // Only limit minimum width
            const minWidth = TimelineUtils.timeToPixel(100, pixelsPerMs)

            if (newBox.width < minWidth) {
              newBox.width = minWidth
            }

            // Keep height fixed
            newBox.height = oldBox.height

            // Apply snapping
            const snapped = getSnappedPosition(newBox.x, newBox.width, true)
            newBox.x = snapped.x
            newBox.width = snapped.width

            return newBox
          }}
          borderStroke={colors.primary || '#6366f1'}
          borderStrokeWidth={1}
          anchorFill="white"
          anchorStroke={colors.primary || '#6366f1'}
          anchorStrokeWidth={1}
          anchorSize={10}
          anchorCornerRadius={2}
        />
      )}
    </Group>
  )
})

TimelineZoomBlock.displayName = 'TimelineZoomBlock'
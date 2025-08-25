import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer } from 'react-konva'
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
  isSelected: boolean
  allBlocks: ZoomBlock[]
  blockId: string
  clipX: number
  clipDuration: number
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
  isSelected,
  allBlocks,
  blockId,
  clipX,
  clipDuration,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onUpdate
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors()
  const [isDragging, setIsDragging] = useState(false)
  const shapeRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // Attach transformer when selected
  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      // Attach transformer
      trRef.current.nodes([shapeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  // Calculate snap positions based on other blocks
  const getSnappedPosition = (proposedX: number, proposedWidth: number) => {
    const proposedStartTime = TimelineUtils.pixelToTime(proposedX - clipX, pixelsPerMs)
    const proposedEndTime = proposedStartTime + TimelineUtils.pixelToTime(proposedWidth, pixelsPerMs)

    let finalX = proposedX
    let finalWidth = proposedWidth
    const snapThreshold = 10 // pixels

    // First check for overlaps and prevent them
    for (const block of allBlocks) {
      if (block.id === blockId) continue

      const blockX = clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)
      const blockWidth = TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)
      const blockEndX = blockX + blockWidth

      // Check if there would be an overlap
      const wouldOverlap = proposedStartTime < block.endTime && proposedEndTime > block.startTime

      if (wouldOverlap) {
        // Determine which side to snap to based on movement direction
        const currentX = clipX + TimelineUtils.timeToPixel(startTime, pixelsPerMs)
        const movingRight = proposedX > currentX
        
        if (movingRight) {
          // Moving right, snap to right edge of the blocking block
          finalX = blockEndX
        } else {
          // Moving left or resizing, snap to left edge of the blocking block
          const maxAllowedEndX = blockX
          const maxAllowedWidth = maxAllowedEndX - proposedX
          if (maxAllowedWidth > 0) {
            finalWidth = Math.min(finalWidth, maxAllowedWidth)
          } else {
            // Can't place here at all
            finalX = Math.max(clipX, blockEndX)
          }
        }
      } else {
        // No overlap, check for snapping to edges
        if (Math.abs((proposedX + proposedWidth) - blockX) < snapThreshold) {
          // Snap right edge to left edge of block
          finalWidth = blockX - proposedX
        } else if (Math.abs(proposedX - blockEndX) < snapThreshold) {
          // Snap left edge to right edge of block
          finalX = blockEndX
        }
      }
    }

    // Clip bounds
    finalX = Math.max(clipX, finalX)
    const maxX = clipX + TimelineUtils.timeToPixel(clipDuration, pixelsPerMs) - finalWidth
    finalX = Math.min(maxX, finalX)

    // Ensure minimum width
    finalWidth = Math.max(TimelineUtils.timeToPixel(100, pixelsPerMs), finalWidth)

    return { x: finalX, width: finalWidth }
  }

  return (
    <>
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
          const snapped = getSnappedPosition(pos.x, width)
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
            endTime: Math.min(clipDuration, newStartTime + duration)
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
          const snapped = getSnappedPosition(newX, newWidth)
          node.width(snapped.width)
          node.x(snapped.x)

          // Calculate new times
          const newStartTime = TimelineUtils.pixelToTime(snapped.x - clipX, pixelsPerMs)
          const newEndTime = newStartTime + TimelineUtils.pixelToTime(snapped.width, pixelsPerMs)

          onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: Math.min(clipDuration, newEndTime)
          })
        }}
      />

      {/* Zoom level text */}
      <Text
        x={x + 8}
        y={y + height / 2 - 7}
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
            // Limit min/max width
            const minWidth = TimelineUtils.timeToPixel(100, pixelsPerMs)
            const maxWidth = TimelineUtils.timeToPixel(clipDuration, pixelsPerMs)

            if (newBox.width < minWidth) {
              newBox.width = minWidth
            }
            if (newBox.width > maxWidth) {
              newBox.width = maxWidth
            }

            // Keep height fixed
            newBox.height = oldBox.height

            // Apply collision detection
            const snapped = getSnappedPosition(newBox.x, newBox.width)
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
    </>
  )
})

TimelineZoomBlock.displayName = 'TimelineZoomBlock'
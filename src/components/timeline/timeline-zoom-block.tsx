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
  const [dragX, setDragX] = useState(x)
  const [resizeWidth, setResizeWidth] = useState(width)
  const [resizeX, setResizeX] = useState(x)
  const [isOverlapping, setIsOverlapping] = useState(false)
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)
  
  // Update local state when props change
  useEffect(() => {
    if (!isDragging) {
      setDragX(x)
      setResizeX(x)
      setResizeWidth(width)
      // Force group position update
      if (groupRef.current && groupRef.current.x() !== x) {
        groupRef.current.x(x)
        groupRef.current.getLayer()?.batchDraw()
      }
    }
  }, [x, width, isDragging])

  // Check for overlaps
  useEffect(() => {
    const checkOverlap = () => {
      const blocks = allBlocks
        .filter(b => b.id !== blockId)
        .map(b => ({
          x: clipX + TimelineUtils.timeToPixel(b.startTime, pixelsPerMs),
          endX: clipX + TimelineUtils.timeToPixel(b.endTime, pixelsPerMs)
        }))

      const currentX = isDragging ? dragX : x
      const currentWidth = isDragging ? width : resizeWidth
      const blockEnd = currentX + currentWidth
      const hasOverlap = blocks.some(block =>
        (currentX < block.endX && blockEnd > block.x)
      )

      setIsOverlapping(hasOverlap)
    }

    checkOverlap()
  }, [x, width, dragX, resizeWidth, isDragging, allBlocks, blockId, clipX, pixelsPerMs])

  // Setup transformer when selected
  useEffect(() => {
    if (isSelected) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        if (trRef.current && groupRef.current) {
          try {
            trRef.current.nodes([groupRef.current])
            trRef.current.forceUpdate()
            groupRef.current.moveToTop()
            const layer = trRef.current.getLayer()
            if (layer) {
              layer.batchDraw()
            }
          } catch (e) {
            console.warn('Transformer update failed:', e)
          }
        }
      }, 10)
      return () => clearTimeout(timer)
    } else if (trRef.current) {
      // Detach transformer when not selected
      trRef.current.nodes([])
    }
  }, [isSelected])

  // Get valid position for dragging with improved edge snapping
  const getValidDragPosition = (proposedX: number): number => {
    const snapThreshold = 10
    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: clipX + TimelineUtils.timeToPixel(b.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(b.endTime, pixelsPerMs)
      }))
      .sort((a, b) => a.x - b.x) // Sort blocks by position for predictable snapping

    // Use the prop width for consistent snapping
    const blockWidth = width

    // Try to find the best snap position
    let bestSnapX = proposedX
    let minSnapDistance = snapThreshold

    for (const block of blocks) {
      // Snap left edge to other block's left edge
      const leftToLeftDistance = Math.abs(proposedX - block.x)
      if (leftToLeftDistance < minSnapDistance) {
        minSnapDistance = leftToLeftDistance
        bestSnapX = block.x
      }

      // Snap left edge to other block's right edge
      const leftToRightDistance = Math.abs(proposedX - block.endX)
      if (leftToRightDistance < minSnapDistance) {
        minSnapDistance = leftToRightDistance
        bestSnapX = block.endX
      }

      // Snap right edge to other block's left edge
      const rightToLeftDistance = Math.abs((proposedX + blockWidth) - block.x)
      if (rightToLeftDistance < minSnapDistance) {
        minSnapDistance = rightToLeftDistance
        bestSnapX = block.x - blockWidth
      }

      // Snap right edge to other block's right edge
      const rightToRightDistance = Math.abs((proposedX + blockWidth) - block.endX)
      if (rightToRightDistance < minSnapDistance) {
        minSnapDistance = rightToRightDistance
        bestSnapX = block.endX - blockWidth
      }
    }

    // Ensure we don't go past the clip boundary
    return Math.max(clipX, bestSnapX)
  }

  // Resize validation with collision detection and edge snapping
  const getValidResizeWidth = (proposedWidth: number, proposedX: number, isResizingLeft: boolean): { width: number; x: number } => {
    const minWidth = TimelineUtils.timeToPixel(100, pixelsPerMs)
    const snapThreshold = 10

    let finalWidth = Math.max(minWidth, proposedWidth)
    let finalX = proposedX

    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: clipX + TimelineUtils.timeToPixel(b.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(b.endTime, pixelsPerMs),
        startTime: b.startTime,
        endTime: b.endTime
      }))
      .sort((a, b) => a.x - b.x)

    // Handle collision detection and snapping based on resize direction
    if (isResizingLeft) {
      // Store the original right edge position using current props
      const rightEdge = x + width
      
      // Check for collisions when resizing left
      for (const block of blocks) {
        // If we're moving left edge past another block's right edge (collision)
        if (finalX < block.endX && rightEdge > block.endX) {
          // Prevent overlap by limiting how far left we can go
          finalX = Math.max(finalX, block.endX + 1)
        }
      }

      // Apply snapping after collision check
      for (const block of blocks) {
        const distToBlockStart = Math.abs(finalX - block.x)
        const distToBlockEnd = Math.abs(finalX - block.endX)
        
        // Only snap if we're not creating an overlap
        if (distToBlockEnd < snapThreshold && finalX >= block.endX) {
          finalX = block.endX
        } else if (distToBlockStart < snapThreshold && finalX >= block.endX) {
          finalX = block.x
        }
      }

      // Ensure we don't go past the clip boundary
      finalX = Math.max(clipX, finalX)

      // Recalculate width to maintain the right edge position
      finalWidth = rightEdge - finalX

      // Ensure minimum width
      if (finalWidth < minWidth) {
        finalWidth = minWidth
        finalX = rightEdge - minWidth
      }

      // Final boundary check
      finalX = Math.max(clipX, finalX)
    } else {
      // Resizing from right
      const leftEdge = finalX
      let rightEdge = finalX + finalWidth
      
      // Check for collisions when resizing right
      for (const block of blocks) {
        // If we're moving right edge past another block's left edge (collision)
        if (rightEdge > block.x && leftEdge < block.x) {
          // Prevent overlap by limiting how far right we can go
          rightEdge = Math.min(rightEdge, block.x - 1)
          finalWidth = rightEdge - finalX
        }
      }
      
      // Apply snapping after collision check
      for (const block of blocks) {
        const currentRightEdge = finalX + finalWidth
        const distToBlockStart = Math.abs(currentRightEdge - block.x)
        const distToBlockEnd = Math.abs(currentRightEdge - block.endX)
        
        // Only snap if we're not creating an overlap
        if (distToBlockStart < snapThreshold && currentRightEdge <= block.x) {
          finalWidth = block.x - finalX
        } else if (distToBlockEnd < snapThreshold && currentRightEdge <= block.x) {
          finalWidth = block.endX - finalX
        }
      }
      
      finalWidth = Math.max(minWidth, finalWidth)
    }

    return { width: finalWidth, x: finalX }
  }

  // Generate zoom curve visualization
  const generateZoomCurve = () => {
    const points: number[] = []
    const w = resizeWidth // Use current resize width

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
        x={dragX}
        y={y}
        draggable
        dragBoundFunc={(pos) => {
          // Allow dragging but track position
          const constrainedX = Math.max(clipX, pos.x)
          setDragX(constrainedX)
          return {
            x: constrainedX,
            y: y
          }
        }}
        onDragStart={() => {
          setIsDragging(true)
          onSelect()
        }}
        onDragEnd={(e) => {
          console.log('[ZoomBlock] Drag end - blockId:', blockId, 'isDragging:', isDragging)
          setIsDragging(false)
          const draggedX = e.target.x()

          // Apply snapping
          const snappedX = getValidDragPosition(draggedX)
          console.log('[ZoomBlock] Positions - dragged:', draggedX, 'snapped:', snappedX, 'original:', x)

          // Check for collision at the snapped position
          const newStartTime = TimelineUtils.pixelToTime(snappedX - clipX, pixelsPerMs)
          const duration = endTime - startTime
          const newEndTime = newStartTime + duration
          
          // Check if this would cause an overlap
          const wouldOverlap = allBlocks
            .filter(b => b.id !== blockId)
            .some(block => {
              const overlaps = (newStartTime < block.endTime && newEndTime > block.startTime)
              if (overlaps) {
                console.log('[ZoomBlock] Overlap detected with block:', block.id)
              }
              return overlaps
            })

          console.log('[ZoomBlock] Would overlap?', wouldOverlap)

          if (wouldOverlap) {
            // Reset to original position
            console.log('[ZoomBlock] Resetting to original position:', x)
            setDragX(x)
            setResizeX(x)
            if (groupRef.current) {
              groupRef.current.x(x)
              // Force re-render to ensure the group position is updated
              groupRef.current.getLayer()?.batchDraw()
            }
            // Maintain selection after reset
            onSelect()
          } else {
            // Accept the new position
            console.log('[ZoomBlock] Accepting new position:', snappedX)
            setDragX(snappedX)
            
            // Update position
            onUpdate({
              startTime: Math.max(0, newStartTime),
              endTime: Math.max(0, newEndTime)
            })
            
            onDragEnd(snappedX)
          }
        }}
        onClick={(e) => {
          e.cancelBubble = true
          console.log('[ZoomBlock] Click - blockId:', blockId, 'isSelected:', isSelected)
          // Always ensure selection on click
          if (!isDragging) {
            onSelect()
          }
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
          console.log('[ZoomBlock] MouseDown - blockId:', blockId, 'selecting...')
          // Select immediately on mousedown for better responsiveness
          onSelect()
        }}
        listening={true}
      >
        <Rect
          x={0}
          y={0}
          width={resizeWidth}
          height={height}
          fill={isOverlapping && !isSelected ? 'rgba(239, 68, 68, 0.85)' : (colors.zoomBlock || 'rgba(147, 51, 234, 0.85)')}
          cornerRadius={4}
          opacity={isDragging ? 0.7 : (isSelected ? 0.95 : 0.85)}
          stroke={isSelected ? colors.primary : (isOverlapping ? 'rgba(239, 68, 68, 1)' : undefined)}
          strokeWidth={isSelected ? 1.5 : (isOverlapping ? 1 : 0)}
          shadowColor="black"
          shadowBlur={isSelected ? 6 : 2}
          shadowOpacity={0.2}
          shadowOffsetY={1}
          listening={true}
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
                resizeWidth, height / 2,
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
          key={`transformer-${blockId}`}
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            // Determine which side is being resized
            const resizingLeft = newBox.x !== oldBox.x

            // Get valid resize dimensions
            const valid = getValidResizeWidth(
              newBox.width,
              resizingLeft ? newBox.x : resizeX,
              resizingLeft
            )

            // Update state for real-time preview
            setResizeWidth(valid.width)
            setResizeX(valid.x)

            newBox.width = valid.width
            newBox.x = valid.x
            newBox.height = oldBox.height

            return newBox
          }}
          borderStroke={colors.primary || '#6366f1'}
          borderStrokeWidth={1}
          anchorFill="white"
          anchorStroke={colors.primary || '#6366f1'}
          anchorStrokeWidth={1}
          anchorSize={10}
          anchorCornerRadius={2}
          keepRatio={false}
          ignoreStroke={true}
          onTransformEnd={() => {
            // Use the resize state for final values
            const finalWidth = resizeWidth
            const finalX = resizeX

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
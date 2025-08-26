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
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  // Sync dragX with x when not dragging
  useEffect(() => {
    if (!isDragging) setDragX(x)
  }, [x, isDragging])

  // Check if position overlaps with other blocks
  const checkOverlap = (x: number, width: number): boolean => {
    return allBlocks.some(block => {
      if (block.id === blockId) return false
      const blockX = clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs)
      const blockEndX = blockX + TimelineUtils.timeToPixel(block.endTime - block.startTime, pixelsPerMs)
      return x < blockEndX && (x + width) > blockX
    })
  }

  // Find next available position within reasonable distance
  const findNextAvailablePosition = (proposedX: number, width: number, direction: 'left' | 'right'): number | null => {
    const gap = 5
    const maxDistance = TimelineUtils.timeToPixel(1500, pixelsPerMs)
    const currentX = clipX + TimelineUtils.timeToPixel(startTime, pixelsPerMs)

    const blockPositions = allBlocks
      .filter(b => b.id !== blockId)
      .map(block => ({
        x: clipX + TimelineUtils.timeToPixel(block.startTime, pixelsPerMs),
        endX: clipX + TimelineUtils.timeToPixel(block.endTime, pixelsPerMs)
      }))
      .sort((a, b) => a.x - b.x)

    for (const block of (direction === 'right' ? blockPositions : [...blockPositions].reverse())) {
      const candidateX = direction === 'right' 
        ? (block.x >= proposedX ? block.endX + gap : null)
        : (block.endX <= proposedX + width ? block.x - width - gap : null)
      
      if (candidateX !== null) {
        if (Math.abs(candidateX - currentX) > maxDistance) return null
        if (!checkOverlap(candidateX, width)) {
          return direction === 'left' ? Math.max(clipX, candidateX) : candidateX
        }
      }
    }

    return null
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
        const nextPosition = findNextAvailablePosition(proposedX, width, direction)
        // If no suitable position found (too far), keep current position
        finalX = nextPosition !== null ? nextPosition : currentX
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
      const currentX = clipX + TimelineUtils.timeToPixel(startTime, pixelsPerMs)
      const direction = finalX > currentX ? 'right' : 'left'
      const safePosition = findNextAvailablePosition(finalX, finalWidth, direction)
      finalX = safePosition !== null ? safePosition : currentX
    }

    return { x: finalX, width: finalWidth }
  }

  // Generate points for the zoom curve visualization (relative to group)
  const generateZoomCurve = () => {
    const points: number[] = []
    const curveHeight = height - 20
    const curveY = height / 2

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
      points.push(introWidth * t)
      points.push(curveY - (curveHeight / 2) * easeT * scaleHeight)
    }

    // Plateau
    const plateauSteps = Math.floor(steps * (plateauWidth / width))
    for (let i = 0; i <= plateauSteps; i++) {
      const t = i / plateauSteps
      points.push(introWidth + plateauWidth * t)
      points.push(curveY - (curveHeight / 2) * scaleHeight)
    }

    // Outro curve
    const outroSteps = Math.floor(steps * (outroWidth / width))
    for (let i = 0; i <= outroSteps; i++) {
      const t = i / outroSteps
      const easeT = 1 - (1 - t) * (1 - t) * (3 - 2 * (1 - t))
      points.push(introWidth + plateauWidth + outroWidth * t)
      points.push(curveY - (curveHeight / 2) * (1 - easeT) * scaleHeight)
    }

    return points
  }

  return (
    <Group
      ref={groupRef}
      x={isDragging ? dragX : x}
      y={y}
      draggable
      dragBoundFunc={(pos) => {
        const snapped = getSnappedPosition(pos.x, width, false)
        // Update dragX for real-time visualization updates
        setDragX(snapped.x)
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
        setDragX(newX)
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
    >
      <Rect
        x={0}
        y={0}
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
      />

      {/* Zoom curve visualization - solid line */}
      <Line
        points={generateZoomCurve()}
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth={2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      {/* Filled area under curve */}
      <Line
        points={[
          ...generateZoomCurve(),
          width, height / 2, // End at baseline
          0, height / 2 // Back to start at baseline
        ]}
        fill="rgba(255, 255, 255, 0.15)"
        closed={true}
        listening={false}
      />

      {/* Zoom level text */}
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
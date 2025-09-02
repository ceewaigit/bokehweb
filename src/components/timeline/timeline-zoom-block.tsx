import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-converter'
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
  isEnabled?: boolean
  allBlocks: ZoomBlock[]
  blockId: string
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
  isEnabled = true,
  allBlocks,
  blockId,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onUpdate
}: TimelineZoomBlockProps) => {
  const colors = useTimelineColors()
  const [isDragging, setIsDragging] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // No local position state - use props directly
  // This makes the component fully controlled and eliminates sync issues

  // Setup transformer when selected
  useEffect(() => {
    if (isSelected && rectRef.current && trRef.current) {
      // Attach transformer to the rect (not the group)
      trRef.current.nodes([rectRef.current])
      trRef.current.forceUpdate()
      
      // Move group to top for better interaction
      if (groupRef.current) {
        groupRef.current.moveToTop()
        const layer = groupRef.current.getLayer()
        if (layer) {
          layer.batchDraw()
        }
      }
    } else if (trRef.current) {
      // Detach transformer when not selected
      trRef.current.nodes([])
      trRef.current.forceUpdate()
    }
  }, [isSelected])

  // Get valid position for dragging with improved edge snapping
  const getValidDragPosition = (proposedX: number, currentWidth: number): number => {
    const snapThreshold = Number(TimelineConfig.SNAP_THRESHOLD_PX)
    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: TimeConverter.msToPixels(b.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH,
        endX: TimeConverter.msToPixels(b.endTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
      }))
      .sort((a, b) => a.x - b.x) // Sort blocks by position for predictable snapping

    // Use the provided width for consistent snapping
    const blockWidth = currentWidth

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

    // Ensure we don't go past the timeline start (after track label)
    return Math.max(TimelineConfig.TRACK_LABEL_WIDTH, bestSnapX)
  }

  // Generate zoom curve visualization
  const generateZoomCurve = () => {
    const points: number[] = []
    const w = width // Use prop width directly

    // Ensure we have valid dimensions
    if (!w || !height || isNaN(w) || isNaN(height)) {
      return points
    }

    const curveHeight = height - 20
    const curveY = height / 2

    // Calculate phase widths
    const introWidth = Math.min(TimeConverter.msToPixels(introMs, pixelsPerMs), w * 0.4)
    const outroWidth = Math.min(TimeConverter.msToPixels(outroMs, pixelsPerMs), w * 0.4)
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
        x={x}
        y={y}
        draggable={!isTransforming}
        dragBoundFunc={(pos) => {
          // Allow dragging but constrain to timeline boundaries
          const constrainedX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, pos.x)
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
          setIsDragging(false)
          const draggedX = e.target.x()

          // Apply snapping
          const snappedX = getValidDragPosition(draggedX, width)

          // Check for collision at the snapped position
          const newStartTime = TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          const duration = endTime - startTime
          const newEndTime = newStartTime + duration

          // Check if this would cause an overlap
          const wouldOverlap = allBlocks
            .filter(b => b.id !== blockId)
            .some(block => (newStartTime < block.endTime && newEndTime > block.startTime))

          if (wouldOverlap) {
            // Reset to original position
            if (groupRef.current) {
              groupRef.current.x(x)
              // Force re-render to ensure the group position is updated
              groupRef.current.getLayer()?.batchDraw()
            }
            // Maintain selection after reset
            onSelect()
          } else {

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
          // Always ensure selection on click
          if (!isDragging) {
            onSelect()
          }
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
          // Select immediately on mousedown for better responsiveness
          onSelect()
        }}
        listening={true}
      >
        <Rect
          ref={rectRef}
          x={0}
          y={0}
          width={width}
          height={height}
          fill={colors.zoomBlock || 'rgba(147, 51, 234, 0.85)'}
          cornerRadius={4}
          opacity={!isEnabled ? 0.3 : (isDragging ? 0.7 : (isSelected ? 0.95 : 0.85))}
          stroke={isSelected ? colors.primary : undefined}
          strokeWidth={isSelected ? 1.5 : 0}
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
              stroke={!isEnabled ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.6)"}
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />

            <Line
              points={[
                ...curvePoints,
                width, height / 2,
                0, height / 2
              ]}
              fill={!isEnabled ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.15)"}
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
          fill={!isEnabled ? "rgba(255, 255, 255, 0.4)" : "white"}
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
            // Ensure minimum width
            const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
            
            // Constrain width
            if (newBox.width < minWidthPx) {
              newBox.width = minWidthPx
            }
            
            // Calculate absolute position of the rect
            const groupX = groupRef.current ? groupRef.current.x() : x
            const absoluteX = groupX + newBox.x
            
            // Prevent going before timeline start
            if (absoluteX < TimelineConfig.TRACK_LABEL_WIDTH) {
              newBox.x = TimelineConfig.TRACK_LABEL_WIDTH - groupX
            }
            
            // Maintain height (no vertical resizing)
            newBox.height = oldBox.height
            newBox.y = oldBox.y
            
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
          onTransformStart={() => {
            setIsTransforming(true)
          }}
          onTransform={() => {
            // Keep rect scale at 1 to prevent content stretching
            if (rectRef.current) {
              const rect = rectRef.current
              const scaleX = rect.scaleX()
              const scaleY = rect.scaleY()
              
              // Apply scale to width/height instead of scaling
              rect.width(rect.width() * scaleX)
              rect.height(rect.height() * scaleY)
              rect.scaleX(1)
              rect.scaleY(1)
            }
          }}
          onTransformEnd={() => {
            setIsTransforming(false)

            if (!rectRef.current || !groupRef.current || !trRef.current) return

            const rect = rectRef.current
            const group = groupRef.current
            
            // Get the current rect dimensions after transform
            const newWidth = rect.width()
            const rectX = rect.x()
            
            // Calculate the new group position if rect was moved
            const newGroupX = group.x() + rectX
            
            // Reset rect position (keep it at 0,0 within group)
            rect.x(0)
            rect.y(0)
            
            // Ensure minimum width
            const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
            const finalWidth = Math.max(minWidthPx, newWidth)
            
            // Constrain position
            const finalX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, newGroupX)
            
            // Calculate new times
            const adjustedX = finalX - TimelineConfig.TRACK_LABEL_WIDTH
            const newStartTime = Math.max(0, TimeConverter.pixelsToMs(adjustedX, pixelsPerMs))
            const duration = TimeConverter.pixelsToMs(finalWidth, pixelsPerMs)
            const newEndTime = newStartTime + duration
            
            // Check for overlaps
            const wouldOverlap = allBlocks
              .filter(b => b.id !== blockId)
              .some(block => 
                (newStartTime < block.endTime && newEndTime > block.startTime)
              )
            
            if (wouldOverlap) {
              // Reset dimensions
              rect.width(width)
              rect.height(height)
              group.getLayer()?.batchDraw()
            } else {
              // Update through parent callback
              onUpdate({
                startTime: newStartTime,
                endTime: newEndTime
              })
            }
          }}
        />
      )}
    </>
  )
})

TimelineZoomBlock.displayName = 'TimelineZoomBlock'
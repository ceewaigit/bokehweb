import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import Konva from 'konva'

interface TimelineEffectBlockProps {
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
  // Visuals
  label?: string
  fillColor?: string
  // Zoom visuals (optional)
  scale?: number
  introMs?: number
  outroMs?: number
  // State
  isSelected: boolean
  isEnabled?: boolean
  isCompact?: boolean // When true, show simplified view (no curve, just label)
  allBlocks: ZoomBlock[]
  blockId: string
  pixelsPerMs: number
  // Events
  onSelect: () => void
  onDragEnd: (newX: number) => void
  onUpdate: (updates: Partial<ZoomBlock>) => void
}

export const TimelineEffectBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  label,
  fillColor,
  scale,
  introMs = 500,
  outroMs = 500,
  isSelected,
  isEnabled = true,
  isCompact = false,
  allBlocks,
  blockId,
  pixelsPerMs,
  onSelect,
  onDragEnd,
  onUpdate
}: TimelineEffectBlockProps) => {
  const colors = useTimelineColors()
  const [isDragging, setIsDragging] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    setCurrentWidth(width)
  }, [width])

  useEffect(() => {
    if (isSelected && rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.forceUpdate()
      if (groupRef.current) {
        groupRef.current.moveToTop()
        groupRef.current.getLayer()?.batchDraw()
      }
    } else if (trRef.current) {
      trRef.current.nodes([])
      trRef.current.forceUpdate()
    }
  }, [isSelected])

  const getValidDragPosition = (proposedX: number, currentWidth: number): number => {
    const snapThreshold = Number(TimelineConfig.SNAP_THRESHOLD_PX)
    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: TimeConverter.msToPixels(b.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH,
        endX: TimeConverter.msToPixels(b.endTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
      }))
      .sort((a, b) => a.x - b.x)

    const blockWidth = currentWidth

    let bestSnapX = proposedX
    let minSnapDistance = snapThreshold

    for (const block of blocks) {
      const leftToLeftDistance = Math.abs(proposedX - block.x)
      if (leftToLeftDistance < minSnapDistance) {
        minSnapDistance = leftToLeftDistance
        bestSnapX = block.x
      }

      const leftToRightDistance = Math.abs(proposedX - block.endX)
      if (leftToRightDistance < minSnapDistance) {
        minSnapDistance = leftToRightDistance
        bestSnapX = block.endX
      }

      const rightToLeftDistance = Math.abs((proposedX + blockWidth) - block.x)
      if (rightToLeftDistance < minSnapDistance) {
        minSnapDistance = rightToLeftDistance
        bestSnapX = block.x - blockWidth
      }

      const rightToRightDistance = Math.abs((proposedX + blockWidth) - block.endX)
      if (rightToRightDistance < minSnapDistance) {
        minSnapDistance = rightToRightDistance
        bestSnapX = block.endX - blockWidth
      }
    }

    return Math.max(TimelineConfig.TRACK_LABEL_WIDTH, bestSnapX)
  }

  const generateZoomCurve = () => {
    if (!scale) return [] as number[]

    const points: number[] = []
    // Use currentWidth for real-time updates during transform
    const w = currentWidth

    if (!w || !height || isNaN(w) || isNaN(height)) {
      return points
    }

    const curveHeight = height - 16 // Slightly more padding
    const curveY = height / 2

    const introWidth = Math.min(TimeConverter.msToPixels(introMs, pixelsPerMs), w * 0.4)
    const outroWidth = Math.min(TimeConverter.msToPixels(outroMs, pixelsPerMs), w * 0.4)
    const plateauWidth = Math.max(0, w - introWidth - outroWidth)

    if (isNaN(introWidth) || isNaN(outroWidth) || isNaN(plateauWidth)) {
      return points
    }

    const scaleHeight = Math.min((scale - 1) * 0.3, 0.8)

    // Generate smoother curve using more points and a better easing function
    // Intro
    const steps = 40 // Increased steps for smoothness

    // Start point
    points.push(0, curveY)

    // Intro curve (ease-in-out)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Cubic ease in-out
      const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const px = introWidth * t
      const py = curveY - (curveHeight / 2) * easeT * scaleHeight
      points.push(px, py)
    }

    // Plateau
    if (plateauWidth > 0) {
      points.push(introWidth + plateauWidth, curveY - (curveHeight / 2) * scaleHeight)
    }

    // Outro curve
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Cubic ease in-out reversed
      const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const px = introWidth + plateauWidth + outroWidth * t
      const py = curveY - (curveHeight / 2) * (1 - easeT) * scaleHeight
      points.push(px, py)
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

          const snappedX = getValidDragPosition(draggedX, width)

          const newStartTime = TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          const duration = endTime - startTime
          const newEndTime = newStartTime + duration

          const wouldOverlap = allBlocks
            .filter(b => b.id !== blockId)
            .some(block => (newStartTime < block.endTime && newEndTime > block.startTime))

          if (wouldOverlap) {
            if (groupRef.current) {
              groupRef.current.x(x)
              groupRef.current.getLayer()?.batchDraw()
            }
            onSelect()
          } else {
            onUpdate({
              startTime: Math.max(0, newStartTime),
              endTime: Math.max(0, newEndTime)
            })

            onDragEnd(snappedX)
          }
        }}
        onClick={(e) => {
          e.cancelBubble = true
          if (!isDragging) {
            onSelect()
          }
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
        listening={true}
      >
        <Rect
          ref={rectRef}
          x={0}
          y={0}
          width={width} // Keep this as width prop, transformer handles visual scaling
          height={height}
          fill={fillColor || colors.zoomBlock || 'rgba(147, 51, 234, 0.85)'}
          cornerRadius={6}
          opacity={!isEnabled ? 0.3 : (isDragging ? 0.7 : (isSelected ? 0.95 : 0.85))}
          stroke={isSelected ? colors.primary : undefined}
          strokeWidth={isSelected ? 2 : 0}
          shadowColor={colors.zoomBlock}
          shadowBlur={isSelected ? 12 : 4}
          shadowOpacity={0.3}
          shadowOffsetY={2}
          listening={true}
        />

        {/* Only show curve in non-compact mode */}
        {!isCompact && curvePoints.length > 0 && (
          <>
            <Line
              points={curvePoints}
              stroke={!isEnabled ? "rgba(255, 255, 255, 0.4)" : "white"}
              strokeWidth={2.5}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </>
        )}

        {/* Label - centered in compact mode, top-left otherwise */}
        {label && (
          <Text
            x={isCompact ? width / 2 : 10}
            y={isCompact ? height / 2 - 5 : 8}
            text={label}
            fontSize={isCompact ? 10 : 11}
            fill={!isEnabled ? "rgba(255, 255, 255, 0.5)" : "white"}
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display'"
            fontStyle="600"
            align={isCompact ? "center" : "left"}
            offsetX={isCompact ? (label.length * 3) : 0}
            shadowColor="black"
            shadowBlur={4}
            shadowOpacity={0.4}
            listening={false}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
          key={`transformer-${blockId}`}
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
            if (newBox.width < minWidthPx) {
              newBox.width = minWidthPx
            }
            const groupX = groupRef.current ? groupRef.current.x() : x
            const absoluteX = groupX + newBox.x
            if (absoluteX < TimelineConfig.TRACK_LABEL_WIDTH) {
              newBox.x = TimelineConfig.TRACK_LABEL_WIDTH - groupX
            }
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
          anchorCornerRadius={5}
          keepRatio={false}
          ignoreStroke={true}
          onTransformStart={() => {
            setIsTransforming(true)
          }}
          onTransform={() => {
            if (rectRef.current) {
              const rect = rectRef.current
              const scaleX = rect.scaleX()
              const scaleY = rect.scaleY()

              // Update local state for real-time curve updates
              const newWidth = rect.width() * scaleX
              setCurrentWidth(newWidth)

              rect.width(newWidth)
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
            const newWidth = rect.width()
            const rectX = rect.x()
            const newGroupX = group.x() + rectX
            const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
            const finalWidth = Math.max(minWidthPx, newWidth)
            const finalX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, newGroupX)
            const adjustedX = finalX - TimelineConfig.TRACK_LABEL_WIDTH
            const newStartTime = Math.max(0, TimeConverter.pixelsToMs(adjustedX, pixelsPerMs))
            const duration = TimeConverter.pixelsToMs(finalWidth, pixelsPerMs)
            const newEndTime = newStartTime + duration
            const wouldOverlap = allBlocks
              .filter(b => b.id !== blockId)
              .some(block =>
                (newStartTime < block.endTime && newEndTime > block.startTime)
              )
            if (wouldOverlap) {
              rect.x(0)
              rect.y(0)
              rect.width(width)
              rect.height(height)
              group.x(x)
              group.getLayer()?.batchDraw()
              setCurrentWidth(width) // Reset on cancel
            } else {
              rect.x(0)
              rect.y(0)
              rect.width(finalWidth)
              group.x(finalX)
              setCurrentWidth(finalWidth) // Ensure sync
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
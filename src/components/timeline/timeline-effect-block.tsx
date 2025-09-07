import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import type { ZoomBlock } from '@/types/project'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-converter'
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
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

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
    const w = width

    if (!w || !height || isNaN(w) || isNaN(height)) {
      return points
    }

    const curveHeight = height - 20
    const curveY = height / 2

    const introWidth = Math.min(TimeConverter.msToPixels(introMs, pixelsPerMs), w * 0.4)
    const outroWidth = Math.min(TimeConverter.msToPixels(outroMs, pixelsPerMs), w * 0.4)
    const plateauWidth = Math.max(0, w - introWidth - outroWidth)

    if (isNaN(introWidth) || isNaN(outroWidth) || isNaN(plateauWidth)) {
      return points
    }

    const scaleHeight = Math.min((scale - 1) * 0.3, 0.8)
    const steps = 20

    for (let i = 0; i <= steps * 0.3; i++) {
      const t = i / (steps * 0.3)
      const easeT = t * t * (3 - 2 * t)
      points.push(introWidth * t)
      points.push(curveY - (curveHeight / 2) * easeT * scaleHeight)
    }

    if (plateauWidth > 0) {
      for (let i = 0; i <= steps * 0.4; i++) {
        const t = i / (steps * 0.4)
        points.push(introWidth + plateauWidth * t)
        points.push(curveY - (curveHeight / 2) * scaleHeight)
      }
    }

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
          width={width}
          height={height}
          fill={fillColor || colors.zoomBlock || 'rgba(147, 51, 234, 0.85)'}
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

        {label && (
          <Text
            x={8}
            y={6}
            text={label}
            fontSize={11}
            fill={!isEnabled ? "rgba(255, 255, 255, 0.4)" : "white"}
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display'"
            fontStyle={isSelected ? "500" : "normal"}
            shadowColor="black"
            shadowBlur={2}
            shadowOpacity={0.3}
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
          anchorCornerRadius={2}
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
            } else {
              rect.x(0)
              rect.y(0)
              rect.width(finalWidth)
              group.x(finalX)
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
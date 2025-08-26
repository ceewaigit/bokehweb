import React, { useEffect, useState, useRef } from 'react'
import { Group, Rect, Text, Image } from 'react-konva'
import type { Clip, Recording } from '@/types/project'
import { TIMELINE_LAYOUT, TimelineUtils, createClipDragBoundFunc, checkClipOverlap } from '@/lib/timeline'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { useTimelineColors } from '@/lib/timeline/colors'

interface TimelineClipProps {
  clip: Clip
  recording?: Recording | null
  trackType: 'video' | 'audio'
  trackY: number
  trackHeight: number
  pixelsPerMs: number
  isSelected: boolean
  selectedEffectType?: 'zoom' | 'cursor' | 'background' | null
  otherClipsInTrack?: Clip[]
  onSelect: (clipId: string) => void
  onSelectEffect?: (type: 'zoom' | 'cursor' | 'background') => void
  onDragEnd: (clipId: string, newStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
}

export const TimelineClip = React.memo(({
  clip,
  recording,
  trackType,
  trackY,
  trackHeight,
  pixelsPerMs,
  isSelected,
  selectedEffectType,
  otherClipsInTrack = [],
  onSelect,
  onSelectEffect,
  onDragEnd,
  onContextMenu
}: TimelineClipProps) => {
  const [thumbnails, setThumbnails] = useState<HTMLCanvasElement[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const colors = useTimelineColors()
  
  const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TIMELINE_LAYOUT.MIN_CLIP_WIDTH,
    TimelineUtils.timeToPixel(clip.duration, pixelsPerMs)
  )

  // Track height is now passed as a prop

  // Load video and generate thumbnails for video clips
  useEffect(() => {
    if (trackType !== 'video' || !recording?.filePath) return

    const loadVideoThumbnails = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(recording.id)
        if (!blobUrl && recording.filePath) {
          blobUrl = await globalBlobManager.ensureVideoLoaded(recording.id, recording.filePath)
        }
        
        if (!blobUrl) return

        // Create video element
        const video = document.createElement('video')
        video.src = blobUrl
        video.crossOrigin = 'anonymous'
        video.muted = true
        
        // Wait for metadata
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve
          video.onerror = reject
          video.load()
        })

        videoRef.current = video

        // Calculate thumbnail dimensions
        const thumbHeight = trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2
        const aspectRatio = video.videoWidth / video.videoHeight
        const thumbWidth = Math.floor(thumbHeight * aspectRatio)
        
        // Calculate how many thumbnails we need based on clip width
        const thumbnailCount = Math.max(1, Math.ceil(clipWidth / thumbWidth))
        const newThumbnails: HTMLCanvasElement[] = []
        
        // Generate frames at different timestamps
        for (let i = 0; i < thumbnailCount; i++) {
          // Calculate which frame to show based on position in clip
          const progress = i / Math.max(1, thumbnailCount - 1)
          const timeInSeconds = (clip.sourceIn + progress * (clip.sourceOut - clip.sourceIn)) / 1000
          
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          
          canvas.width = thumbWidth
          canvas.height = thumbHeight
          
          // Seek to the specific time and draw frame
          await new Promise<void>((resolve) => {
            const seekHandler = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              video.removeEventListener('seeked', seekHandler)
              resolve()
            }
            video.addEventListener('seeked', seekHandler)
            video.currentTime = timeInSeconds
          })
          
          newThumbnails.push(canvas)
        }

        setThumbnails(newThumbnails)
      } catch (error) {
        // Failed to load thumbnails - will show placeholder
      }
    }

    loadVideoThumbnails()

    return () => {
      if (videoRef.current) {
        videoRef.current.src = ''
        videoRef.current = null
      }
    }
  }, [recording?.id, recording?.filePath, clip.duration, clipWidth, trackHeight, trackType])

  // Prepare other clips data for collision detection
  const otherClipsData = otherClipsInTrack
    .filter(c => c.id !== clip.id)
    .map(c => ({ startTime: c.startTime, duration: c.duration }))

  return (
    <Group
      x={clipX}
      y={trackY + TIMELINE_LAYOUT.TRACK_PADDING}
      draggable
      dragBoundFunc={(pos) => {
        // Allow free movement during drag, only constrain to timeline boundaries
        const constrainedX = Math.max(TIMELINE_LAYOUT.TRACK_LABEL_WIDTH, pos.x)
        return {
          x: constrainedX,
          y: trackY + TIMELINE_LAYOUT.TRACK_PADDING
        }
      }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(e) => {
        setIsDragging(false)
        
        const draggedX = e.target.x()
        const proposedTime = TimelineUtils.pixelToTime(
          draggedX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH,
          pixelsPerMs
        )
        
        // Check for overlaps and snap to valid position on drag end
        const overlapCheck = checkClipOverlap(proposedTime, clip.duration, otherClipsData)
        const finalTime = overlapCheck.hasOverlap && overlapCheck.nearestValidPosition !== undefined
          ? overlapCheck.nearestValidPosition
          : proposedTime
        
        // Snap the visual position if needed
        if (overlapCheck.hasOverlap && overlapCheck.nearestValidPosition !== undefined) {
          const snappedX = TimelineUtils.timeToPixel(finalTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
          e.target.x(snappedX)
        }
        
        onDragEnd(clip.id, Math.max(0, finalTime))
      }}
      onClick={() => onSelect(clip.id)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }
      }}
      opacity={isDragging ? 0.6 : 1}
    >
      {/* Clip background with rounded corners */}
      <Rect
        width={clipWidth}
        height={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
        fill={
          trackType === 'video' && thumbnails.length > 0 
            ? 'transparent' 
            : trackType === 'video' 
              ? colors.info
              : colors.success
        }
        stroke={isSelected ? colors.foreground : 'transparent'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={6}
        opacity={0.95}
        shadowColor="black"
        shadowBlur={isSelected ? 10 : 4}
        shadowOpacity={0.3}
        shadowOffsetY={2}
      />

      {/* Video thumbnails */}
      {trackType === 'video' && thumbnails.length > 0 && (
        <Group clipFunc={(ctx) => {
          // Clip to rounded rectangle
          ctx.beginPath()
          ctx.roundRect(0, 0, clipWidth, trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2, 6)
          ctx.closePath()
        }}>
          {/* Render each thumbnail frame */}
          {thumbnails.map((canvas, i) => {
            const thumbHeight = trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2
            const aspectRatio = canvas.width / canvas.height
            const thumbWidth = Math.floor(thumbHeight * aspectRatio)
            
            return (
              <Image
                key={i}
                image={canvas}
                x={i * thumbWidth}
                y={0}
                width={thumbWidth}
                height={thumbHeight}
                opacity={0.95}
              />
            )
          })}
          {/* Gradient overlay for text visibility */}
          <Rect
            width={clipWidth}
            height={24}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: 24 }}
            fillLinearGradientColorStops={[
              0, 'rgba(0,0,0,0.6)',
              1, 'rgba(0,0,0,0)'
            ]}
          />
        </Group>
      )}

      {/* Clip ID label */}
      <Text
        x={8}
        y={8}
        text={`${clip.id.slice(-4)}`}
        fontSize={11}
        fill={colors.foreground}
        fontFamily="system-ui"
        fontStyle="bold"
        shadowColor="black"
        shadowBlur={3}
        shadowOpacity={0.8}
      />

      {/* Effect badges for video clips - clickable indicators */}
      {trackType === 'video' && (() => {
        const badges = []
        let xOffset = 0
        
        const handleBadgeClick = (e: any, type: 'zoom' | 'cursor' | 'background') => {
          e.cancelBubble = true
          onSelect(clip.id)
          onSelectEffect?.(type)
        }
        
        if (clip.effects?.zoom?.enabled) {
          badges.push(
            <Group 
              key="zoom"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'zoom')}
              onTap={(e) => handleBadgeClick(e, 'zoom')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'zoom' ? colors.info : colors.muted} 
                cornerRadius={2}
                opacity={selectedEffectType === 'zoom' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="Z" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }
        
        // Only show cursor badge when cursor is enabled
        if (clip.effects?.cursor?.enabled) {
          badges.push(
            <Group 
              key="cursor"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'cursor')}
              onTap={(e) => handleBadgeClick(e, 'cursor')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'cursor' ? colors.success : colors.muted} 
                cornerRadius={2}
                opacity={selectedEffectType === 'cursor' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="C" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }
        
        if (clip.effects?.background?.type && clip.effects.background.type !== 'none') {
          badges.push(
            <Group 
              key="bg"
              x={xOffset} 
              y={0}
              onClick={(e) => handleBadgeClick(e, 'background')}
              onTap={(e) => handleBadgeClick(e, 'background')}
            >
              <Rect 
                width={32} 
                height={14} 
                fill={selectedEffectType === 'background' ? colors.zoomBlock : colors.muted} 
                cornerRadius={2}
                opacity={selectedEffectType === 'background' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="B" fontSize={9} fill={colors.foreground} fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
        }
        
        return badges.length > 0 ? <Group x={6} y={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2 - 20}>{badges}</Group> : null
      })()}
    </Group>
  )
})
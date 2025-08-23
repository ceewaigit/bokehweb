import React, { useEffect, useState, useRef } from 'react'
import { Group, Rect, Text, Image } from 'react-konva'
import type { Clip } from '@/types/project'
import { TIMELINE_LAYOUT, TimelineUtils, createDragBoundFunc } from '@/lib/timeline'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

interface TimelineClipProps {
  clip: Clip
  trackType: 'video' | 'audio'
  trackY: number
  pixelsPerMs: number
  isSelected: boolean
  selectedEffectType?: 'zoom' | 'cursor' | 'background' | null
  onSelect: (clipId: string) => void
  onSelectEffect?: (type: 'zoom' | 'cursor' | 'background') => void
  onDragEnd: (clipId: string, newStartTime: number) => void
  onContextMenu?: (e: any, clipId: string) => void
}

export const TimelineClip = React.memo(({
  clip,
  trackType,
  trackY,
  pixelsPerMs,
  isSelected,
  selectedEffectType,
  onSelect,
  onSelectEffect,
  onDragEnd,
  onContextMenu
}: TimelineClipProps) => {
  const [thumbnails, setThumbnails] = useState<HTMLCanvasElement[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  
  const clipX = TimelineUtils.timeToPixel(clip.startTime, pixelsPerMs) + TIMELINE_LAYOUT.TRACK_LABEL_WIDTH
  const clipWidth = Math.max(
    TIMELINE_LAYOUT.MIN_CLIP_WIDTH,
    TimelineUtils.timeToPixel(clip.duration, pixelsPerMs)
  )

  const trackHeight = trackType === 'video' 
    ? TIMELINE_LAYOUT.VIDEO_TRACK_HEIGHT 
    : TIMELINE_LAYOUT.AUDIO_TRACK_HEIGHT

  // Load video and generate thumbnails for video clips
  useEffect(() => {
    if (trackType !== 'video' || !clip.filePath) return

    const loadVideoThumbnails = async () => {
      try {
        // Get or load video URL
        let blobUrl = RecordingStorage.getBlobUrl(clip.id)
        if (!blobUrl && clip.filePath) {
          blobUrl = await globalBlobManager.ensureVideoLoaded(clip.id, clip.filePath)
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

        // Calculate how many thumbnails we need (one every 60px)
        const thumbnailCount = Math.max(1, Math.floor(clipWidth / 60))
        const timeInterval = clip.duration / thumbnailCount
        const newThumbnails: HTMLCanvasElement[] = []

        // Generate thumbnails
        for (let i = 0; i < thumbnailCount; i++) {
          const time = (i * timeInterval) / 1000 // Convert to seconds
          
          // Create canvas for this thumbnail
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          // Set size - keep aspect ratio
          const aspectRatio = video.videoWidth / video.videoHeight
          canvas.height = trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2
          canvas.width = canvas.height * aspectRatio

          // Seek and draw
          await new Promise<void>((resolve) => {
            const seekHandler = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              video.removeEventListener('seeked', seekHandler)
              resolve()
            }
            video.addEventListener('seeked', seekHandler)
            video.currentTime = time
          })

          newThumbnails.push(canvas)
        }

        setThumbnails(newThumbnails)
      } catch (error) {
        console.error('Failed to load video thumbnails:', error)
      }
    }

    loadVideoThumbnails()

    return () => {
      if (videoRef.current) {
        videoRef.current.src = ''
        videoRef.current = null
      }
    }
  }, [clip.id, clip.filePath, clip.duration, clipWidth, trackHeight, trackType])

  return (
    <Group
      x={clipX}
      y={trackY + TIMELINE_LAYOUT.TRACK_PADDING}
      draggable
      dragBoundFunc={createDragBoundFunc(trackY, pixelsPerMs)}
      onDragEnd={(e) => {
        const newX = e.target.x()
        const newTime = TimelineUtils.pixelToTime(
          newX - TIMELINE_LAYOUT.TRACK_LABEL_WIDTH,
          pixelsPerMs
        )
        onDragEnd(clip.id, Math.max(0, newTime))
      }}
      onClick={() => onSelect(clip.id)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.evt.preventDefault()
          onContextMenu(e, clip.id)
        }
      }}
    >
      {/* Clip background with rounded corners */}
      <Rect
        width={clipWidth}
        height={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
        fill={
          trackType === 'video' && thumbnails.length > 0 
            ? 'transparent' 
            : trackType === 'video' 
              ? 'hsl(217, 91%, 60%)' 
              : 'hsl(142, 71%, 45%)'
        }
        stroke={isSelected ? 'hsl(0, 0%, 98%)' : 'transparent'}
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
          {thumbnails.map((canvas, i) => (
            <Image
              key={i}
              image={canvas}
              x={i * 60}
              y={0}
              width={60}
              height={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
              opacity={0.9}
            />
          ))}
          {/* Overlay gradient for better text visibility */}
          <Rect
            width={clipWidth}
            height={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2 }}
            fillLinearGradientColorStops={[
              0, 'rgba(0,0,0,0.4)',
              0.3, 'rgba(0,0,0,0)',
              0.7, 'rgba(0,0,0,0)',
              1, 'rgba(0,0,0,0.3)'
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
        fill="white"
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
                fill={selectedEffectType === 'zoom' ? "hsl(217, 91%, 60%)" : "hsl(240, 5%, 45%)"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'zoom' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="Z" fontSize={9} fill="white" fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
          xOffset += 36
        }
        
        if (clip.effects?.cursor?.visible) {
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
                fill={selectedEffectType === 'cursor' ? "hsl(142, 71%, 45%)" : "hsl(240, 5%, 45%)"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'cursor' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="C" fontSize={9} fill="white" fontFamily="system-ui" fontStyle="bold" />
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
                fill={selectedEffectType === 'background' ? "hsl(280, 65%, 60%)" : "hsl(240, 5%, 45%)"} 
                cornerRadius={2}
                opacity={selectedEffectType === 'background' ? 1 : 0.7}
              />
              <Text x={5} y={3} text="B" fontSize={9} fill="white" fontFamily="system-ui" fontStyle="bold" />
            </Group>
          )
        }
        
        return badges.length > 0 ? <Group x={6} y={trackHeight - TIMELINE_LAYOUT.TRACK_PADDING * 2 - 20}>{badges}</Group> : null
      })()}
    </Group>
  )
})
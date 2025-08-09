import { useEffect, useRef, useState } from 'react'
import { RecordingStorage } from '@/lib/storage/recording-storage'

interface VideoThumbnailProps {
  recordingId: string
  width: number
  height: number
  timestamp?: number // in milliseconds
  className?: string
}

export function VideoThumbnail({ recordingId, width, height, timestamp = 0, className = '' }: VideoThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [thumbnailGenerated, setThumbnailGenerated] = useState(false)
  
  useEffect(() => {
    const generateThumbnail = async () => {
      if (!canvasRef.current) return
      
      // Get the video blob URL
      const blobUrl = RecordingStorage.getBlobUrl(recordingId)
      if (!blobUrl) {
        console.warn(`No blob URL found for recording ${recordingId}`)
        return
      }
      
      // Create a hidden video element
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      videoRef.current = video
      
      // Set up event listeners
      video.addEventListener('loadedmetadata', () => {
        // Seek to the specified timestamp
        video.currentTime = timestamp / 1000
      })
      
      video.addEventListener('seeked', () => {
        // Draw the frame to canvas
        const canvas = canvasRef.current
        if (!canvas) return
        
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        
        // Set canvas size to match desired thumbnail size
        canvas.width = width
        canvas.height = height
        
        // Calculate scaling to fit video in thumbnail
        const videoAspect = video.videoWidth / video.videoHeight
        const thumbAspect = width / height
        
        let drawWidth = width
        let drawHeight = height
        let offsetX = 0
        let offsetY = 0
        
        if (videoAspect > thumbAspect) {
          // Video is wider than thumbnail
          drawHeight = width / videoAspect
          offsetY = (height - drawHeight) / 2
        } else {
          // Video is taller than thumbnail
          drawWidth = height * videoAspect
          offsetX = (width - drawWidth) / 2
        }
        
        // Clear canvas with dark background
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, width, height)
        
        // Draw video frame
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
        
        setThumbnailGenerated(true)
        
        // Clean up
        video.remove()
        videoRef.current = null
      })
      
      video.addEventListener('error', (e) => {
        console.error(`Error loading video for thumbnail: ${recordingId}`, e)
        video.remove()
        videoRef.current = null
      })
      
      // Start loading the video
      video.src = blobUrl
      video.load()
    }
    
    generateThumbnail()
    
    return () => {
      // Clean up if component unmounts before thumbnail is generated
      if (videoRef.current) {
        videoRef.current.remove()
        videoRef.current = null
      }
    }
  }, [recordingId, width, height, timestamp])
  
  return (
    <canvas
      ref={canvasRef}
      className={`${className} ${!thumbnailGenerated ? 'bg-muted animate-pulse' : ''}`}
      style={{ width, height }}
    />
  )
}
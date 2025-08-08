"use client"

import { useRef, useEffect, useState } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
import { useRecordingStore } from '@/stores/recording-store'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Play, Pause, RotateCcw, Eye, EyeOff } from 'lucide-react'

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const { project, currentTime, isPlaying, setPlaying, setCurrentTime } = useTimelineStore()
  const { isRecording } = useRecordingStore()

  // Get the current clip (first clip for now)
  const currentClip = project?.clips[0]
  const hasEnhancements = currentClip?.enhancements && currentClip?.originalSource

  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentClip) return

    // Update video source based on toggle
    const sourceUrl = showOriginal ? currentClip.originalSource : currentClip.source
    if (sourceUrl && video.src !== sourceUrl) {
      console.log('🔄 Updating video source:', {
        showOriginal,
        sourceUrl: sourceUrl.substring(0, 50) + '...',
        currentSrc: video.src?.substring(0, 50) + '...',
        currentTime
      })
      
      // Validate blob URL before setting
      if (sourceUrl.startsWith('blob:')) {
        try {
          // Test if blob URL is still valid by creating a temporary fetch
          fetch(sourceUrl, { method: 'HEAD' })
            .then(response => {
              if (!response.ok) {
                console.error('🚨 Blob URL is invalid:', response.status, response.statusText)
              } else {
                console.log('✅ Blob URL validated successfully')
              }
            })
            .catch(error => {
              console.error('🚨 Blob URL validation failed:', error)
            })
        } catch (error) {
          console.error('🚨 Error validating blob URL:', error)
        }
      }
      
      video.src = sourceUrl
      video.currentTime = currentTime
    }

    // Sync video playback with timeline
    if (isPlaying && !isVideoPlaying) {
      video.play()
      setIsVideoPlaying(true)
    } else if (!isPlaying && isVideoPlaying) {
      video.pause()
      setIsVideoPlaying(false)
    }

    // Sync video time with timeline
    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime
    }
  }, [currentClip, showOriginal, currentTime, isPlaying, isVideoPlaying])

  const handlePlayPause = () => {
    setPlaying(!isPlaying)
  }

  const handleRestart = () => {
    setCurrentTime(0)
    setPlaying(false)
  }

  return (
    <div className="flex-1 bg-black relative flex items-center justify-center">
      {isRecording ? (
        // Recording state
        <div className="text-center text-white">
          <div className="flex items-center justify-center mb-4">
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse mr-2" />
            <span className="text-lg font-medium">Recording...</span>
          </div>
          <p className="text-muted-foreground">Screen Studio effects are being applied</p>
        </div>
      ) : currentClip ? (
        // Video preview
        <>
          <video
            ref={videoRef}
            className="max-w-full max-h-full"
            controls={false}
            onTimeUpdate={(e) => {
              const video = e.target as HTMLVideoElement
              if (Math.abs(video.currentTime - currentTime) > 0.1) {
                setCurrentTime(video.currentTime)
              }
            }}
            onEnded={() => setPlaying(false)}
            onError={(e) => {
              const video = e.target as HTMLVideoElement
              console.error('🚨 Video error:', {
                error: video.error,
                networkState: video.networkState,
                readyState: video.readyState,
                src: video.src,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight
              })
            }}
            onLoadStart={() => {
              console.log('📹 Video loading started')
            }}
            onLoadedMetadata={(e) => {
              const video = e.target as HTMLVideoElement
              console.log('📊 Video metadata loaded:', {
                duration: video.duration,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                src: video.src?.substring(0, 50) + '...'
              })
            }}
            onLoadedData={() => {
              console.log('✅ Video data loaded')
            }}
            onCanPlay={() => {
              console.log('▶️ Video can play')
            }}
            onCanPlayThrough={() => {
              console.log('🎬 Video can play through')
            }}
            onEmptied={() => {
              console.warn('⚠️ Video emptied')
            }}
            onStalled={() => {
              console.warn('⚠️ Video stalled')
            }}
            onSuspend={() => {
              console.warn('⚠️ Video suspended')
            }}
            onWaiting={() => {
              console.warn('⏳ Video waiting')
            }}
          />
          
          {/* Video Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handleRestart}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Enhancement Toggle */}
            {hasEnhancements && (
              <div className="flex items-center space-x-2">
                <Badge variant={showOriginal ? "outline" : "default"}>
                  {showOriginal ? "Original" : "Enhanced"}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowOriginal(!showOriginal)}
                >
                  {showOriginal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showOriginal ? "Show Enhanced" : "Show Original"}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        // Empty state
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No video loaded</p>
          <p>Record your screen to see the preview</p>
        </div>
      )}
    </div>
  )
}
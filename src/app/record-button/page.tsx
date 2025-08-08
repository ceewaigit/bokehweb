'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'

export default function RecordButton() {
  const [isRecording, setIsRecording] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [duration, setDuration] = useState(0)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout>()
  const recorderRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    // Clean up on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      // Get screen recording permission and stream
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 3840, max: 3840 },
          height: { ideal: 2160, max: 2160 },
          frameRate: { ideal: 60, max: 60 }
        },
        audio: false
      })

      streamRef.current = stream

      // Create media recorder
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000
      })

      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      recorder.onstop = async () => {
        // Create video blob
        const blob = new Blob(chunks, { type: 'video/webm' })

        // Save to file
        const recordingsDir = await window.electronAPI?.getRecordingsDirectory?.()
        if (recordingsDir) {
          const fileName = `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
          const filePath = `${recordingsDir}/${fileName}`

          // Convert blob to buffer and save
          const buffer = await blob.arrayBuffer()
          await window.electronAPI?.saveRecording?.(filePath, buffer)

          // Open workspace to show the recording
          await window.electronAPI?.openWorkspace?.()
        }
      }

      recorderRef.current = recorder
      recorder.start(1000) // Capture in 1 second chunks

      // Start timer
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)

      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    setIsRecording(false)
    setDuration(0)
  }

  const handleClick = async () => {
    if (!isRecording) {
      await startRecording()
    } else {
      stopRecording()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center p-1"
      style={{
        backgroundColor: 'transparent',
        // @ts-ignore - Electron-specific CSS property
        WebkitAppRegion: 'drag'
      }}
    >
      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium text-sm"
        style={{
          // @ts-ignore - Electron-specific CSS property
          WebkitAppRegion: 'no-drag',
          background: isRecording
            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
            : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: 'white',
          boxShadow: isHovered
            ? '0 10px 25px rgba(0, 0, 0, 0.3)'
            : '0 4px 12px rgba(0, 0, 0, 0.15)',
          minWidth: '100px'
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
      >
        {isRecording ? (
          <>
            {/* Stop icon */}
            <motion.div
              className="w-3 h-3 bg-white rounded-sm"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span>{formatTime(duration)}</span>
          </>
        ) : (
          <>
            {/* Record icon */}
            <div className="w-3 h-3 bg-white rounded-full" />
            <span>Record</span>
          </>
        )}
      </motion.button>

      {/* Subtle pulse when recording */}
      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            opacity: 0.3
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />
      )}
    </div>
  )
}
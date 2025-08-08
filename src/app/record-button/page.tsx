'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export default function RecordButton() {
  const [isRecording, setIsRecording] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Listen for recording state changes
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleRecordingState = (_event: any, recording: boolean) => {
        setIsRecording(recording)
      }
      
      window.electronAPI.onRecordingStateChanged?.(handleRecordingState)
    }
  }, [])

  const handleClick = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (!isRecording) {
        // Hide the button window and show main window to start recording
        await window.electronAPI.showMainWindow?.()
        // Send toggle recording command
        await window.electronAPI.toggleRecording?.()
      } else {
        // Stop recording
        await window.electronAPI.toggleRecording?.()
        // Show main window with the recorded video
        await window.electronAPI.showMainWindow?.()
      }
      setIsRecording(!isRecording)
    }
  }

  return (
    <div 
      className="w-full h-full flex items-center justify-center"
      style={{ 
        backgroundColor: 'transparent',
        WebkitAppRegion: 'drag' as any
      }}
    >
      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative w-12 h-12 rounded-full flex items-center justify-center"
        style={{ 
          WebkitAppRegion: 'no-drag' as any,
          background: isRecording 
            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
            : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          boxShadow: isHovered 
            ? '0 8px 32px rgba(0, 0, 0, 0.3)' 
            : '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          scale: isRecording ? [1, 1.1, 1] : 1,
        }}
        transition={{
          duration: isRecording ? 2 : 0.2,
          repeat: isRecording ? Infinity : 0,
          ease: "easeInOut"
        }}
      >
        {isRecording ? (
          // Stop icon (square)
          <motion.div 
            className="w-4 h-4 bg-white rounded-sm"
            initial={{ rotate: 0 }}
            animate={{ rotate: 90 }}
            transition={{ duration: 0.3 }}
          />
        ) : (
          // Record icon (circle)
          <motion.div 
            className="w-4 h-4 bg-white rounded-full"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
          />
        )}
        
        {/* Ripple effect when recording */}
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-red-500"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        )}
      </motion.button>
    </div>
  )
}
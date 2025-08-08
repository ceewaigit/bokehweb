"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Film, Play, Trash2, Edit3, Calendar, Clock, HardDrive } from 'lucide-react'
import { Button } from './ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface Recording {
  name: string
  path: string
  timestamp: Date
}

interface RecordingsLibraryProps {
  onSelectRecording: (recording: Recording) => void
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecordings()
  }, [])

  const loadRecordings = async () => {
    try {
      setLoading(true)
      if (window.electronAPI?.loadRecordings) {
        const recs = await window.electronAPI.loadRecordings()
        setRecordings(recs.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        })))
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (path: string) => {
    // This would need actual file size from electron
    return '~50 MB'
  }

  const formatDuration = (path: string) => {
    // This would need actual duration from video metadata
    return '2:34'
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading recordings...</p>
        </div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Film className="w-12 h-12 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">No recordings yet</h2>
          <p className="text-muted-foreground mb-6">
            Click the floating record button to start capturing your screen
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="w-4 h-4" />
            <span>Recordings are saved to Documents/ScreenStudio Recordings</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Your Recordings</h1>
          <p className="text-muted-foreground">
            {recordings.length} recording{recordings.length !== 1 ? 's' : ''} saved
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recordings.map((recording, index) => (
            <motion.div
              key={recording.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group relative"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className={cn(
                "relative bg-card rounded-lg overflow-hidden border transition-all cursor-pointer",
                hoveredIndex === index ? "border-primary shadow-lg scale-105" : "border-border"
              )}
              onClick={() => onSelectRecording(recording)}
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-700 relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="w-12 h-12 text-white/20" />
                  </div>
                  
                  {/* Duration badge */}
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {formatDuration(recording.path)}
                  </div>

                  {/* Play overlay on hover */}
                  {hoveredIndex === index && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    >
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-black ml-1" />
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Recording info */}
                <div className="p-4">
                  <h3 className="font-semibold mb-1 truncate">
                    {recording.name.replace(/^Recording_/, '').replace(/\.(webm|mp4)$/, '')}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDistanceToNow(recording.timestamp, { addSuffix: true })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      <span>{formatFileSize(recording.path)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-8 h-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      // Edit functionality
                    }}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-8 h-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      // Delete functionality
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
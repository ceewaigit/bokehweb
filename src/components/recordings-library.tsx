"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Film, Play, Trash2, Edit3, Calendar, Clock, HardDrive, FileJson } from 'lucide-react'
import { Button } from './ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { loadProject, type Project } from '@/types/project'

interface Recording {
  name: string
  path: string
  timestamp: Date
  isProject?: boolean
  project?: Project
}

interface RecordingsLibraryProps {
  onSelectRecording: (recording: Recording) => void | Promise<void>
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
        const files = await window.electronAPI.loadRecordings()
        const recordingsList: Recording[] = []
        
        for (const file of files) {
          const recording: Recording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp)
          }
          
          // Check if it's a project file
          if (file.path.endsWith('.ssproj')) {
            recording.isProject = true
            
            // Try to load the project data
            try {
              if (window.electronAPI?.readLocalFile) {
                const result = await window.electronAPI.readLocalFile(file.path)
                if (result?.success && result.data) {
                  const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
                  recording.project = JSON.parse(projectData)
                  // Use project name if available
                  if (recording.project?.name) {
                    recording.name = recording.project.name
                  }
                }
              }
            } catch (e) {
              console.error('Failed to load project data:', e)
            }
          }
          
          recordingsList.push(recording)
        }
        
        // Sort by timestamp, newest first
        recordingsList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        setRecordings(recordingsList)
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
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="w-32 h-32 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <Film className="w-16 h-16 text-primary" />
          </div>
          <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            No recordings yet
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Click the floating record button to start capturing your screen
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-card/50 backdrop-blur-sm px-4 py-2 rounded-lg">
            <HardDrive className="w-4 h-4" />
            <span>Recordings are saved to Documents/ScreenStudio Recordings</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Your Recordings
          </h1>
          <p className="text-muted-foreground text-lg">
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
                "relative rounded-xl overflow-hidden transition-all cursor-pointer group",
                "bg-gradient-to-b from-card to-card/50 backdrop-blur-sm",
                "border border-border/50",
                hoveredIndex === index 
                  ? "shadow-2xl scale-[1.02] border-primary/50 ring-2 ring-primary/20" 
                  : "hover:shadow-xl"
              )}
              onClick={() => onSelectRecording(recording)}
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gradient-to-br from-primary/20 via-primary/10 to-background relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {recording.isProject ? (
                      <FileJson className="w-16 h-16 text-primary/30" />
                    ) : (
                      <Film className="w-16 h-16 text-primary/20" />
                    )}
                  </div>
                  
                  {/* Animated gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                  
                  {/* Project badge for .ssproj files */}
                  {recording.isProject && (
                    <div className="absolute top-3 left-3 bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-medium shadow-lg">
                      <FileJson className="w-3.5 h-3.5" />
                      <span>Project</span>
                    </div>
                  )}
                  
                  {/* Duration badge */}
                  <div className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm text-foreground text-xs px-2.5 py-1.5 rounded-md font-medium shadow-lg">
                    {recording.project?.timeline?.duration 
                      ? `${Math.floor(recording.project.timeline.duration / 60000)}:${String(Math.floor((recording.project.timeline.duration % 60000) / 1000)).padStart(2, '0')}`
                      : formatDuration(recording.path)
                    }
                  </div>

                  {/* Play overlay on hover */}
                  {hoveredIndex === index && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", bounce: 0.3 }}
                      className="absolute inset-0 bg-background/20 backdrop-blur-sm flex items-center justify-center"
                    >
                      <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center shadow-2xl">
                        <Play className="w-10 h-10 text-primary-foreground ml-1" fill="currentColor" />
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Recording info */}
                <div className="p-5">
                  <h3 className="font-semibold text-lg mb-2 truncate">
                    {recording.isProject && recording.project?.name 
                      ? recording.project.name
                      : recording.name.replace(/^Recording_/, '').replace(/\.(webm|mp4|ssproj)$/, '')
                    }
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDistanceToNow(recording.timestamp, { addSuffix: true })}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>{recording.isProject ? 'Project' : formatFileSize(recording.path)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-9 h-9 p-0 bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
                    onClick={(e) => {
                      e.stopPropagation()
                      // Edit functionality
                    }}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-9 h-9 p-0 bg-background/90 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground shadow-lg"
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
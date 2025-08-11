"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Play, Trash2, MoreVertical, Calendar, HardDrive, FileJson, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatTime } from '@/lib/utils'
import { type Project } from '@/types/project'

interface Recording {
  name: string
  path: string
  timestamp: Date
  isProject?: boolean
  project?: Project
  size?: number
  videoSize?: number
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
          // ONLY load .ssproj files
          if (!file.path.endsWith('.ssproj')) {
            continue
          }

          const recording: Recording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp),
            size: file.size,
            videoSize: file.videoSize,
            isProject: true
          }

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
                
                // Log what we loaded for debugging
                console.log('Loaded project:', {
                  name: recording.project?.name,
                  duration: recording.project?.timeline?.duration,
                  recordings: recording.project?.recordings?.length,
                  clips: recording.project?.timeline?.tracks?.reduce((acc: number, t: any) => acc + (t.clips?.length || 0), 0)
                })
              }
            }
          } catch (e) {
            console.error('Failed to load project data:', e)
            continue // Skip corrupted project files
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return 'Unknown'

    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const size = (bytes / Math.pow(1024, i)).toFixed(1)

    return `${size} ${sizes[i]}`
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-background">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-16 h-16 border-2 border-primary/20 rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading recordings...</p>
        </motion.div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-background p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="relative inline-block mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl flex items-center justify-center backdrop-blur-xl border border-primary/10">
              <Film className="w-12 h-12 text-primary/60" />
            </div>
            <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-primary/40" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">No recordings yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Start capturing your screen with the floating record button
          </p>
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-white/5 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/10">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Documents/ScreenStudio Recordings</span>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-gradient-to-br from-background via-background/95 to-background overflow-hidden">
      <div className="h-full overflow-auto">
        {/* Compact header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">Recordings</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {recordings.length} {recordings.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={loadRecordings}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Grid with tighter spacing */}
        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            <AnimatePresence mode="popLayout">
              {recordings.map((recording, index) => (
                <motion.div
                  key={recording.path}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ 
                    delay: index * 0.02,
                    duration: 0.2,
                    layout: { type: "spring", stiffness: 300, damping: 30 }
                  }}
                  className="group relative"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div 
                    className={cn(
                      "relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
                      "bg-white/5 backdrop-blur-sm border border-white/10",
                      hoveredIndex === index
                        ? "scale-[1.02] shadow-2xl shadow-primary/10 border-primary/30 bg-white/10"
                        : "hover:bg-white/[0.07]"
                    )}
                    onClick={() => onSelectRecording(recording)}
                  >
                    {/* Compact thumbnail */}
                    <div className="aspect-video relative bg-gradient-to-br from-primary/5 to-transparent">
                      {/* Center icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {recording.isProject ? (
                          <FileJson className="w-8 h-8 text-white/10" />
                        ) : (
                          <Film className="w-8 h-8 text-white/10" />
                        )}
                      </div>

                      {/* Hover play button */}
                      <AnimatePresence>
                        {hoveredIndex === index && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center"
                          >
                            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-xl">
                              <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Duration badge in bottom right */}
                      {recording.project?.timeline?.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-md font-mono">
                          {formatTime(recording.project.timeline.duration / 1000)}
                        </div>
                      )}

                      {/* Badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
                        {recording.isProject && (
                          <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                            <FileJson className="w-3 h-3" />
                            <span>Project</span>
                          </div>
                        )}

                        {/* Options button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            "ml-auto w-6 h-6 p-0 bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-opacity",
                            hoveredIndex === index ? "opacity-100" : "opacity-0"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            // TODO: Show options menu
                          }}
                        >
                          <MoreVertical className="w-3 h-3 text-white" />
                        </Button>
                      </div>

                      {/* Duration */}
                      <div className="absolute bottom-2 right-2">
                        <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-md font-medium">
                          {recording.project?.timeline?.duration
                            ? formatTime(recording.project.timeline.duration)
                            : '0:00'
                          }
                        </div>
                      </div>
                    </div>

                    {/* Compact info section */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm truncate mb-1.5">
                        {recording.project?.name || recording.name.replace(/^Recording_/, '').replace(/\.ssproj$/, '')}
                      </h3>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {/* Duration */}
                        {recording.project?.timeline?.duration && (
                          <div className="flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            <span className="font-mono">
                              {formatTime(recording.project.timeline.duration / 1000)}
                            </span>
                          </div>
                        )}
                        
                        {/* Clips count */}
                        {recording.project?.timeline?.tracks && (
                          <div className="flex items-center gap-1">
                            <span>
                              {recording.project.timeline.tracks.reduce((acc: number, t: any) => acc + (t.clips?.length || 0), 0)} clips
                            </span>
                          </div>
                        )}
                        
                        {/* Timestamp */}
                        <div className="flex items-center gap-1 ml-auto">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDistanceToNow(recording.timestamp, { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick actions on hover */}
                    <AnimatePresence>
                      {hoveredIndex === index && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent backdrop-blur-sm"
                        >
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 h-7 text-[10px] bg-white/10 hover:bg-white/20 text-white"
                              onClick={(e) => {
                                e.stopPropagation()
                                onSelectRecording(recording)
                              }}
                            >
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-7 h-7 p-0 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                // TODO: Delete functionality
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
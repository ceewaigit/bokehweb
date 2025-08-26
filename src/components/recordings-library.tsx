"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Play, Trash2, Clock, HardDrive, Layers, Download, RefreshCw, Loader2, Video, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatTime } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { getVideoDuration } from '@/lib/utils/video-metadata'
import { type Project } from '@/types/project'

interface Recording {
  name: string
  path: string
  timestamp: Date
  project?: Project
  size?: number
  thumbnailUrl?: string
}

interface RecordingsLibraryProps {
  onSelectRecording: (recording: Recording) => void | Promise<void>
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollDebounceRef = useRef<NodeJS.Timeout>()

  const generateThumbnail = useCallback(async (recording: Recording, videoPath: string) => {
    return await ThumbnailGenerator.generateThumbnail(
      videoPath,
      recording.path,
      {
        width: 320,
        height: 180,
        quality: 0.6,
        timestamp: 0.1
      }
    )
  }, [])

  const loadRecordings = async () => {
    try {
      setLoading(true)
      if (window.electronAPI?.loadRecordings) {
        const files = await window.electronAPI.loadRecordings()
        const recordingsList: Recording[] = []

        for (const file of files) {
          if (!file.path.endsWith('.ssproj')) {
            continue
          }

          const recording: Recording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp),
            size: file.size
          }

          try {
            if (window.electronAPI?.readLocalFile) {
              const result = await window.electronAPI.readLocalFile(file.path)
              if (result?.success && result.data) {
                const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
                recording.project = JSON.parse(projectData)

                if (recording.project?.name) {
                  recording.name = recording.project.name
                }

                // Get actual video file size and duration
                if (recording.project?.recordings && recording.project.recordings.length > 0) {
                  const projectDir = file.path.substring(0, file.path.lastIndexOf('/'))
                  let videoPath = recording.project.recordings[0].filePath
                  
                  // Make path absolute if relative
                  if (!videoPath.startsWith('/')) {
                    videoPath = `${projectDir}/${videoPath}`
                  }
                  
                  // Get actual video file size
                  if (window.electronAPI?.getFileSize) {
                    try {
                      const result = await window.electronAPI.getFileSize(videoPath)
                      if (result?.success && result.data?.size && result.data.size > 0) {
                        recording.size = result.data.size
                      }
                    } catch (e) {
                      console.log('Could not get video file size:', e)
                    }
                  }
                  
                  // Get actual video duration from the video file
                  if (window.electronAPI?.getVideoUrl) {
                    try {
                      const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
                      if (videoUrl) {
                        const videoDuration = await getVideoDuration(videoUrl)
                        if (videoDuration > 0) {
                          // Update the recording duration with actual video duration
                          recording.project.recordings[0].duration = videoDuration
                          
                          // Ensure timeline exists and has the correct duration
                          if (!recording.project.timeline) {
                            recording.project.timeline = {
                              tracks: [],
                              duration: videoDuration
                            }
                          } else {
                            recording.project.timeline.duration = videoDuration
                          }
                        }
                      }
                    } catch (e) {
                      console.log('Could not get video duration:', e)
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Failed to load project data:', e)
            continue
          }

          recordingsList.push(recording)
        }

        // Remove duplicates - keep latest by timestamp
        const uniqueMap = new Map<string, Recording>()
        recordingsList.forEach(recording => {
          const key = recording.project?.recordings?.[0]?.filePath || recording.path
          const existing = uniqueMap.get(key)
          if (!existing || recording.timestamp > existing.timestamp) {
            uniqueMap.set(key, recording)
          }
        })
        const uniqueRecordings = Array.from(uniqueMap.values())

        uniqueRecordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        setRecordings(uniqueRecordings)

        // Generate thumbnails for initially visible items in batches
        const initialBatch = uniqueRecordings.slice(0, 12)
        const thumbnailPromises = initialBatch.map(async (recording) => {
          if (recording.project?.recordings?.[0]?.filePath && !recording.thumbnailUrl) {
            try {
              const projectDir = recording.path.substring(0, recording.path.lastIndexOf('/'))
              let videoPath = recording.project.recordings[0].filePath

              if (!videoPath.startsWith('/')) {
                videoPath = `${projectDir}/${videoPath}`
              }

              const thumbnailUrl = await generateThumbnail(recording, videoPath)
              if (thumbnailUrl) {
                return { recording, thumbnailUrl }
              }
            } catch (error) {
              console.error('Failed to generate thumbnail for', recording.name, error)
            }
          }
          return null
        })

        // Process thumbnails and update state once
        const results = await Promise.all(thumbnailPromises)
        const validResults = results.filter(r => r !== null)

        if (validResults.length > 0) {
          setRecordings(prev => {
            const updated = [...prev]
            validResults.forEach(result => {
              if (result) {
                const index = updated.findIndex(r => r.path === result.recording.path)
                if (index !== -1) {
                  updated[index] = { ...updated[index], thumbnailUrl: result.thumbnailUrl }
                }
              }
            })
            return updated
          })
        }
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecordings()
    // Hide record button when library is shown (main window visible)
    if (window.electronAPI?.minimizeRecordButton) {
      window.electronAPI.minimizeRecordButton()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear thumbnail cache when component unmounts
      ThumbnailGenerator.clearCache()
      // Clean up any thumbnail blobs
      globalBlobManager.cleanupByType('thumbnail')

      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
    }
  }, [])

  // Virtualization scroll handler with debouncing
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return

      const container = containerRef.current
      const scrollTop = container.scrollTop
      const containerHeight = container.clientHeight
      const itemHeight = 180
      const cols = Math.floor(container.clientWidth / 150) || 6
      const rowsVisible = Math.ceil(containerHeight / itemHeight) + 2

      const startRow = Math.floor(scrollTop / itemHeight)
      const newStart = Math.max(0, startRow * cols - cols)
      const newEnd = Math.min(recordings.length, (startRow + rowsVisible) * cols + cols)

      setVisibleRange({ start: newStart, end: newEnd })

      // Debounce thumbnail loading
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }

      scrollDebounceRef.current = setTimeout(() => {
        // Load thumbnails for newly visible items (debounced)
        const visibleRecordings = recordings.slice(newStart, newEnd)
          .filter(r => r.project?.recordings?.[0]?.filePath && !r.thumbnailUrl)
          .slice(0, 3) // Limit concurrent thumbnail generation

        if (visibleRecordings.length > 0) {
          Promise.all(visibleRecordings.map(async (recording) => {
            const projectDir = recording.path.substring(0, recording.path.lastIndexOf('/'))
            let videoPath = recording.project!.recordings[0].filePath
            if (!videoPath.startsWith('/')) {
              videoPath = `${projectDir}/${videoPath}`
            }
            const thumbnailUrl = await generateThumbnail(recording, videoPath)
            return thumbnailUrl ? { recording, thumbnailUrl } : null
          })).then(results => {
            const validResults = results.filter(r => r !== null)
            if (validResults.length > 0) {
              setRecordings(prev => {
                const updated = [...prev]
                validResults.forEach(result => {
                  if (result) {
                    const index = updated.findIndex(r => r.path === result.recording.path)
                    if (index !== -1) {
                      updated[index] = { ...updated[index], thumbnailUrl: result.thumbnailUrl }
                    }
                  }
                })
                return updated
              })
            }
          })
        }
      }, 200) // 200ms debounce
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      handleScroll()
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [recordings, generateThumbnail])

  const visibleRecordings = useMemo(() =>
    recordings.slice(visibleRange.start, visibleRange.end),
    [recordings, visibleRange]
  )

  if (loading) {
    return (
      <div className="flex-1 bg-background overflow-hidden">
        {/* Header skeleton */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-2xl">
          <div className="px-6 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-5 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-8 bg-muted/20 rounded animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-20 bg-muted/20 rounded animate-pulse" />
                <div className="h-7 w-7 bg-muted/20 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Grid skeleton with animated cards */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
                className="group relative"
              >
                <div className="relative rounded-xl overflow-hidden bg-card">
                  <div className="aspect-video relative bg-gradient-to-br from-muted/10 to-muted/5">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        animate={{
                          opacity: [0.3, 0.6, 0.3],
                          scale: [0.95, 1.05, 0.95]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <Film className="w-6 h-6 text-muted-foreground/30" />
                      </motion.div>
                    </div>
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                  </div>
                  <div className="p-2.5 space-y-2">
                    <div className="h-3.5 bg-muted/20 rounded animate-pulse" />
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-12 bg-muted/10 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-muted/10 rounded animate-pulse ml-auto" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Loading status bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-card/95 backdrop-blur-xl rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Loading your recordings...</span>
          </div>
        </motion.div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="flex-1 bg-background overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-2xl">
          <div className="px-6 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-sm font-semibold text-foreground">Library</h1>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full">
                  <Layers className="w-3 h-3" />
                  <span className="font-mono">0</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-3 text-[11px] font-medium"
                  onClick={() => window.electronAPI?.showRecordButton?.()}
                >
                  <Video className="w-3 h-3 mr-1.5" />
                  New Recording
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center p-8 min-h-[calc(100vh-60px)]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-center max-w-md"
          >
            {/* Animated icon */}
            <div className="relative inline-block mb-8">
              <motion.div
                animate={{
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="relative"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl flex items-center justify-center shadow-xl">
                  <Film className="w-12 h-12 text-primary/60" />
                </div>
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute -top-2 -right-2"
                >
                  <Sparkles className="w-5 h-5 text-primary/40" />
                </motion.div>
              </motion.div>
            </div>

            <h2 className="text-xl font-semibold text-foreground mb-3">
              Your library is empty
            </h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              Start creating amazing screen recordings.<br />
              Your recordings will appear here automatically.
            </p>

            {/* Action buttons */}
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Button
                size="default"
                variant="default"
                className="w-full"
                onClick={() => window.electronAPI?.showRecordButton?.()}
              >
                <Video className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background overflow-hidden">
      <div ref={containerRef} className="h-full overflow-auto scrollbar-thin scrollbar-track-transparent">
        {/* Enhanced header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-2xl border-b border-border">
          <div className="px-6 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-sm font-semibold text-foreground">Library</h1>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full">
                  <Layers className="w-3 h-3" />
                  <span className="font-mono">{recordings.length}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-[11px] font-medium"
                  onClick={loadRecordings}
                  title="Refresh Library"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-3 text-[11px] font-medium"
                  onClick={() => window.electronAPI?.showRecordButton?.()}
                  title="New Recording"
                >
                  <Video className="w-3 h-3 mr-1.5" />
                  New Recording
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced grid with better spacing */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
            {/* Spacer for virtualization */}
            <div style={{ gridColumn: '1 / -1', height: `${Math.floor(visibleRange.start / 6) * 180}px` }} />

            <AnimatePresence mode="popLayout">
              {visibleRecordings.map((recording, index) => {
                const actualIndex = visibleRange.start + index
                const isHovered = hoveredIndex === actualIndex

                return (
                  <motion.div
                    key={recording.path}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      duration: 0.2,
                      layout: { type: "spring", stiffness: 500, damping: 40 }
                    }}
                    className="group relative"
                    onMouseEnter={() => setHoveredIndex(actualIndex)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={cn(
                        "relative rounded-xl overflow-hidden cursor-pointer",
                        "bg-card transition-all duration-200",
                        isHovered
                          ? "shadow-2xl ring-1 ring-primary/10"
                          : "shadow-sm hover:shadow-xl"
                      )}
                      onClick={() => onSelectRecording(recording)}
                    >
                      {/* Enhanced thumbnail with loading state */}
                      <div className="aspect-video relative bg-gradient-to-br from-muted/5 to-transparent overflow-hidden">
                        {recording.thumbnailUrl ? (
                          <>
                            <img
                              src={recording.thumbnailUrl}
                              alt={recording.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {/* Subtle gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-60" />
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
                              <Film className="w-8 h-8 text-muted-foreground/40 relative z-10" />
                            </div>
                          </div>
                        )}

                        {/* Enhanced play button on hover */}
                        <AnimatePresence>
                          {isHovered && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm"
                            >
                              <motion.div
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-2xl"
                              >
                                <Play className="w-6 h-6 text-black ml-0.5" fill="currentColor" />
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Duration badge */}
                        {recording.project?.timeline?.duration && recording.project.timeline.duration > 0 && (
                          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md">
                            <span className="text-[10px] font-mono text-white">
                              {formatTime(recording.project.timeline.duration / 1000)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Enhanced info section */}
                      <div className="p-3">
                        <h3 className="font-semibold text-xs text-foreground truncate mb-1.5">
                          {recording.project?.name || recording.name.replace(/^Recording_/, '').replace(/\.ssproj$/, '')}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="truncate">
                            {formatDistanceToNow(recording.timestamp, { addSuffix: true })
                              .replace('about ', '')
                              .replace('less than ', '<')}
                          </span>
                          {recording.size && (
                            <span className="font-mono ml-2">
                              {(recording.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Enhanced action buttons */}
                      <AnimatePresence>
                        {isHovered && (
                          <motion.div
                            initial={{ opacity: 0, x: 5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-2 right-2"
                          >
                            <div className="flex items-center gap-1 bg-background/95 backdrop-blur-xl rounded-lg p-1 shadow-lg">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-7 h-7 p-0 hover:bg-primary/10 hover:text-primary rounded"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Handle export
                                }}
                                title="Export"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <div className="w-px h-4 bg-muted-foreground/20" />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-7 h-7 p-0 hover:bg-destructive/10 hover:text-destructive rounded"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Handle delete
                                }}
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Spacer for virtualization */}
            <div style={{ gridColumn: '1 / -1', height: `${Math.max(0, Math.floor((recordings.length - visibleRange.end) / 6) * 180)}px` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
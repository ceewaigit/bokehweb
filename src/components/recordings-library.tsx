"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Play, Trash2, Clock, HardDrive, FileJson, Layers, Download, RefreshCw, Loader2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatTime } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { type Project } from '@/types/project'

interface Recording {
  name: string
  path: string
  timestamp: Date
  isProject?: boolean
  project?: Project
  size?: number
  videoSize?: number
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
    const cacheKey = recording.path

    // Use lightweight thumbnail generator
    const thumbnailUrl = await ThumbnailGenerator.generateThumbnail(
      videoPath,
      cacheKey,
      {
        width: 320,
        height: 180,
        quality: 0.6,
        timestamp: 0.1 // 10% into video
      }
    )

    if (thumbnailUrl) {
      recording.thumbnailUrl = thumbnailUrl
    }

    return thumbnailUrl
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
            size: file.size,
            videoSize: file.videoSize,
            isProject: true
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

                // Calculate actual duration from recordings if timeline duration is 0
                if (recording.project?.recordings && recording.project.recordings.length > 0) {
                  const totalDuration = recording.project.recordings.reduce((sum: number, rec: any) => {
                    return sum + (rec.duration || 0)
                  }, 0)

                  // Use recordings duration if timeline duration is 0 or missing
                  if (!recording.project.timeline?.duration || recording.project.timeline.duration === 0) {
                    if (!recording.project.timeline) {
                      recording.project.timeline = {
                        tracks: [],
                        duration: totalDuration
                      }
                    } else {
                      recording.project.timeline.duration = totalDuration
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

        // Remove duplicates
        const uniqueRecordings = recordingsList.reduce((acc: Recording[], current) => {
          const duplicate = acc.find(r =>
            Math.abs(r.timestamp.getTime() - current.timestamp.getTime()) < 2000 &&
            r.project?.recordings?.[0]?.filePath === current.project?.recordings?.[0]?.filePath
          )

          if (!duplicate) {
            acc.push(current)
          } else if (duplicate.name.includes('T') && !current.name.includes('T')) {
            const index = acc.indexOf(duplicate)
            acc[index] = current
          }

          return acc
        }, [])

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
      <div className="flex-1 flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-card border border-border" />
            <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-primary animate-spin" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground font-medium">Loading library...</p>
        </motion.div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 bg-card backdrop-blur-xl rounded-2xl flex items-center justify-center border border-border">
              <Film className="w-10 h-10 text-muted-foreground" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary/50 rounded-full animate-pulse" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No recordings</h2>
          <p className="text-xs text-muted-foreground mb-6">
            Start recording with the floating button
          </p>
          <div className="inline-flex items-center gap-2 text-[10px] text-muted-foreground bg-card backdrop-blur-sm px-3 py-1.5 rounded-lg border border-border">
            <HardDrive className="w-3 h-3" />
            <span className="font-mono">~/Documents/ScreenStudio</span>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background overflow-hidden">
      <div ref={containerRef} className="h-full overflow-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Compact header with shadcn tokens */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-2xl border-b border-border">
          <div className="px-4 py-2.5">
            <div className="flex items-center justify-center relative">
              <div className="flex items-center gap-3">
                <h1 className="text-sm font-medium text-foreground">Library</h1>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="w-3 h-3" />
                  <span className="font-mono">{recordings.length}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 absolute right-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] font-medium"
                  onClick={() => {
                    // Toggle record button visibility
                    if (window.electronAPI?.showRecordButton) {
                      window.electronAPI.showRecordButton()
                    }
                  }}
                  title="Show Record Button"
                >
                  <Video className="w-3 h-3 mr-1" />
                  <span>Record</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={loadRecordings}
                  title="Refresh Library"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid with virtualization */}
        <div className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
            {/* Spacer for virtualization */}
            <div style={{ gridColumn: '1 / -1', height: `${Math.floor(visibleRange.start / 6) * 180}px` }} />

            <AnimatePresence mode="popLayout">
              {visibleRecordings.map((recording, index) => {
                const actualIndex = visibleRange.start + index
                return (
                  <motion.div
                    key={recording.path}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{
                      duration: 0.15,
                      layout: { type: "spring", stiffness: 400, damping: 35 }
                    }}
                    className="group relative"
                    onMouseEnter={() => setHoveredIndex(actualIndex)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div
                      className={cn(
                        "relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200",
                        "bg-card border",
                        hoveredIndex === actualIndex
                          ? "scale-[1.02] shadow-lg border-border/50"
                          : "border-border hover:border-border/50"
                      )}
                      onClick={() => onSelectRecording(recording)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video relative bg-gradient-to-br from-muted/20 to-transparent">
                        {recording.thumbnailUrl ? (
                          <img
                            src={recording.thumbnailUrl}
                            alt={recording.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-muted/10">
                            {recording.isProject ? (
                              <FileJson className="w-6 h-6 text-muted-foreground/50" />
                            ) : (
                              <Film className="w-6 h-6 text-muted-foreground/50" />
                            )}
                          </div>
                        )}

                        {/* Minimal hover overlay - just a subtle play icon */}
                        <AnimatePresence>
                          {hoveredIndex === actualIndex && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Info section */}
                      <div className="p-2">
                        <h3 className="font-medium text-[11px] text-foreground truncate mb-1">
                          {recording.project?.name || recording.name.replace(/^Recording_/, '').replace(/\.ssproj$/, '')}
                        </h3>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          {/* Duration */}
                          {recording.project?.timeline?.duration && recording.project.timeline.duration > 0 && (
                            <div className="flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              <span className="font-mono">
                                {formatTime(recording.project.timeline.duration / 1000)}
                              </span>
                            </div>
                          )}

                          {/* Date */}
                          <div className="flex items-center gap-0.5 ml-auto">
                            <span className="truncate">{formatDistanceToNow(recording.timestamp, { addSuffix: true }).replace('about ', '').replace('less than ', '<')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Minimal hover actions - only show on hover at top right */}
                      <AnimatePresence>
                        {hoveredIndex === actualIndex && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-1 right-1 flex gap-0.5"
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-6 h-6 p-0 bg-background/80 hover:bg-background/90 backdrop-blur-xl rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-6 h-6 p-0 bg-background/80 hover:bg-destructive/20 hover:text-destructive backdrop-blur-xl rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
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
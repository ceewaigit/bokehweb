"use client"

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Play, Trash2, Layers, Download, RefreshCw, Loader2, Video, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatTime } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { ThumbnailGenerator } from '@/lib/utils/thumbnail-generator'
import { getVideoDuration } from '@/lib/utils/video-metadata'
import { type Recording as ProjectRecording, type Project } from '@/types'
import { useRecordingsLibraryStore, type LibraryRecording } from '@/stores/recordings-library-store'

interface RecordingsLibraryProps {
  onSelectRecording: (recording: LibraryRecording) => void | Promise<void>
}

export function RecordingsLibrary({ onSelectRecording }: RecordingsLibraryProps) {
  // Use store for persistent state
  const {
    recordings,
    allRecordings,
    currentPage,
    isHydrated,
    setRecordings,
    setAllRecordings,
    setCurrentPage,
    updateRecording,
    setHydrated
  } = useRecordingsLibraryStore()
  
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPageHydrating, setIsPageHydrating] = useState(false)
  const PAGE_SIZE = 24

  const generateThumbnail = useCallback(async (recording: LibraryRecording, videoPath: string) => {
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

  const loadPage = useCallback(async (page: number, sourceList?: LibraryRecording[]) => {
    const list = sourceList ?? allRecordings
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
    const normalizedPage = Math.min(Math.max(page, 1), totalPages)

    setCurrentPage(normalizedPage)

    const start = (normalizedPage - 1) * PAGE_SIZE
    const end = Math.min(list.length, start + PAGE_SIZE)

    const pageItems = list.slice(start, end)

    setRecordings(pageItems)
    setIsPageHydrating(true)

    // Helper to update a single item by path - now uses store
    const updateItemByPath = (path: string, updated: Partial<LibraryRecording>) => {
      updateRecording(path, updated)
    }

    const processItem = async (item: LibraryRecording) => {
      try {
        if (window.electronAPI?.readLocalFile) {
          const result = await window.electronAPI.readLocalFile(item.path)
          if (result?.success && result.data) {
            const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
            const project: Project = JSON.parse(projectData)

            // Update name from project if present
            updateItemByPath(item.path, { project, name: project?.name || item.name })

            // Enrich with actual video file size and duration (first recording only)
            if (project?.recordings && project.recordings.length > 0) {
              const projectDir = item.path.substring(0, item.path.lastIndexOf('/'))
              let videoPath = project.recordings[0].filePath

              if (!videoPath.startsWith('/')) {
                videoPath = `${projectDir}/${videoPath}`
              }

              // File size
              if (window.electronAPI?.getFileSize) {
                try {
                  const sizeRes = await window.electronAPI.getFileSize(videoPath)
                  if (sizeRes?.success && sizeRes.data?.size && sizeRes.data.size > 0) {
                    updateItemByPath(item.path, { size: sizeRes.data.size })
                  }
                } catch (e) {
                  console.log('Could not get video file size:', e)
                }
              }

              // Duration from the video file (only if missing)
              if ((!project?.timeline?.duration || project.timeline.duration <= 0) && window.electronAPI?.getVideoUrl) {
                try {
                  const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
                  if (videoUrl) {
                    const videoDuration = await getVideoDuration(videoUrl)
                    if (videoDuration > 0) {
                      // Update project duration values using store
                      const updatedProject = { ...item.project! }
                      updatedProject.recordings = [...updatedProject.recordings]
                      updatedProject.recordings[0] = { ...updatedProject.recordings[0] as ProjectRecording, duration: videoDuration }
                      if (!updatedProject.timeline) {
                        updatedProject.timeline = { tracks: [], duration: videoDuration, effects: [] }
                      } else {
                        updatedProject.timeline = { ...updatedProject.timeline, duration: videoDuration }
                      }
                      updateRecording(item.path, { project: updatedProject })
                    }
                  }
                } catch (e) {
                  console.log('Could not get video duration:', e)
                }
              }

              // Thumbnail generation
              try {
                const thumbnailUrl = await generateThumbnail(item, videoPath)
                if (thumbnailUrl) {
                  updateItemByPath(item.path, { thumbnailUrl })
                }
              } catch (error) {
                console.error('Failed to generate thumbnail for', item.name, error)
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to hydrate project data:', e)
      }
    }

    // Process in small chunks to limit concurrency
    const chunkSize = 4
    for (let i = 0; i < pageItems.length; i += chunkSize) {
      const chunk = pageItems.slice(i, i + chunkSize)
      await Promise.all(chunk.map(processItem))
    }

    setIsPageHydrating(false)
  }, [allRecordings, generateThumbnail])

  const loadRecordings = async (forceReload = false) => {
    // Skip if already loaded and not forcing reload
    if (isHydrated && !forceReload && allRecordings.length > 0) {
      return
    }
    
    try {
      setLoading(true)
      if (window.electronAPI?.loadRecordings) {
        const files = await window.electronAPI.loadRecordings()
        const recordingsList: LibraryRecording[] = []

        for (const file of files) {
          if (!file.path.endsWith('.ssproj')) continue

          const recording: LibraryRecording = {
            name: file.name,
            path: file.path,
            timestamp: new Date(file.timestamp),
            size: file.size
          }

          recordingsList.push(recording)
        }

        // Remove duplicates by path - keep latest by timestamp
        const uniqueMap = new Map<string, LibraryRecording>()
        recordingsList.forEach(rec => {
          const key = rec.path
          const existing = uniqueMap.get(key)
          if (!existing || rec.timestamp > existing.timestamp) {
            uniqueMap.set(key, rec)
          }
        })
        const uniqueRecordings = Array.from(uniqueMap.values())

        uniqueRecordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        setAllRecordings(uniqueRecordings)
        setHydrated(true)

        // Load first page
        await loadPage(1, uniqueRecordings)
      }
    } catch (error) {
      console.error('Failed to load recordings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Load recordings or restore current page
    if (!isHydrated) {
      loadRecordings()
    } else if (allRecordings.length > 0) {
      loadPage(currentPage, allRecordings)
    }
    
    // Hide record button when library is shown
    window.electronAPI?.minimizeRecordButton?.()
  }, [])

  // No cleanup on unmount - keep cache for fast navigation

  const totalPages = Math.max(1, Math.ceil(allRecordings.length / PAGE_SIZE))
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  const handlePrevPage = () => {
    if (canPrev) {
      loadPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (canNext) {
      loadPage(currentPage + 1)
    }
  }

  const handleSelect = async (rec: LibraryRecording) => {
    // Ensure project is loaded before selecting
    if (!rec.project) {
      try {
        if (window.electronAPI?.readLocalFile) {
          const result = await window.electronAPI.readLocalFile(rec.path)
          if (result?.success && result.data) {
            const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
            const project: Project = JSON.parse(projectData)
            rec = { ...rec, project, name: project?.name || rec.name }
          }
        }
      } catch (e) {
        console.error('Failed to load project before selection:', e)
      }
    }

    onSelectRecording(rec)
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden bg-background">
        {/* Header skeleton */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-2xl">
          <div className="px-6 py-2.5 ml-20">
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
                <div className="relative rounded-xl overflow-hidden bg-background backdrop-blur-sm border border-border/50">
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
          <div className="bg-background/80 backdrop-blur-xl rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl border border-border/50">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Loading your recordings...</span>
          </div>
        </motion.div>
      </div>
    )
  }

  if (allRecordings.length === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-2xl">
          <div className="px-6 py-2.5 ml-20">
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
    <div className="flex-1 overflow-hidden bg-background">
      <div className="h-full overflow-auto scrollbar-thin scrollbar-track-transparent">
        {/* Enhanced header */}
        <div className="sticky top-0 z-30 bg-background/95 border-b border-border">
          <div className="px-6 py-2.5 ml-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-sm font-semibold text-foreground">Library</h1>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full">
                  <Layers className="w-3 h-3" />
                  <span className="font-mono">{allRecordings.length}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Pagination controls */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handlePrevPage}
                    disabled={!canPrev}
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {currentPage}/{totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handleNextPage}
                    disabled={!canNext}
                    title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-[11px] font-medium"
                  onClick={() => loadRecordings(true)}
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
            <AnimatePresence mode="popLayout">
              {recordings.map((recording: LibraryRecording, index: number) => {
                const isHovered = hoveredIndex === index

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
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={cn(
                        "relative rounded-xl overflow-hidden cursor-pointer",
                        "bg-background/60 backdrop-blur-sm transition-all duration-200 border border-border/30",
                        isHovered
                          ? "shadow-2xl ring-1 ring-primary/10"
                          : "shadow-sm hover:shadow-xl"
                      )}
                      onClick={() => handleSelect(recording)}
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
                              {formatTime(recording.project.timeline.duration)}
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
                            <div className="flex items-center gap-1 bg-background/95 rounded-lg p-1 shadow-lg">
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
          </div>

          {isPageHydrating && (
            <div className="mt-4 flex justify-center">
              <div className="bg-background/80 backdrop-blur-xl rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-border/50">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-[10px] font-medium text-muted-foreground">Loading page…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
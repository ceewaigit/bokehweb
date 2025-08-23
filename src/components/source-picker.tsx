'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, AppWindow, X, Check, Loader2, Sparkles, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { Button } from '@/components/ui/button'

interface Source {
  id: string
  name: string
  thumbnail?: string
  type: 'screen' | 'window' | 'area'
  bounds?: { x: number; y: number; width: number; height: number }
}

interface SourcePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (sourceId: string) => void
}

export function SourcePicker({ isOpen, onClose, onSelect }: SourcePickerProps) {
  const [sources, setSources] = useState<Source[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const thumbnailCache = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (isOpen) {
      loadSources()
    }
  }, [isOpen])

  // Resize window once when opening
  useEffect(() => {
    if (isOpen) {
      // Get screen dimensions for proper sizing
      const screenWidth = window.screen.availWidth
      const screenHeight = window.screen.availHeight
      
      // Set to 90% of screen or max 1200x800
      const width = Math.min(1200, screenWidth * 0.9)
      const height = Math.min(800, screenHeight * 0.9)
      
      window.electronAPI?.setWindowContentSize?.({
        width: Math.round(width),
        height: Math.round(height)
      })
    }
  }, [isOpen])

  const loadSources = useCallback(async () => {
    if (!window.electronAPI?.getDesktopSources) {
      logger.error('Desktop sources API not available')
      return
    }

    setLoading(true)
    try {
      const desktopSources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 400, height: 240 }
      })

      const mappedSources: Source[] = desktopSources.map(source => {
        // Cache thumbnails for performance
        if (source.thumbnail && !thumbnailCache.current.has(source.id)) {
          thumbnailCache.current.set(source.id, source.thumbnail)
        }
        
        return {
          id: source.id,
          name: source.name,
          thumbnail: thumbnailCache.current.get(source.id) || source.thumbnail,
          type: source.id.startsWith('screen:') ? 'screen' : 'window',
          bounds: source.bounds // Include window bounds if available
        }
      })

      // Filter out system windows
      const filteredSources = mappedSources.filter(source => {
        const lowercaseName = source.name.toLowerCase()
        return !lowercaseName.includes('dock') && 
               !lowercaseName.includes('menubar') &&
               !lowercaseName.includes('notification') &&
               !lowercaseName.includes('screen studio - record')
      })

      // Add area selection option at the beginning
      const allSources: Source[] = [
        {
          id: 'area:selection',
          name: 'Select Area',
          type: 'area'
        },
        ...filteredSources
      ]
      
      setSources(allSources)
      
      // Pre-select the first screen
      const firstScreen = allSources.find(s => s.type === 'screen')
      if (firstScreen) {
        setSelectedId(firstScreen.id)
      }
    } catch (error) {
      logger.error('Failed to load desktop sources:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelect = async () => {
    if (selectedId) {
      if (selectedId === 'area:selection') {
        // Use native macOS area selection
        onClose() // Close the source picker first
        
        try {
          const result = await window.electronAPI?.selectScreenArea?.()
          if (result?.success && result.area) {
            // Create a custom source ID with the area dimensions
            const areaSourceId = `area:${result.area.x},${result.area.y},${result.area.width},${result.area.height}`
            onSelect(areaSourceId)
          } else if (result?.cancelled) {
            logger.info('User cancelled area selection')
            // Reopen source picker if user cancelled
            // Note: Parent component should handle this
          }
        } catch (error) {
          logger.error('Failed to select screen area:', error)
        }
      } else {
        onSelect(selectedId)
        onClose()
      }
    }
  }

  const screens = sources.filter(s => s.type === 'screen')
  const windows = sources.filter(s => s.type === 'window')
  const areaOption = sources.find(s => s.type === 'area')

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Glassmorphic backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-2xl z-[2147483649]"
            onClick={onClose}
          />

          {/* Dialog with glassmorphic design */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="fixed inset-0 flex items-center justify-center z-[2147483650] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-background/95 backdrop-blur-2xl rounded-xl shadow-2xl border border-border/50 w-[85vw] max-w-5xl h-[85vh] max-h-[700px] overflow-hidden">
              {/* Compact header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary/15 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h2 className="text-xs font-medium text-foreground">Select Recording Source</h2>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  className="h-6 w-6 p-0 rounded hover:bg-accent/50"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-3 overflow-y-auto max-h-[calc(85vh-100px)] scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-lg bg-muted/20 border border-border/50" />
                      <Loader2 className="absolute inset-0 m-auto w-5 h-5 text-primary animate-spin" />
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground font-medium">Loading sources...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Area Selection Option */}
                    {areaOption && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Maximize2 className="w-3 h-3 text-muted-foreground" />
                          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Custom Area
                          </h3>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setSelectedId(areaOption.id)}
                          className={cn(
                            "relative w-full rounded-lg overflow-hidden transition-all duration-200",
                            "bg-card/30 border",
                            selectedId === areaOption.id
                              ? "border-primary shadow-lg shadow-primary/15 bg-primary/8"
                              : "border-border/50 hover:border-primary/40 hover:bg-accent/30"
                          )}
                        >
                          <div className="aspect-[21/9] relative">
                            <div className="w-full h-full bg-gradient-to-br from-muted/10 to-transparent flex items-center justify-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                                <Maximize2 className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground">Select Screen Area</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Click and drag to select custom area
                                </p>
                              </div>
                            </div>
                            
                            {/* Selection indicator */}
                            <AnimatePresence>
                              {selectedId === areaOption.id && (
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  className="absolute top-2 right-2"
                                >
                                  <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md shadow-primary/30">
                                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.button>
                      </div>
                    )}

                    {/* Screens Section */}
                    {screens.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Monitor className="w-3 h-3 text-muted-foreground" />
                          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Displays
                          </h3>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {screens.map((source) => (
                            <motion.button
                              key={source.id}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => setSelectedId(source.id)}
                              onMouseEnter={() => setHoveredId(source.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "relative rounded-lg overflow-hidden transition-all duration-200",
                                "bg-card/30 border",
                                selectedId === source.id
                                  ? "border-primary shadow-lg shadow-primary/15 bg-primary/8"
                                  : "border-border/50 hover:border-primary/40 hover:bg-accent/30"
                              )}
                            >
                              <div className="aspect-[16/10] relative">
                                {source.thumbnail ? (
                                  <>
                                    <img 
                                      src={source.thumbnail} 
                                      alt={source.name}
                                      className="w-full h-full object-cover opacity-90"
                                    />
                                    {/* Overlay gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                  </>
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-muted/20 to-transparent flex items-center justify-center">
                                    <Monitor className="w-12 h-12 text-muted-foreground/30" />
                                  </div>
                                )}
                                
                                {/* Name overlay */}
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent">
                                  <p className="text-[11px] font-medium text-white truncate text-left">
                                    {source.name}
                                  </p>
                                  <p className="text-[9px] text-white/70">
                                    Full Display
                                  </p>
                                </div>

                                {/* Selection indicator */}
                                <AnimatePresence>
                                  {selectedId === source.id && (
                                    <motion.div
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      exit={{ scale: 0, opacity: 0 }}
                                      className="absolute top-2 right-2"
                                    >
                                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md shadow-primary/30">
                                        <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>

                                {/* Hover effect */}
                                <AnimatePresence>
                                  {hoveredId === source.id && selectedId !== source.id && (
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="absolute inset-0 bg-accent/20 backdrop-blur-sm"
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Windows Section */}
                    {windows.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AppWindow className="w-3 h-3 text-muted-foreground" />
                          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Applications
                          </h3>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                          {windows.map((source) => (
                            <motion.button
                              key={source.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSelectedId(source.id)}
                              onMouseEnter={() => setHoveredId(source.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "relative rounded overflow-hidden transition-all duration-150",
                                "bg-card/20 border",
                                selectedId === source.id
                                  ? "border-primary/40 shadow-md shadow-primary/10 bg-primary/5"
                                  : "border-border/30 hover:border-primary/30 hover:bg-accent/20"
                              )}
                            >
                              <div className="aspect-square relative">
                                {source.thumbnail ? (
                                  <>
                                    <img 
                                      src={source.thumbnail} 
                                      alt={source.name}
                                      className="w-full h-full object-cover opacity-90"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                  </>
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-muted/10 to-transparent flex items-center justify-center">
                                    <AppWindow className="w-6 h-6 text-muted-foreground/25" />
                                  </div>
                                )}
                                
                                {/* Compact name */}
                                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/40 to-transparent">
                                  <p className="text-[9px] font-medium text-white truncate">
                                    {source.name.split(' - ')[0]}
                                  </p>
                                </div>

                                {/* Selection indicator */}
                                <AnimatePresence>
                                  {selectedId === source.id && (
                                    <motion.div
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      exit={{ scale: 0, opacity: 0 }}
                                      className="absolute top-1 right-1"
                                    >
                                      <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-md shadow-primary/30">
                                        <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>

                                {/* Hover overlay */}
                                <AnimatePresence>
                                  {hoveredId === source.id && selectedId !== source.id && (
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="absolute inset-0 bg-accent/20 backdrop-blur-sm"
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {sources.length === 0 && !loading && (
                      <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-16 h-16 rounded-2xl bg-muted/30 backdrop-blur-xl border border-border flex items-center justify-center mb-4">
                          <Monitor className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground">No sources available</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Make sure you have granted screen recording permissions</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Compact footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-background/30">
                <div className="text-[9px] text-muted-foreground">
                  {selectedId && (
                    <span className="font-medium">
                      {sources.find(s => s.id === selectedId)?.name?.split(' - ')[0]}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-7 px-3 text-[11px] hover:bg-accent/50"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSelect}
                    disabled={!selectedId}
                    className={cn(
                      "h-7 px-4 text-[11px] font-medium transition-all",
                      selectedId
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/15"
                        : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <Check className="w-2.5 h-2.5 mr-1" />
                    Start Recording
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
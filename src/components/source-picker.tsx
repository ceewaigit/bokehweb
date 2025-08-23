'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, AppWindow, X, Check, Loader2, Sparkles, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { Button } from '@/components/ui/button'
import { AreaSelector } from './area-selector'

interface Source {
  id: string
  name: string
  thumbnail?: string
  type: 'screen' | 'window' | 'area'
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
  const [showAreaSelector, setShowAreaSelector] = useState(false)
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
          type: source.id.startsWith('screen:') ? 'screen' : 'window'
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

  const handleSelect = () => {
    if (selectedId) {
      if (selectedId === 'area:selection') {
        // Open area selector overlay
        setShowAreaSelector(true)
        onClose() // Close the source picker
      } else {
        onSelect(selectedId)
        onClose()
      }
    }
  }

  const handleAreaSelect = (area: { x: number; y: number; width: number; height: number }) => {
    // Create a custom source ID with the area dimensions
    const areaSourceId = `area:${area.x},${area.y},${area.width},${area.height}`
    onSelect(areaSourceId)
    setShowAreaSelector(false)
  }

  const screens = sources.filter(s => s.type === 'screen')
  const windows = sources.filter(s => s.type === 'window')
  const areaOption = sources.find(s => s.type === 'area')

  return (
    <>
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
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-[2147483650] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-background/95 backdrop-blur-3xl rounded-2xl shadow-2xl border border-border w-[90vw] max-w-6xl h-[90vh] max-h-[800px] overflow-hidden">
              {/* Minimal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 backdrop-blur-xl flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-foreground">Select Source</h2>
                    <p className="text-[10px] text-muted-foreground">Choose a screen or window to record</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 w-8 p-0 rounded-lg hover:bg-accent"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-muted/30 backdrop-blur-xl border border-border" />
                      <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-primary animate-spin" />
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground font-medium">Loading sources...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Area Selection Option */}
                    {areaOption && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded bg-muted/30 backdrop-blur-xl flex items-center justify-center">
                            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Custom Area
                          </h3>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedId(areaOption.id)}
                          className={cn(
                            "relative w-full rounded-xl overflow-hidden transition-all duration-200",
                            "bg-card/50 backdrop-blur-xl border",
                            selectedId === areaOption.id
                              ? "border-primary shadow-2xl shadow-primary/20 bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-accent/50"
                          )}
                        >
                          <div className="aspect-video relative">
                            <div className="w-full h-full bg-gradient-to-br from-muted/20 to-transparent flex flex-col items-center justify-center gap-3">
                              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                                <Maximize2 className="w-8 h-8 text-primary" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium text-foreground">Select Screen Area</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Click and drag to select a custom recording area
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
                                  className="absolute top-3 right-3"
                                >
                                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/50">
                                    <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
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
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded bg-muted/30 backdrop-blur-xl flex items-center justify-center">
                            <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Displays
                          </h3>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {screens.map((source) => (
                            <motion.button
                              key={source.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSelectedId(source.id)}
                              onMouseEnter={() => setHoveredId(source.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "relative rounded-xl overflow-hidden transition-all duration-200",
                                "bg-card/50 backdrop-blur-xl border",
                                selectedId === source.id
                                  ? "border-primary shadow-2xl shadow-primary/20 bg-primary/10"
                                  : "border-border hover:border-primary/50 hover:bg-accent/50"
                              )}
                            >
                              <div className="aspect-video relative">
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
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                  <p className="text-xs font-medium text-foreground truncate text-left">
                                    {source.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
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
                                      className="absolute top-3 right-3"
                                    >
                                      <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/50">
                                        <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
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
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded bg-muted/30 backdrop-blur-xl flex items-center justify-center">
                            <AppWindow className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Applications
                          </h3>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {windows.map((source) => (
                            <motion.button
                              key={source.id}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setSelectedId(source.id)}
                              onMouseEnter={() => setHoveredId(source.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "relative rounded-lg overflow-hidden transition-all duration-200",
                                "bg-card/50 backdrop-blur-xl border",
                                selectedId === source.id
                                  ? "border-primary/50 shadow-xl shadow-primary/20 bg-primary/5"
                                  : "border-white/[0.08] hover:border-white/20 hover:bg-white/[0.05]"
                              )}
                            >
                              <div className="aspect-[4/3] relative">
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
                                  <div className="w-full h-full bg-gradient-to-br from-muted/20 to-transparent flex items-center justify-center">
                                    <AppWindow className="w-8 h-8 text-muted-foreground/30" />
                                  </div>
                                )}
                                
                                {/* Compact name */}
                                <div className="absolute bottom-0 left-0 right-0 p-2">
                                  <p className="text-[10px] font-medium text-foreground truncate">
                                    {source.name}
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
                                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/50">
                                        <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
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

              {/* Footer with glassmorphic buttons */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-background/50 backdrop-blur-xl">
                <div className="text-[10px] text-muted-foreground">
                  {selectedId && (
                    <span>
                      Selected: <span className="font-medium text-foreground">
                        {sources.find(s => s.id === selectedId)?.name}
                      </span>
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 px-4 text-xs hover:bg-accent"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSelect}
                    disabled={!selectedId}
                    className={cn(
                      "h-8 px-6 text-xs font-medium transition-all",
                      selectedId
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <Check className="w-3 h-3 mr-1.5" />
                    Start Recording
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    
    {/* Area Selector Overlay */}
    <AreaSelector
      isOpen={showAreaSelector}
      onClose={() => setShowAreaSelector(false)}
      onSelect={handleAreaSelect}
    />
  </>
  )
}
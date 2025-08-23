'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AreaSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (area: { x: number; y: number; width: number; height: number }) => void
}

export function AreaSelector({ isOpen, onClose, onSelect }: AreaSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [endPoint, setEndPoint] = useState<{ x: number; y: number } | null>(null)
  const [screenBounds, setScreenBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Get screen dimensions
      setScreenBounds({
        width: window.screen.width,
        height: window.screen.height
      })
      
      // Make the window fullscreen and transparent for selection
      if (window.electronAPI?.setWindowContentSize) {
        window.electronAPI.setWindowContentSize({
          width: window.screen.width,
          height: window.screen.height
        })
      }

      // Handle ESC key to cancel
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel()
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleCancel])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return
    
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setStartPoint({ x, y })
    setEndPoint({ x, y })
    setIsSelecting(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !startPoint || !overlayRef.current) return
    
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setEndPoint({ x, y })
  }, [isSelecting, startPoint])

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !startPoint || !endPoint) return
    
    setIsSelecting(false)
    
    // Calculate the selected area
    const x = Math.min(startPoint.x, endPoint.x)
    const y = Math.min(startPoint.y, endPoint.y)
    const width = Math.abs(endPoint.x - startPoint.x)
    const height = Math.abs(endPoint.y - startPoint.y)
    
    // Only accept if the area is large enough
    if (width > 50 && height > 50) {
      onSelect({ x, y, width, height })
      onClose()
    } else {
      // Reset if area is too small
      setStartPoint(null)
      setEndPoint(null)
    }
  }, [isSelecting, startPoint, endPoint, onSelect, onClose])

  const handleCancel = useCallback(() => {
    setStartPoint(null)
    setEndPoint(null)
    setIsSelecting(false)
    onClose()
  }, [onClose])

  const getSelectionStyle = () => {
    if (!startPoint || !endPoint) return {}
    
    const x = Math.min(startPoint.x, endPoint.x)
    const y = Math.min(startPoint.y, endPoint.y)
    const width = Math.abs(endPoint.x - startPoint.x)
    const height = Math.abs(endPoint.y - startPoint.y)
    
    return {
      left: x,
      top: y,
      width,
      height
    }
  }

  const hasValidSelection = () => {
    if (!startPoint || !endPoint) return false
    const width = Math.abs(endPoint.x - startPoint.x)
    const height = Math.abs(endPoint.y - startPoint.y)
    return width > 50 && height > 50
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2147483647]"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isSelecting ? 'crosshair' : 'default' }}
        >
          {/* Dark overlay with hole for selection */}
          <div className="absolute inset-0 bg-black/50 pointer-events-none">
            {/* Instructions */}
            {!startPoint && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div className="bg-background/95 backdrop-blur-xl rounded-xl p-6 shadow-2xl border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Select Recording Area</h3>
                      <p className="text-xs text-muted-foreground">Click and drag to select the area you want to record</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>• Click and drag to create a selection</p>
                    <p>• The selection must be at least 50x50 pixels</p>
                    <p>• Press ESC to cancel</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Selection rectangle */}
          {(startPoint && endPoint) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
              style={getSelectionStyle()}
            >
              {/* Corner handles */}
              <div className="absolute -top-1 -left-1 w-2 h-2 bg-primary rounded-full" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-primary rounded-full" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              
              {/* Dimensions display */}
              {hasValidSelection() && (
                <div className="absolute -top-8 left-0 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-medium">
                  {Math.abs(endPoint.x - startPoint.x)} × {Math.abs(endPoint.y - startPoint.y)}
                </div>
              )}
            </motion.div>
          )}

          {/* Control buttons */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {hasValidSelection() && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => {
                  if (startPoint && endPoint) {
                    const x = Math.min(startPoint.x, endPoint.x)
                    const y = Math.min(startPoint.y, endPoint.y)
                    const width = Math.abs(endPoint.x - startPoint.x)
                    const height = Math.abs(endPoint.y - startPoint.y)
                    onSelect({ x, y, width, height })
                    onClose()
                  }
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                Confirm Selection
              </motion.button>
            )}
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleCancel}
              className="px-4 py-2 bg-background/95 backdrop-blur-xl rounded-lg shadow-lg border border-border hover:bg-accent transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <X className="w-4 h-4" />
              Cancel
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
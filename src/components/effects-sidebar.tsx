'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Camera,
  Palette,
  MousePointer,
  Square,
  Keyboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ZoomEffectData } from '@/types/project'

const WALLPAPERS = [
  { id: 'gradient-1', colors: ['#FF6B6B', '#4ECDC4'] },
  { id: 'gradient-2', colors: ['#A8E6CF', '#DCEDC1'] },
  { id: 'gradient-3', colors: ['#FFD3B6', '#FFAAA5'] },
  { id: 'gradient-4', colors: ['#8E2DE2', '#4A00E0'] },
  { id: 'gradient-5', colors: ['#81FBB8', '#28C76F'] },
  { id: 'gradient-6', colors: ['#FDBB2D', '#22A6B3'] },
  { id: 'gradient-7', colors: ['#FC466B', '#3F5EFB'] },
  { id: 'gradient-8', colors: ['#FDBB2D', '#B21F1F'] },
  { id: 'gradient-9', colors: ['#1E3C72', '#2A5298'] },
  { id: 'gradient-10', colors: ['#667EEA', '#764BA2'] },
  { id: 'gradient-11', colors: ['#F093FB', '#F5576C'] },
  { id: 'gradient-12', colors: ['#4FACFE', '#00F2FE'] },
  { id: 'gradient-13', colors: ['#43E97B', '#38F9D7'] },
  { id: 'gradient-14', colors: ['#FA709A', '#FEE140'] },
  { id: 'gradient-15', colors: ['#30CFD0', '#330867'] },
]

interface EffectsSidebarProps {
  className?: string
  selectedClip: Clip | null
  effects: Effect[] | undefined
  selectedEffectLayer?: { type: 'zoom' | 'cursor' | 'keystroke' | 'background'; id?: string } | null
  onEffectChange: (type: 'zoom' | 'cursor' | 'keystroke' | 'background', data: any) => void
}

export function EffectsSidebar({
  className,
  selectedClip,
  effects,
  selectedEffectLayer,
  onEffectChange
}: EffectsSidebarProps) {
  const { updateEffect: updateStoreEffect } = useProjectStore()
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'keystroke' | 'zoom' | 'shape'>('background')
  const [backgroundType, setBackgroundType] = useState<'wallpaper' | 'gradient' | 'color' | 'image'>('gradient')
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[] }>({ wallpapers: [] })

  // Extract current effects from the array
  const backgroundEffect = effects?.find(e => e.type === 'background' && e.enabled)
  const cursorEffect = effects?.find(e => e.type === 'cursor')
  const keystrokeEffect = effects?.find(e => e.type === 'keystroke')
  const zoomEffects = effects?.filter(e => e.type === 'zoom' && e.enabled) || []
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)

  // Update active tab when effect layer is selected
  React.useEffect(() => {
    if (selectedEffectLayer?.type) {
      setActiveTab(selectedEffectLayer.type as any)
    }
  }, [selectedEffectLayer])

  // Sync backgroundType with actual background effect type
  React.useEffect(() => {
    if (backgroundEffect?.data) {
      const bgData = backgroundEffect.data as BackgroundEffectData
      if (bgData.type) {
        setBackgroundType(bgData.type as any)
      }
    }
  }, [backgroundEffect])

  // Load macOS wallpapers when wallpaper tab is selected
  React.useEffect(() => {
    if (backgroundType === 'wallpaper' && macOSWallpapers.wallpapers.length === 0 && !loadingWallpapers) {
      setLoadingWallpapers(true)

      // Check if API is available
      if (window.electronAPI?.getMacOSWallpapers) {
        window.electronAPI.getMacOSWallpapers()
          .then((data) => {
            if (data?.wallpapers) {
              setMacOSWallpapers({ wallpapers: data.wallpapers })
            } else {
              setMacOSWallpapers({ wallpapers: [] })
            }
            setLoadingWallpapers(false)
          })
          .catch((error) => {
            console.error('Failed to load macOS wallpapers:', error)
            // Set empty data on error so UI can show "no wallpapers" instead of stuck loading
            setMacOSWallpapers({ wallpapers: [] })
            setLoadingWallpapers(false)
          })
      } else {
        // API not available - set empty wallpapers list
        setMacOSWallpapers({ wallpapers: [] })
        setLoadingWallpapers(false)
      }
    }
  }, [backgroundType])

  // Allow global effects editing even when no clip is selected
  // If effects are undefined, show an empty panel rather than "No clip selected"

  const updateEffect = (category: 'background' | 'cursor' | 'zoom' | 'keystroke', updates: any) => {
    // For cursor effects, preserve all existing data
    if (category === 'cursor' && cursorEffect) {
      const currentData = cursorEffect.data as CursorEffectData
      onEffectChange(category, { ...currentData, ...updates })
    } else if (category === 'keystroke' && keystrokeEffect) {
      const currentData = keystrokeEffect.data as KeystrokeEffectData
      onEffectChange(category, { ...currentData, ...updates })
    } else {
      onEffectChange(category, updates)
    }
  }

  // Update background while preserving existing properties
  const updateBackgroundEffect = useCallback((updates: any) => {
    // If no background effect exists, create it with sensible defaults
    if (!backgroundEffect) {
      onEffectChange('background', {
        type: updates.type || 'gradient',
        gradient: {
          type: 'linear',
          colors: ['#2D3748', '#1A202C'],
          angle: 135
        },
        padding: 40,
        cornerRadius: 15,
        shadowIntensity: 85,
        ...updates
      })
      return
    }

    const currentBg = backgroundEffect.data as BackgroundEffectData

    updateEffect('background', {
      ...currentBg,
      ...updates
    })
  }, [backgroundEffect, onEffectChange, updateEffect])

  // Frame-synced background updates to avoid lag
  const bgRafIdRef = useRef<number | null>(null)
  const pendingBgUpdateRef = useRef<any | null>(null)

  const scheduleBackgroundUpdate = useCallback((updates: any) => {
    // Merge with any pending updates in the same frame
    pendingBgUpdateRef.current = { ...(pendingBgUpdateRef.current || {}), ...updates }

    if (bgRafIdRef.current !== null) return

    bgRafIdRef.current = requestAnimationFrame(() => {
      bgRafIdRef.current = null
      const pending = pendingBgUpdateRef.current
      pendingBgUpdateRef.current = null
      if (pending) updateBackgroundEffect(pending)
    })
  }, [updateBackgroundEffect])

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (bgRafIdRef.current !== null) {
        cancelAnimationFrame(bgRafIdRef.current)
        bgRafIdRef.current = null
      }
    }
  }, [])

  return (
    <div className={cn("flex bg-background/95 border-l border-border/50 w-full", className)}>
      {/* Left sidebar with section tabs - fixed width */}
      <div className="w-14 flex-shrink-0 flex flex-col items-center py-3 border-r border-border/30">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('background')}
            className={cn(
              "p-2 rounded-md transition-all",
              activeTab === 'background'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Background"
          >
            <Palette className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('cursor')}
            className={cn(
              "p-2 rounded-md transition-all",
              activeTab === 'cursor'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Cursor"
          >
            <MousePointer className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('keystroke')}
            className={cn(
              "p-2 rounded-md transition-all",
              activeTab === 'keystroke'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Keystroke"
          >
            <Keyboard className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('zoom')}
            className={cn(
              "p-2 rounded-md transition-all",
              activeTab === 'zoom'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Zoom"
          >
            <Camera className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('shape')}
            className={cn(
              "p-2 rounded-md transition-all",
              activeTab === 'shape'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Shape"
          >
            <Square className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Right content area - flexible width */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Selection Indicator */}
        {selectedEffectLayer && (
          <div className="px-3 py-1.5 bg-primary/5">
            <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
              {selectedEffectLayer.type === 'zoom' && selectedEffectLayer.id ?
                `Zoom Block` :
                selectedEffectLayer.type} Layer
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-3 space-y-3">
          {activeTab === 'background' && (
            <div className="space-y-3">
              {/* Background Section Header */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  <span>Background</span>
                </h3>

                {/* Horizontal Background Type Tabs */}
                <div className="flex gap-1 p-0.5 bg-background/50 rounded-md">
                  {(['wallpaper', 'gradient', 'color', 'image'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setBackgroundType(type)
                        // Don't update the actual background until user selects something
                        // This prevents the background from disappearing when switching tabs
                      }}
                      className={cn(
                        "flex-1 py-1.5 px-2 rounded-sm text-xs font-medium transition-all capitalize",
                        backgroundType === type
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/30 pt-3">

                {/* macOS Wallpapers */}
                {backgroundType === 'wallpaper' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium">Wallpaper</h3>
                    </div>
                    {loadingWallpapers ? (
                      <div className="text-xs text-muted-foreground">Loading wallpapers...</div>
                    ) : macOSWallpapers.wallpapers.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {macOSWallpapers.wallpapers.slice(0, 12).map((wallpaper, index) => {
                          const wallpaperId = `${wallpaper.path}-${index}`
                          const isLoading = loadingWallpaperId === wallpaperId

                          return (
                            <button
                              key={index}
                              onClick={async () => {
                                setLoadingWallpaperId(wallpaperId)
                                try {
                                  const dataUrl = await window.electronAPI?.loadWallpaperImage?.(wallpaper.path)
                                  if (dataUrl) {
                                    updateBackgroundEffect({
                                      type: 'wallpaper',
                                      wallpaper: dataUrl
                                    })
                                  }
                                } catch (error) {
                                  console.error('Failed to load wallpaper:', error)
                                  // Show error state - don't revert to gradient
                                } finally {
                                  setLoadingWallpaperId(null)
                                }
                              }}
                              disabled={isLoading}
                              className="aspect-video rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105 relative group disabled:opacity-50 disabled:cursor-wait"
                              title={wallpaper.name}
                            >
                              {wallpaper.thumbnail ? (
                                <img
                                  src={wallpaper.thumbnail}
                                  alt={wallpaper.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20" />
                              )}
                              {isLoading && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <div className="w-4 h-4  border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                              )}
                              <span className="absolute bottom-0 left-0 right-0 p-1 bg-black/50 text-[8px] text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                {wallpaper.name}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No wallpapers found. Use gradient presets instead.
                      </div>
                    )}
                  </div>
                )}

                {/* Gradient Presets */}
                {backgroundType === 'gradient' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium">Gradient</h3>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {WALLPAPERS.map(wallpaper => (
                        <button
                          key={wallpaper.id}
                          onClick={() => {
                            updateBackgroundEffect({
                              type: 'gradient',
                              gradient: {
                                type: 'linear',
                                colors: wallpaper.colors,
                                angle: 135
                              }
                            })
                          }}
                          className="aspect-square rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105"
                          style={{
                            background: `linear-gradient(135deg, ${wallpaper.colors[0]}, ${wallpaper.colors[1]})`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Solid Color */}
                {backgroundType === 'color' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium">Color</h3>
                    </div>

                    {/* Color picker - streamlined single section */}
                    <div className="flex gap-2 items-center p-3 bg-background/30 rounded-lg ">
                      <input
                        type="color"
                        value={(backgroundEffect?.data as BackgroundEffectData)?.type === 'color' ? ((backgroundEffect?.data as BackgroundEffectData)?.color || '#000000') : '#000000'}
                        onChange={(e) => {
                          updateBackgroundEffect({
                            type: 'color',
                            color: e.target.value
                          })
                        }}
                        className="w-12 h-12 rounded-md cursor-pointer border-0 bg-transparent"
                        style={{ backgroundColor: (backgroundEffect?.data as BackgroundEffectData)?.type === 'color' ? ((backgroundEffect?.data as BackgroundEffectData)?.color || '#000000') : '#000000' }}
                      />
                      <input
                        type="text"
                        value={(backgroundEffect?.data as BackgroundEffectData)?.type === 'color' ? ((backgroundEffect?.data as BackgroundEffectData)?.color || '#000000') : '#000000'}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow typing and validate on complete hex
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                            if (value.length === 7) {
                              updateBackgroundEffect({
                                type: 'color',
                                color: value
                              })
                            }
                          }
                        }}
                        onBlur={(e) => {
                          // Apply color on blur even if incomplete
                          if (e.target.value.length > 0) {
                            updateBackgroundEffect({
                              type: 'color',
                              color: e.target.value.padEnd(7, '0')
                            })
                          }
                        }}
                        className="flex-1 px-3 py-2 text-sm font-mono bg-background/50  rounded"
                        placeholder="#000000"
                        maxLength={7}
                      />
                    </div>

                    {/* Preset colors */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {[
                        '#000000', '#FFFFFF', '#EF4444', '#10B981', '#3B82F6', '#F59E0B',
                        '#8B5CF6', '#EC4899', '#14B8A6', '#64748B', '#1E293B', '#F1F5F9'
                      ].map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            updateBackgroundEffect({
                              type: 'color',
                              color
                            })
                          }}
                          className={cn(
                            "aspect-square rounded-md  transition-all hover:scale-110",
                            (backgroundEffect?.data as BackgroundEffectData)?.type === 'color' && (backgroundEffect?.data as BackgroundEffectData)?.color?.toUpperCase() === color.toUpperCase()
                              ? "ring-2 ring-primary shadow-lg"
                              : "ring-1 ring-border/30 hover:ring-border/50"
                          )}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Image */}
                {backgroundType === 'image' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium">Image</h3>
                    </div>
                    <button
                      onClick={async () => {
                        // Use electron file dialog to select image
                        if (window.electronAPI?.selectImageFile && window.electronAPI?.loadImageAsDataUrl) {
                          const imagePath = await window.electronAPI.selectImageFile()
                          if (imagePath) {
                            // Load the image as data URL
                            const dataUrl = await window.electronAPI.loadImageAsDataUrl(imagePath)
                            if (dataUrl) {
                              updateBackgroundEffect({
                                type: 'image',
                                image: dataUrl
                              })
                            }
                          }
                        }
                      }}
                      className="w-full py-2 px-3 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
                    >
                      Choose Image File...
                    </button>
                    {(backgroundEffect?.data as BackgroundEffectData)?.image && (
                      <div className="relative aspect-video rounded-md overflow-hidden ring-1 ring-border/20">
                        <img
                          src={(backgroundEffect?.data as BackgroundEffectData).image}
                          alt="Background"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => {
                            updateBackgroundEffect({
                              type: 'image',
                              image: undefined
                            })
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded text-white text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Background Blur - Only show for image-based backgrounds */}
                {(backgroundType === 'wallpaper' || backgroundType === 'image') && (
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium">Background blur</h3>
                    </div>
                    <div className="p-3 bg-background/30 rounded-lg">
                      <div className='pb-4'>
                        <label className="text-xs font-medium flex items-center justify-between">
                          <span className="uppercase tracking-wider text-[10px]">Enable Blur</span>
                          <Switch
                            checked={(() => {
                              const bgData = backgroundEffect?.data as BackgroundEffectData
                              return bgData?.blur ? bgData.blur > 0 : false
                            })()}
                            onCheckedChange={(checked) =>
                              updateBackgroundEffect({ blur: checked ? 10 : undefined })
                            }
                          />
                        </label>
                      </div>
                      {(() => {
                        const bgData = backgroundEffect?.data as BackgroundEffectData
                        return bgData?.blur && bgData.blur > 0
                      })() && (
                          <>
                            <Slider
                              value={[(() => {
                                const bgData = backgroundEffect?.data as BackgroundEffectData
                                return bgData?.blur || 10
                              })()]}
                              onValueChange={([value]) => updateBackgroundEffect({ blur: value })}
                              onValueCommit={([value]) => updateBackgroundEffect({ blur: value })}
                              min={1}
                              max={50}
                              step={1}
                              className="w-full"
                            />
                            <span className="text-[10px] text-muted-foreground/70 font-mono">{(() => {
                              const bgData = backgroundEffect?.data as BackgroundEffectData
                              return bgData?.blur || 10
                            })()}px</span>
                          </>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'cursor' && (
            <div className="space-y-3">
              {/* Master cursor visibility toggle */}
              <div className="p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium flex items-center justify-between">
                  <span className="uppercase tracking-wider text-[10px]">Show Cursor</span>
                  <Switch
                    checked={cursorEffect?.enabled ?? false}
                    onCheckedChange={(checked) => {
                      if (cursorEffect) {
                        // Update existing cursor effect's enabled state
                        const currentData = cursorEffect.data as CursorEffectData
                        onEffectChange('cursor', { ...currentData, enabled: checked })
                      } else {
                        // Create new cursor effect
                        onEffectChange('cursor', {
                          style: 'default',
                          size: 3.0,
                          color: '#ffffff',
                          clickEffects: true,
                          motionBlur: false,
                          hideOnIdle: false,
                          idleTimeout: 3000,
                          enabled: checked
                        })
                      }
                    }}
                  />
                </label>
              </div>

              {/* Only show cursor settings when enabled */}
              {cursorEffect?.enabled && (
                <>
                  <div className="space-y-2 p-3 bg-background/30 rounded-lg ">
                    <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Size</label>
                    <Slider
                      value={[(cursorEffect?.data as CursorEffectData).size ?? 3.0]}
                      onValueChange={([value]) => updateEffect('cursor', { size: value })}
                      onValueCommit={([value]) => updateEffect('cursor', { size: value })}
                      min={0.5}
                      max={8}
                      step={0.1}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{((cursorEffect?.data as CursorEffectData).size ?? 3.0).toFixed(1)}x</span>
                  </div>

                  <div className="p-3 bg-background/30 rounded-lg ">
                    <label className="text-xs font-medium flex items-center justify-between">
                      <span className="uppercase tracking-wider text-[10px]">Click Animation</span>
                      <Switch
                        checked={(cursorEffect?.data as CursorEffectData).clickEffects ?? false}
                        onCheckedChange={(checked) =>
                          updateEffect('cursor', { clickEffects: checked })
                        }
                      />
                    </label>
                  </div>

                  <div className="p-3 bg-background/30 rounded-lg ">
                    <label className="text-xs font-medium flex items-center justify-between">
                      <span className="uppercase tracking-wider text-[10px]">Motion Blur</span>
                      <Switch
                        checked={(cursorEffect?.data as CursorEffectData).motionBlur ?? false}
                        onCheckedChange={(checked) =>
                          updateEffect('cursor', { motionBlur: checked })
                        }
                      />
                    </label>
                  </div>

                  <div className="p-3 bg-background/30 rounded-lg ">
                    <label className="text-xs font-medium flex items-center justify-between">
                      <span className="uppercase tracking-wider text-[10px]">Hide When Idle</span>
                      <Switch
                        checked={(cursorEffect?.data as CursorEffectData).hideOnIdle ?? false}
                        onCheckedChange={(checked) =>
                          updateEffect('cursor', { hideOnIdle: checked })
                        }
                      />
                    </label>
                  </div>

                  {(cursorEffect?.data as CursorEffectData).hideOnIdle && (
                    <div className="space-y-2 p-3 bg-background/30 rounded-lg ">
                      <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Idle Timeout</label>
                      <Slider
                        value={[((cursorEffect?.data as CursorEffectData).idleTimeout ?? 3000) / 1000]}
                        onValueChange={([value]) => updateEffect('cursor', { idleTimeout: value * 1000 })}
                        onValueCommit={([value]) => updateEffect('cursor', { idleTimeout: value * 1000 })}
                        min={1}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                      <span className="text-[10px] text-muted-foreground/70 font-mono">{(((cursorEffect?.data as CursorEffectData).idleTimeout ?? 3000) / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'keystroke' && (
            <div className="space-y-3">
              {/* Master keystroke visibility toggle */}
              <div className="p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium flex items-center justify-between">
                  <span className="uppercase tracking-wider text-[10px]">Show Keystrokes</span>
                  <Switch
                    checked={keystrokeEffect?.enabled ?? false}
                    onCheckedChange={(checked) => {
                      if (keystrokeEffect) {
                        // Update existing keystroke effect's enabled state
                        const currentData = keystrokeEffect.data as KeystrokeEffectData
                        onEffectChange('keystroke', { ...currentData, enabled: checked })
                      } else {
                        // Create new keystroke effect
                        onEffectChange('keystroke', {
                          position: 'bottom-center',
                          fontSize: 16,
                          backgroundColor: 'rgba(0, 0, 0, 0.8)',
                          textColor: '#ffffff',
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                          borderRadius: 6,
                          padding: 12,
                          fadeOutDuration: 300,
                          maxWidth: 300,
                          enabled: checked
                        })
                      }
                    }}
                  />
                </label>
              </div>

              {/* Keystroke settings */}
              {keystrokeEffect?.enabled && (
                <>
                  <div className="space-y-2 p-3 bg-background/30 rounded-lg">
                    <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Position</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['bottom-center', 'bottom-right', 'top-center'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => updateEffect('keystroke', { position: pos })}
                          className={cn(
                            "px-2 py-1 text-[10px] rounded transition-all",
                            (keystrokeEffect?.data as KeystrokeEffectData)?.position === pos
                              ? "bg-primary/20 text-primary"
                              : "bg-background/50 text-muted-foreground hover:bg-background/70"
                          )}
                        >
                          {pos.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 p-3 bg-background/30 rounded-lg">
                    <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Font Size</label>
                    <Slider
                      value={[(keystrokeEffect?.data as KeystrokeEffectData)?.fontSize ?? 16]}
                      onValueChange={([value]) => updateEffect('keystroke', { fontSize: value })}
                      onValueCommit={([value]) => updateEffect('keystroke', { fontSize: value })}
                      min={12}
                      max={24}
                      step={1}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{(keystrokeEffect?.data as KeystrokeEffectData)?.fontSize ?? 16}px</span>
                  </div>

                  <div className="space-y-2 p-3 bg-background/30 rounded-lg">
                    <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Fade Duration</label>
                    <Slider
                      value={[((keystrokeEffect?.data as KeystrokeEffectData)?.fadeOutDuration ?? 300) / 100]}
                      onValueChange={([value]) => updateEffect('keystroke', { fadeOutDuration: value * 100 })}
                      onValueCommit={([value]) => updateEffect('keystroke', { fadeOutDuration: value * 100 })}
                      min={1}
                      max={10}
                      step={0.5}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{(((keystrokeEffect?.data as KeystrokeEffectData)?.fadeOutDuration ?? 300) / 100).toFixed(1)}s</span>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'zoom' && (
            <div className="space-y-3">
              {/* Show specific zoom block controls if one is selected */}
              {selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id && (() => {
                const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
                if (!selectedBlock) return null
                const zoomData = selectedBlock.data as ZoomEffectData
                if (!zoomData) return null

                return (
                  <div key={`zoom-block-${selectedEffectLayer.id}`}>
                    <div className="p-3 bg-primary/5 rounded-lg border ring-2 ring-primary/20 space-y-3">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-primary/80">Block Settings</h4>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scale</label>
                        <Slider
                          key={`scale-${selectedEffectLayer.id}`}
                          value={[zoomData.scale ?? 2.0]}
                          onValueChange={([value]) => {
                            // Update the specific zoom effect block directly in the store
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  scale: value
                                }
                              })
                            }
                          }}
                          onValueCommit={([value]) => {
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  scale: value
                                }
                              })
                            }
                          }}
                          min={1}
                          max={4}
                          step={0.1}
                          className="w-full"
                        />
                        <span className="text-[10px] text-muted-foreground/70 font-mono">{(zoomData.scale ?? 2.0).toFixed(1)}x</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Intro</label>
                        <Slider
                          key={`intro-${selectedEffectLayer.id}`}
                          value={[zoomData.introMs || 500]}
                          onValueChange={([value]) => {
                            // Update the specific zoom effect block directly in the store
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  introMs: value
                                }
                              })
                            }
                          }}
                          onValueCommit={([value]) => {
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  introMs: value
                                }
                              })
                            }
                          }}
                          min={0}
                          max={1000}
                          step={50}
                          className="w-full"
                        />
                        {(zoomData.introMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{zoomData.introMs}ms</span>}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outro</label>
                        <Slider
                          key={`outro-${selectedEffectLayer.id}`}
                          value={[zoomData.outroMs || 500]}
                          onValueChange={([value]) => {
                            // Update the specific zoom effect block directly in the store
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  outroMs: value
                                }
                              })
                            }
                          }}
                          onValueCommit={([value]) => {
                            if (selectedEffectLayer.id) {
                              updateStoreEffect(selectedEffectLayer.id, {
                                data: {
                                  ...zoomData,
                                  outroMs: value
                                }
                              })
                            }
                          }}
                          min={0}
                          max={1000}
                          step={50}
                          className="w-full"
                        />
                        {(zoomData.outroMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{zoomData.outroMs}ms</span>}
                      </div>
                    </div>
                    <div className=" pt-3" />
                  </div>
                )
              }
              )()}

              <div className="p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium flex items-center justify-between">
                  <span className="uppercase tracking-wider text-[10px]">Zoom Effects</span>
                  <Switch
                    checked={zoomEffects.length > 0}
                    onCheckedChange={(checked) =>
                      updateEffect('zoom', { enabled: checked })
                    }
                  />
                </label>
              </div>

              {/* Reset Zoom Detection Button */}
              <div className="pt-3 ">
                <button
                  onClick={() => {
                    // Trigger zoom detection reset
                    updateEffect('zoom', {
                      regenerate: Date.now() // Add timestamp to trigger regeneration
                    })
                  }}
                  className="w-full px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium bg-background/50 hover:bg-background/70  rounded-md transition-all"
                >
                  Reset Zoom Detection
                </button>
                <p className="text-[9px] text-muted-foreground/60 mt-1.5 italic">
                  Re-analyze mouse movements
                </p>
              </div>

            </div>
          )}

          {activeTab === 'shape' && (
            <div className="space-y-3">
              <div className="space-y-2 p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Padding</label>
                <Slider
                  value={[(backgroundEffect?.data as BackgroundEffectData).padding || 0]}
                  onValueChange={([value]) => scheduleBackgroundUpdate({
                    padding: value
                  })}
                  onValueCommit={([value]) => updateBackgroundEffect({
                    padding: value
                  })}
                  min={0}
                  max={200}
                  step={5}
                  className="w-full"
                />
                {((backgroundEffect?.data as BackgroundEffectData).padding || 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{(backgroundEffect?.data as BackgroundEffectData).padding}px</span>
                    <button
                      onClick={() => updateBackgroundEffect({
                        padding: 40
                      })}
                      className="text-[9px] text-primary/70 hover:text-primary uppercase tracking-wider"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Corner Radius</label>
                <Slider
                  value={[(backgroundEffect?.data as BackgroundEffectData).cornerRadius ?? 15]}
                  onValueChange={([value]) => scheduleBackgroundUpdate({
                    cornerRadius: value
                  })}
                  onValueCommit={([value]) => updateBackgroundEffect({
                    cornerRadius: value
                  })}
                  min={0}
                  max={50}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{(backgroundEffect?.data as BackgroundEffectData).cornerRadius ?? 15}px</span>
                  {(backgroundEffect?.data as BackgroundEffectData).cornerRadius !== 15 && (
                    <button
                      onClick={() => updateBackgroundEffect({
                        cornerRadius: 15
                      })}
                      className="text-[9px] text-primary/70 hover:text-primary uppercase tracking-wider"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 p-3 bg-background/30 rounded-lg ">
                <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Shadow Intensity</label>
                <Slider
                  value={[(backgroundEffect?.data as BackgroundEffectData).shadowIntensity ?? 85]}
                  onValueChange={([value]) => scheduleBackgroundUpdate({
                    shadowIntensity: value
                  })}
                  onValueCommit={([value]) => updateBackgroundEffect({
                    shadowIntensity: value
                  })}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{(backgroundEffect?.data as BackgroundEffectData).shadowIntensity ?? 85}%</span>
                  {(backgroundEffect?.data as BackgroundEffectData).shadowIntensity !== 85 && (
                    <button
                      onClick={() => updateBackgroundEffect({
                        shadowIntensity: 85
                      })}
                      className="text-[9px] text-primary/70 hover:text-primary uppercase tracking-wider"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
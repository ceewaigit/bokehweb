'use client'

import React, { useState } from 'react'
import {
  Camera,
  Palette,
  MousePointer,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { Clip, ClipEffects } from '@/types/project'

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
  effects: ClipEffects | undefined
  selectedEffectLayer?: { type: 'zoom' | 'cursor' | 'background'; id?: string } | null
  onEffectChange: (effects: ClipEffects) => void
}

export function EffectsSidebar({
  className,
  selectedClip,
  effects,
  selectedEffectLayer,
  onEffectChange
}: EffectsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'zoom' | 'shape'>('background')
  const [backgroundType, setBackgroundType] = useState<'wallpaper' | 'gradient' | 'color' | 'image'>('gradient')
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[] }>({ wallpapers: [] })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)

  // Update active tab when effect layer is selected
  React.useEffect(() => {
    if (selectedEffectLayer?.type) {
      setActiveTab(selectedEffectLayer.type as any)
    }
  }, [selectedEffectLayer])


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

  if (!selectedClip || !effects) {
    return (
      <div className={cn("bg-card/30 backdrop-blur-md border-l border-border/50 p-4", className)}>
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">No clip selected</p>
      </div>
    )
  }

  const updateEffect = (category: string, updates: any) => {
    if (!effects || !selectedClip) return

    // Use the passed callback to handle effect changes properly
    // This ensures local effects and zoom block updates work correctly
    const updatedEffects = {
      ...effects,
      [category]: {
        ...effects[category as keyof ClipEffects],
        ...updates
      }
    }
    onEffectChange(updatedEffects)
  }

  // Update background while preserving existing properties
  const updateBackgroundEffect = (updates: any) => {
    if (!effects || !selectedClip) return
    
    updateEffect('background', {
      ...effects.background,
      ...updates
    })
  }

  return (
    <div className={cn("bg-gradient-to-b from-background/95 to-background/90 backdrop-blur-xl flex flex-col", className)}>
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

      {/* Section Tabs */}
      <div className="flex gap-0.5 p-2">
        <button
          onClick={() => setActiveTab('background')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'background'
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Palette className="w-3 h-3" />
          <span className="hidden sm:inline">BG</span>
        </button>
        <button
          onClick={() => setActiveTab('cursor')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'cursor'
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <MousePointer className="w-3 h-3" />
          <span className="hidden sm:inline">Cursor</span>
        </button>
        <button
          onClick={() => setActiveTab('zoom')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'zoom'
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Camera className="w-3 h-3" />
          <span className="hidden sm:inline">Zoom</span>
        </button>
        <button
          onClick={() => setActiveTab('shape')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'shape'
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Square className="w-3 h-3" />
          <span className="hidden sm:inline">Shape</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'background' && (
          <div className="space-y-3">
            {/* Background Type Tabs */}
            <div className="flex gap-1 p-0.5 bg-card/50 rounded-md">
              {(['wallpaper', 'gradient', 'color', 'image'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setBackgroundType(type)
                    // Don't update the actual background until user selects something
                    // This prevents the background from disappearing when switching tabs
                  }}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-sm text-[10px] uppercase tracking-wider font-medium transition-all",
                    backgroundType === type
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* macOS Wallpapers */}
            {backgroundType === 'wallpaper' && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">macOS Wallpapers</h3>
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
              <div className="space-y-2">
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Presets</h3>
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
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Solid Color</h3>

                {/* Color picker - streamlined single section */}
                <div className="flex gap-2 items-center p-3 bg-card/30 rounded-lg ">
                  <input
                    type="color"
                    value={effects.background?.type === 'color' ? (effects.background?.color || '#000000') : '#000000'}
                    onChange={(e) => {
                      updateBackgroundEffect({
                        type: 'color',
                        color: e.target.value
                      })
                    }}
                    className="w-12 h-12 rounded-md cursor-pointer border-0 bg-transparent"
                    style={{ backgroundColor: effects.background?.type === 'color' ? (effects.background?.color || '#000000') : '#000000' }}
                  />
                  <input
                    type="text"
                    value={effects.background?.type === 'color' ? (effects.background?.color || '#000000') : '#000000'}
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
                        effects.background?.type === 'color' && effects.background?.color?.toUpperCase() === color.toUpperCase()
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
              <div className="space-y-2">
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Custom Image</h3>
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
                {effects.background?.image && (
                  <div className="relative aspect-video rounded-md overflow-hidden ring-1 ring-border/20">
                    <img
                      src={effects.background.image}
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
              <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
                <label className="text-xs font-medium flex items-center justify-between">
                  <span className="uppercase tracking-wider text-[10px]">Blur</span>
                  <Switch
                    checked={effects.background.blur !== undefined && effects.background.blur > 0}
                    onCheckedChange={(checked) =>
                      updateBackgroundEffect({ blur: checked ? 10 : undefined })
                    }
                  />
                </label>
                {effects.background.blur !== undefined && effects.background.blur > 0 && (
                  <>
                    <Slider
                      value={[effects.background.blur]}
                      onValueChange={([value]) => updateBackgroundEffect({ blur: value })}
                      min={1}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.background.blur}px</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cursor' && effects?.cursor && (
          <div className="space-y-3">
            {/* Master cursor visibility toggle */}
            <div className="p-3 bg-card/30 rounded-lg ">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Show Cursor</span>
                <Switch
                  checked={effects.cursor.enabled ?? false}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { enabled: checked })
                  }
                />
              </label>
            </div>

            {/* Only show cursor settings when enabled */}
            {effects.cursor.enabled && (
              <>
                <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
                  <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Size</label>
                  <Slider
                    value={[effects.cursor.size ?? 3.0]}
                    onValueChange={([value]) => updateEffect('cursor', { size: value })}
                    min={0.5}
                    max={8}
                    step={0.1}
                    className="w-full"
                  />
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{(effects.cursor.size ?? 3.0).toFixed(1)}x</span>
                </div>

                <div className="p-3 bg-card/30 rounded-lg ">
                  <label className="text-xs font-medium flex items-center justify-between">
                    <span className="uppercase tracking-wider text-[10px]">Click Animation</span>
                    <Switch
                      checked={effects.cursor.clickEffects ?? false}
                      onCheckedChange={(checked) =>
                        updateEffect('cursor', { clickEffects: checked })
                      }
                    />
                  </label>
                </div>

                <div className="p-3 bg-card/30 rounded-lg ">
                  <label className="text-xs font-medium flex items-center justify-between">
                    <span className="uppercase tracking-wider text-[10px]">Motion Blur</span>
                    <Switch
                      checked={effects.cursor.motionBlur ?? false}
                      onCheckedChange={(checked) =>
                        updateEffect('cursor', { motionBlur: checked })
                      }
                    />
                  </label>
                </div>

                <div className="p-3 bg-card/30 rounded-lg ">
                  <label className="text-xs font-medium flex items-center justify-between">
                    <span className="uppercase tracking-wider text-[10px]">Hide When Idle</span>
                    <Switch
                      checked={effects.cursor.hideOnIdle ?? false}
                      onCheckedChange={(checked) =>
                        updateEffect('cursor', { hideOnIdle: checked })
                      }
                    />
                  </label>
                </div>

                {effects.cursor.hideOnIdle && (
                  <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
                    <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Idle Timeout</label>
                    <Slider
                      value={[(effects.cursor.idleTimeout ?? 3000) / 1000]}
                      onValueChange={([value]) => updateEffect('cursor', { idleTimeout: value * 1000 })}
                      min={1}
                      max={10}
                      step={0.5}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{((effects.cursor.idleTimeout ?? 3000) / 1000).toFixed(1)}s</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'zoom' && effects?.zoom && (
          <div className="space-y-3">
            {/* Show specific zoom block controls if one is selected */}
            {selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id && effects.zoom.blocks && (() => {
              const selectedBlock = effects.zoom.blocks.find((b: any) => b.id === selectedEffectLayer.id)
              if (!selectedBlock) return null

              return (
                <div key={`zoom-block-${selectedEffectLayer.id}`}>
                  <div className="p-3 bg-primary/5 rounded-lg border ring-2 ring-primary/20 space-y-3">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-primary/80">Block Settings</h4>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scale</label>
                      <Slider
                        key={`scale-${selectedEffectLayer.id}`}
                        value={[selectedBlock.scale]}
                        onValueChange={([value]) => {
                          const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                            b.id === selectedBlock.id ? { ...b, scale: value } : b
                          )
                          updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                        }}
                        min={1}
                        max={4}
                        step={0.1}
                        className="w-full"
                      />
                      <span className="text-[10px] text-muted-foreground/70 font-mono">{selectedBlock.scale.toFixed(1)}x</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Intro</label>
                      <Slider
                        key={`intro-${selectedEffectLayer.id}`}
                        value={[selectedBlock.introMs || 500]}
                        onValueChange={([value]) => {
                          const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                            b.id === selectedBlock.id ? { ...b, introMs: value } : b
                          )
                          updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                        }}
                        min={0}
                        max={1000}
                        step={50}
                        className="w-full"
                      />
                      {(selectedBlock.introMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{selectedBlock.introMs}ms</span>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outro</label>
                      <Slider
                        key={`outro-${selectedEffectLayer.id}`}
                        value={[selectedBlock.outroMs || 500]}
                        onValueChange={([value]) => {
                          const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                            b.id === selectedBlock.id ? { ...b, outroMs: value } : b
                          )
                          updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                        }}
                        min={0}
                        max={1000}
                        step={50}
                        className="w-full"
                      />
                      {(selectedBlock.outroMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{selectedBlock.outroMs}ms</span>}
                    </div>
                  </div>
                  <div className=" pt-3" />
                </div>
              )
            })()}

            <div className="p-3 bg-card/30 rounded-lg ">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Auto Zoom</span>
                <Switch
                  checked={effects.zoom.enabled ?? false}
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
                  // Trigger zoom detection reset - keep existing blocks until new ones are generated
                  updateEffect('zoom', {
                    ...effects.zoom,
                    regenerate: Date.now() // Add timestamp to trigger regeneration
                  })
                }}
                className="w-full px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium bg-card/50 hover:bg-card/70  rounded-md transition-all"
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
            <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Padding</label>
              <Slider
                value={[effects.background.padding || 0]}
                onValueChange={([value]) => updateBackgroundEffect({
                  padding: value
                })}
                min={0}
                max={200}
                step={5}
                className="w-full"
              />
              {(effects.background.padding || 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.background.padding}px</span>
                  <button
                    onClick={() => updateBackgroundEffect({
                      padding: 80
                    })}
                    className="text-[9px] text-primary/70 hover:text-primary uppercase tracking-wider"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Corners</label>
              <Slider
                value={[effects.video.cornerRadius]}
                onValueChange={([value]) => updateEffect('video', { cornerRadius: value })}
                min={0}
                max={50}
                step={1}
                className="w-full"
              />
              {effects.video.cornerRadius > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.cornerRadius}px</span>}
            </div>

            <div className="space-y-2 p-3 bg-card/30 rounded-lg ">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Shadow</span>
                <Switch
                  checked={effects.video.shadow.enabled}
                  onCheckedChange={(checked) =>
                    updateEffect('video', {
                      ...effects.video,
                      shadow: { ...effects.video.shadow, enabled: checked }
                    })
                  }
                />
              </label>
              {effects.video.shadow.enabled && (
                <>
                  <div className="space-y-1">
                    <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Blur</label>
                    <Slider
                      value={[effects.video.shadow.blur]}
                      onValueChange={([value]) =>
                        updateEffect('video', {
                          ...effects.video,
                          shadow: { ...effects.video.shadow, blur: value }
                        })
                      }
                      min={0}
                      max={120}
                      step={5}
                      className="w-full"
                    />
                    {effects.video.shadow.blur > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.shadow.blur}px</span>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Y Offset</label>
                    <Slider
                      value={[effects.video.shadow.offset.y]}
                      onValueChange={([value]) =>
                        updateEffect('video', {
                          ...effects.video,
                          shadow: {
                            ...effects.video.shadow,
                            offset: { ...effects.video.shadow.offset, y: value }
                          }
                        })
                      }
                      min={0}
                      max={50}
                      step={5}
                      className="w-full"
                    />
                    {effects.video.shadow.offset.y > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.shadow.offset.y}px</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
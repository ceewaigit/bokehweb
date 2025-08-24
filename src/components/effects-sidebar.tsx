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
import { useProjectStore } from '@/stores/project-store'

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
  // Auto-switch tab based on selected effect layer
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'zoom' | 'shape'>('background')
  const [backgroundType, setBackgroundType] = useState<'wallpaper' | 'gradient' | 'color' | 'image'>('wallpaper')
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[] }>({ wallpapers: [] })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)

  // Update active tab when effect layer is selected
  React.useEffect(() => {
    if (selectedEffectLayer?.type) {
      if (selectedEffectLayer.type === 'zoom') {
        setActiveTab('zoom')
      } else if (selectedEffectLayer.type === 'cursor') {
        setActiveTab('cursor')
      } else if (selectedEffectLayer.type === 'background') {
        setActiveTab('background')
      }
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
            if (data && data.wallpapers) {
              setMacOSWallpapers({ wallpapers: data.wallpapers || [] })
            } else {
              // Fallback to empty arrays if no data
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
  }, [backgroundType]) // Remove dependencies that could prevent retry

  if (!selectedClip || !effects) {
    return (
      <div className={cn("bg-card/30 backdrop-blur-md border-l border-border/50 p-4", className)}>
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">No clip selected</p>
      </div>
    )
  }

  const updateEffect = (category: string, updates: any) => {
    if (!effects || !selectedClip) return

    // Use the centralized store method for effect updates
    const { updateClipEffectCategory } = useProjectStore.getState()
    updateClipEffectCategory(selectedClip.id, category, updates)
  }

  return (
    <div className={cn("bg-gradient-to-b from-background/95 to-background/90 backdrop-blur-xl border-l border-border/50 flex flex-col", className)}>
      {/* Selection Indicator */}
      {selectedEffectLayer && (
        <div className="px-3 py-1.5 bg-primary/5 border-b border-border/30">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
            {selectedEffectLayer.type === 'zoom' && selectedEffectLayer.id ?
              `Zoom Block` :
              selectedEffectLayer.type} Layer
          </span>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-0.5 p-2 border-b border-border/30">
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
                  onClick={() => setBackgroundType(type)}
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
                            // Set wallpaper type immediately to trigger skeleton
                            updateEffect('background', {
                              type: 'wallpaper',
                              wallpaper: undefined  // Clear wallpaper to show skeleton
                            })
                            
                            setLoadingWallpaperId(wallpaperId)
                            try {
                              const dataUrl = await window.electronAPI?.loadWallpaperImage?.(wallpaper.path)
                              if (dataUrl) {
                                updateEffect('background', {
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
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                      onClick={() => updateEffect('background', {
                        type: 'gradient',
                        gradient: {
                          type: 'linear',
                          colors: wallpaper.colors,
                          angle: 135
                        }
                      })}
                      className="aspect-square rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${wallpaper.colors[0]}, ${wallpaper.colors[1]})`
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Background Blur */}
            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Blur</span>
                <Switch
                  checked={effects.background.blur !== undefined && effects.background.blur > 0}
                  onCheckedChange={(checked) =>
                    updateEffect('background', { blur: checked ? 10 : undefined })
                  }
                />
              </label>
              {effects.background.blur !== undefined && effects.background.blur > 0 && (
                <>
                  <Slider
                    value={[effects.background.blur]}
                    onValueChange={([value]) => updateEffect('background', { blur: value })}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.background.blur}px</span>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'cursor' && effects?.cursor && (
          <div className="space-y-3">
            {/* Master cursor visibility toggle */}
            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
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
            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
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

            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Click Ripple</span>
                <Switch
                  checked={effects.cursor.clickEffects ?? false}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { clickEffects: checked })
                  }
                />
              </label>
            </div>

            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
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

            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
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
              <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
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
            {selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id && effects.zoom.blocks && (
              <>
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-primary/80">Block Settings</h4>
                  {(() => {
                    const block = effects.zoom.blocks.find((b: any) => b.id === selectedEffectLayer.id)
                    if (!block) return null
                    return (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scale</label>
                          <Slider
                            value={[block.scale]}
                            onValueChange={([value]) => {
                              const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                                b.id === block.id ? { ...b, scale: value } : b
                              )
                              updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                            }}
                            min={1}
                            max={4}
                            step={0.1}
                            className="w-full"
                          />
                          <span className="text-[10px] text-muted-foreground/70 font-mono">{block.scale.toFixed(1)}x</span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Intro</label>
                          <Slider
                            value={[block.introMs || 500]}
                            onValueChange={([value]) => {
                              const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                                b.id === block.id ? { ...b, introMs: value } : b
                              )
                              updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                            }}
                            min={0}
                            max={1000}
                            step={50}
                            className="w-full"
                          />
                          {(block.introMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{block.introMs}ms</span>}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outro</label>
                          <Slider
                            value={[block.outroMs || 500]}
                            onValueChange={([value]) => {
                              const updatedBlocks = effects.zoom.blocks?.map((b: any) =>
                                b.id === block.id ? { ...b, outroMs: value } : b
                              )
                              updateEffect('zoom', { ...effects.zoom, blocks: updatedBlocks })
                            }}
                            min={0}
                            max={1000}
                            step={50}
                            className="w-full"
                          />
                          {(block.outroMs || 0) > 0 && <span className="text-[10px] text-muted-foreground/70 font-mono">{block.outroMs}ms</span>}
                        </div>
                      </>
                    )
                  })()}
                </div>
                <div className="border-t border-border/30 pt-3" />
              </>
            )}

            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
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

            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Max Scale</label>
              <Slider
                value={[effects.zoom.maxZoom ?? 2.0]}
                onValueChange={([value]) => updateEffect('zoom', { maxZoom: value })}
                min={1}
                max={4}
                step={0.1}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(effects.zoom.maxZoom ?? 2.0).toFixed(1)}x</span>
            </div>

            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Sensitivity</label>
              <Slider
                value={[effects.zoom.sensitivity ?? 1.0]}
                onValueChange={([value]) => updateEffect('zoom', { sensitivity: value })}
                min={0.1}
                max={2}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Reset Zoom Detection Button */}
            <div className="pt-3 border-t border-border/30">
              <button
                onClick={() => {
                  // Trigger zoom detection reset - keep existing blocks until new ones are generated
                  updateEffect('zoom', {
                    ...effects.zoom,
                    regenerate: Date.now() // Add timestamp to trigger regeneration
                  })
                }}
                className="w-full px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium bg-card/50 hover:bg-card/70 border border-border/30 rounded-md transition-all"
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
            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Padding</label>
              <Slider
                value={[effects.background.padding || 0]}
                onValueChange={([value]) => updateEffect('background', {
                  ...effects.background,
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
                    onClick={() => updateEffect('background', {
                      ...effects.background,
                      padding: 80
                    })}
                    className="text-[9px] text-primary/70 hover:text-primary uppercase tracking-wider"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
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

            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
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
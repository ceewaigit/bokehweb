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
  // Auto-switch tab based on selected effect layer
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'zoom' | 'shape'>('background')
  const [backgroundType, setBackgroundType] = useState<'wallpaper' | 'gradient' | 'color' | 'image'>('wallpaper')
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[], gradients: any[] }>({ wallpapers: [], gradients: [] })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)

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
      window.electronAPI?.getMacOSWallpapers?.().then((data) => {
        setMacOSWallpapers(data || { wallpapers: [], gradients: [] })
        setLoadingWallpapers(false)
      }).catch((error) => {
        console.error('Failed to load macOS wallpapers:', error)
        setLoadingWallpapers(false)
      })
    }
  }, [backgroundType, macOSWallpapers.wallpapers.length, loadingWallpapers])

  if (!selectedClip || !effects) {
    return (
      <div className={cn("bg-card/30 backdrop-blur-md border-l border-border/50 p-4", className)}>
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">No clip selected</p>
      </div>
    )
  }

  const updateEffect = (category: string, updates: any) => {
    if (!effects) return

    // For background gradients, deep merge to ensure gradient colors update
    if (category === 'background' && updates.gradient) {
      onEffectChange({
        ...effects,
        background: {
          ...effects.background,
          ...updates,
          gradient: updates.gradient  // Replace entire gradient object
        }
      })
    } else {
      onEffectChange({
        ...effects,
        [category]: {
          ...effects[category as keyof typeof effects],
          ...updates
        }
      })
    }
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
                ) : (
                  <>
                    {macOSWallpapers.wallpapers.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {macOSWallpapers.wallpapers.slice(0, 12).map((wallpaper, index) => (
                          <button
                            key={index}
                            onClick={() => updateEffect('background', {
                              type: 'wallpaper',
                              wallpaper: wallpaper.path
                            })}
                            className="aspect-video rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105 relative group"
                            title={wallpaper.name}
                          >
                            <img 
                              src={wallpaper.thumbnail || wallpaper.path} 
                              alt={wallpaper.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to gradient if image fails to load
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20" />
                            <span className="absolute bottom-0 left-0 right-0 p-1 bg-black/50 text-[8px] text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                              {wallpaper.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {macOSWallpapers.gradients.length > 0 && (
                      <>
                        <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-3">macOS Style Gradients</h3>
                        <div className="grid grid-cols-4 gap-1.5">
                          {macOSWallpapers.gradients.map((gradient) => (
                            <button
                              key={gradient.path}
                              onClick={() => updateEffect('background', {
                                type: 'gradient',
                                gradient: {
                                  type: 'linear',
                                  colors: gradient.colors,
                                  angle: 135
                                }
                              })}
                              className="aspect-square rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105"
                              style={{
                                background: `linear-gradient(135deg, ${gradient.colors[0]}, ${gradient.colors[1]})`
                              }}
                              title={gradient.name}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
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
                <p className="text-[9px] text-muted-foreground/50 italic">
                  Gradients by raycast.com
                </p>
              </div>
            )}

            {/* Background Blur */}
            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Blur</span>
                <Switch
                  checked={effects.background.blur ? effects.background.blur > 0 : false}
                  onCheckedChange={(checked) =>
                    updateEffect('background', { blur: checked ? 10 : 0 })
                  }
                />
              </label>
              {effects.background.blur && effects.background.blur > 0 && (
                <Slider
                  value={[effects.background.blur]}
                  onValueChange={([value]) => updateEffect('background', { blur: value })}
                  min={0}
                  max={50}
                  step={1}
                  className="w-full"
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'cursor' && effects?.cursor && (
          <div className="space-y-3">
            <div className="p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-[10px]">Visibility</span>
                <Switch
                  checked={effects.cursor.visible ?? true}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { visible: checked })
                  }
                />
              </label>
            </div>

            <div className="space-y-2 p-3 bg-card/30 rounded-lg border border-border/30">
              <label className="text-xs font-medium uppercase tracking-wider text-[10px]">Size</label>
              <Slider
                value={[effects.cursor.size ?? 2.0]}
                onValueChange={([value]) => updateEffect('cursor', { size: value })}
                min={1}
                max={4}
                step={0.1}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(effects.cursor.size ?? 2.0).toFixed(1)}x</span>
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
                            value={[block.introMs]}
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
                          <span className="text-[10px] text-muted-foreground/70 font-mono">{block.introMs}ms</span>
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Outro</label>
                          <Slider
                            value={[block.outroMs]}
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
                          <span className="text-[10px] text-muted-foreground/70 font-mono">{block.outroMs}ms</span>
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
                  // Trigger zoom detection reset
                  updateEffect('zoom', {
                    ...effects.zoom,
                    blocks: [], // Clear existing blocks
                    regenerate: Date.now() // Add timestamp to trigger regeneration
                  })
                }}
                className="w-full px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium bg-card/50 hover:bg-card/70 border border-border/30 rounded-md transition-all"
              >
                Reset Zoom Detection
              </button>
              <p className="text-[9px] text-muted-foreground/60 mt-1.5 italic">
                Re-analyze movements
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
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.background.padding || 0}px</span>
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
              <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.cornerRadius}px</span>
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
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.shadow.blur}px</span>
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
                    <span className="text-[10px] text-muted-foreground/70 font-mono">{effects.video.shadow.offset.y}px</span>
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
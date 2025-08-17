'use client'

import { useState } from 'react'
import {
  Camera,
  Palette,
  MousePointer,
  Square,
  Maximize,
  Volume2,
  Settings,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
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
  onEffectChange: (effects: ClipEffects) => void
}

export function EffectsSidebar({ 
  className,
  selectedClip,
  effects,
  onEffectChange 
}: EffectsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'zoom' | 'shape'>('background')
  const [backgroundType, setBackgroundType] = useState<'wallpaper' | 'gradient' | 'color' | 'image'>('gradient')

  if (!selectedClip || !effects) {
    return (
      <div className={cn("bg-background border-l border-border p-4", className)}>
        <p className="text-sm text-muted-foreground">Select a clip to edit effects</p>
      </div>
    )
  }

  const updateEffect = (category: string, updates: any) => {
    if (!effects) return
    onEffectChange({
      ...effects,
      [category]: {
        ...effects[category as keyof typeof effects],
        ...updates
      }
    })
  }

  return (
    <div className={cn("bg-background border-l border-border flex flex-col", className)}>
      {/* Section Tabs */}
      <div className="flex flex-col gap-1 p-2 border-b border-border">
        <button
          onClick={() => setActiveTab('background')}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            activeTab === 'background' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          <Palette className="w-4 h-4" />
          Background
        </button>
        <button
          onClick={() => setActiveTab('cursor')}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            activeTab === 'cursor' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          <MousePointer className="w-4 h-4" />
          Cursor
        </button>
        <button
          onClick={() => setActiveTab('zoom')}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            activeTab === 'zoom' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          <Camera className="w-4 h-4" />
          Zoom & Motion
        </button>
        <button
          onClick={() => setActiveTab('shape')}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            activeTab === 'shape' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          <Square className="w-4 h-4" />
          Shape
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'background' && (
          <div className="space-y-4">
            {/* Background Type Tabs */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              {(['wallpaper', 'gradient', 'color', 'image'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setBackgroundType(type)}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded text-sm capitalize transition-colors",
                    backgroundType === type
                      ? "bg-background shadow-sm"
                      : "hover:bg-background/50"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Wallpaper Grid */}
            {backgroundType === 'gradient' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Wallpaper</h3>
                <div className="grid grid-cols-4 gap-2">
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
                      className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      style={{
                        background: `linear-gradient(135deg, ${wallpaper.colors[0]}, ${wallpaper.colors[1]})`
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Background gradients were created by raycast.com
                </p>
              </div>
            )}

            {/* Background Blur */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Background blur
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

        {activeTab === 'cursor' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Show cursor
                <Switch
                  checked={effects.cursor.visible}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { visible: checked })
                  }
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Cursor size</label>
              <Slider
                value={[effects.cursor.size]}
                onValueChange={([value]) => updateEffect('cursor', { size: value })}
                min={0.5}
                max={3}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Click effects
                <Switch
                  checked={effects.cursor.clickEffects}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { clickEffects: checked })
                  }
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Motion blur
                <Switch
                  checked={effects.cursor.motionBlur}
                  onCheckedChange={(checked) =>
                    updateEffect('cursor', { motionBlur: checked })
                  }
                />
              </label>
            </div>
          </div>
        )}

        {activeTab === 'zoom' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Auto zoom
                <Switch
                  checked={effects.zoom.enabled}
                  onCheckedChange={(checked) =>
                    updateEffect('zoom', { enabled: checked })
                  }
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max zoom</label>
              <Slider
                value={[effects.zoom.maxZoom]}
                onValueChange={([value]) => updateEffect('zoom', { maxZoom: value })}
                min={1}
                max={4}
                step={0.1}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{effects.zoom.maxZoom.toFixed(1)}x</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Zoom sensitivity</label>
              <Slider
                value={[effects.zoom.sensitivity]}
                onValueChange={([value]) => updateEffect('zoom', { sensitivity: value })}
                min={0.1}
                max={2}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Debug section */}
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Debug Tools
              </h4>

              {/* Zoom effect controls temporarily disabled during refactor */}
              {/* TODO: Add these back via WorkspaceManager callbacks */}
            </div>
          </div>
        )}

        {activeTab === 'shape' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Padding</label>
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
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{effects.background.padding || 0}px</span>
                <button
                  onClick={() => updateEffect('background', {
                    ...effects.background,
                    padding: 80
                  })}
                  className="text-primary hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Corner radius</label>
              <Slider
                value={[effects.video.cornerRadius]}
                onValueChange={([value]) => updateEffect('video', { cornerRadius: value })}
                min={0}
                max={50}
                step={1}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{effects.video.cornerRadius}px</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center justify-between">
                Shadow
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
                    <label className="text-xs text-muted-foreground">Blur</label>
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
                    <span className="text-xs text-muted-foreground">{effects.video.shadow.blur}px</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Offset Y</label>
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
                    <span className="text-xs text-muted-foreground">{effects.video.shadow.offset.y}px</span>
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
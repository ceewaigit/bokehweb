'use client'

import React, { useState, useEffect } from 'react'
import { Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { BackgroundType } from '@/types/project'
import { GRADIENT_PRESETS, COLOR_PRESETS } from './constants'

interface BackgroundTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: any) => void
}

let cachedMacOSWallpapers: any[] | null = null
let macOSWallpapersPromise: Promise<any[] | null> | null = null

export function BackgroundTab({ backgroundEffect, onUpdateBackground }: BackgroundTabProps) {
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(BackgroundType.Gradient)
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[] }>({
    wallpapers: cachedMacOSWallpapers || []
  })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)

  // Sync backgroundType with actual background effect type
  useEffect(() => {
    if (backgroundEffect?.data) {
      const bgData = backgroundEffect.data as BackgroundEffectData
      if (bgData.type) {
        setBackgroundType(bgData.type)
      }
    }
  }, [backgroundEffect])

  // Load macOS wallpapers when wallpaper tab is selected
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (macOSWallpapers.wallpapers.length > 0 || loadingWallpapers) return

    if (cachedMacOSWallpapers && cachedMacOSWallpapers.length > 0) {
      setMacOSWallpapers({ wallpapers: cachedMacOSWallpapers })
      return
    }

    if (macOSWallpapersPromise) {
      setLoadingWallpapers(true)
      macOSWallpapersPromise.then((wallpapers) => {
        if (wallpapers) setMacOSWallpapers({ wallpapers })
      }).finally(() => setLoadingWallpapers(false))
      return
    }

    if (window.electronAPI?.getMacOSWallpapers) {
      setLoadingWallpapers(true)
      macOSWallpapersPromise = window.electronAPI.getMacOSWallpapers()
        .then((data) => {
          const wallpapers = data?.wallpapers || []
          cachedMacOSWallpapers = wallpapers
          setMacOSWallpapers({ wallpapers })
          return wallpapers
        })
        .catch((error) => {
          console.error('Failed to load macOS wallpapers:', error)
          cachedMacOSWallpapers = []
          setMacOSWallpapers({ wallpapers: [] })
          return []
        })
        .finally(() => {
          macOSWallpapersPromise = null
          setLoadingWallpapers(false)
        })
    } else {
      cachedMacOSWallpapers = []
      setMacOSWallpapers({ wallpapers: [] })
      setLoadingWallpapers(false)
    }
  }, [backgroundType])

  const bgData = backgroundEffect?.data as BackgroundEffectData

  return (
    <div className="space-y-4">

      {/* Horizontal Background Type Tabs */}
      <div className="flex p-1 bg-muted/50 rounded-lg">
        {([BackgroundType.Wallpaper, BackgroundType.Gradient, BackgroundType.Color, BackgroundType.Image] as const).map(type => (
          <button
            key={type}
            onClick={() => setBackgroundType(type)}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all capitalize",
              backgroundType === type
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="border-t border-border/30 pt-2">
        {/* macOS Wallpapers */}
        {backgroundType === BackgroundType.Wallpaper && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Select Wallpaper</h4>
            {loadingWallpapers ? (
              <div className="text-xs text-muted-foreground">Loading wallpapers...</div>
            ) : macOSWallpapers.wallpapers.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
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
                            onUpdateBackground({
                              type: BackgroundType.Wallpaper,
                              wallpaper: dataUrl
                            })
                          }
                        } catch (error) {
                          console.error('Failed to load wallpaper:', error)
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
        {backgroundType === BackgroundType.Gradient && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Select Gradient</h4>
            <div className="grid grid-cols-5 gap-2">
              {GRADIENT_PRESETS.map(wallpaper => (
                <button
                  key={wallpaper.id}
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Gradient,
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
        {backgroundType === BackgroundType.Color && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Select Color</h4>

            {/* Color picker - streamlined single section */}
            <div className="flex gap-2 items-center p-3 bg-background/30 rounded-lg">
              <input
                type="color"
                value={bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000'}
                onChange={(e) => {
                  onUpdateBackground({
                    type: BackgroundType.Color,
                    color: e.target.value
                  })
                }}
                className="w-12 h-12 rounded-md cursor-pointer border-0 bg-transparent"
                style={{ backgroundColor: bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000' }}
              />
              <input
                type="text"
                value={bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                    if (value.length === 7) {
                      onUpdateBackground({
                        type: BackgroundType.Color,
                        color: value
                      })
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.length > 0) {
                    onUpdateBackground({
                      type: BackgroundType.Color,
                      color: e.target.value.padEnd(7, '0')
                    })
                  }
                }}
                className="flex-1 px-3 py-2 text-sm font-mono bg-background/50 rounded"
                placeholder="#000000"
                maxLength={7}
              />
            </div>

            {/* Preset colors */}
            <div className="grid grid-cols-6 gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Color,
                      color
                    })
                  }}
                  className={cn(
                    "aspect-square rounded-md transition-all hover:scale-110",
                    bgData?.type === BackgroundType.Color && bgData?.color?.toUpperCase() === color.toUpperCase()
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
        {backgroundType === BackgroundType.Image && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Custom Image</h4>
            <button
              onClick={async () => {
                if (window.electronAPI?.selectImageFile && window.electronAPI?.loadImageAsDataUrl) {
                  const imagePath = await window.electronAPI.selectImageFile()
                  if (imagePath) {
                    const dataUrl = await window.electronAPI.loadImageAsDataUrl(imagePath)
                    if (dataUrl) {
                      onUpdateBackground({
                        type: BackgroundType.Image,
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
            {bgData?.image && (
              <div className="relative aspect-video rounded-md overflow-hidden ring-1 ring-border/20">
                <img
                  src={bgData.image}
                  alt="Background"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Image,
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
        {(backgroundType === BackgroundType.Wallpaper || backgroundType === BackgroundType.Image) && (
          <div className="space-y-3 mt-4 pt-4 border-t border-border/30">
            <h4 className="text-xs font-medium text-muted-foreground">Background Blur</h4>
            <div className="p-3 bg-background/30 rounded-lg space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-xs">Enable Blur</span>
                <Switch
                  checked={bgData?.blur ? bgData.blur > 0 : false}
                  onCheckedChange={(checked) =>
                    onUpdateBackground({ blur: checked ? 10 : undefined })
                  }
                />
              </label>
              {bgData?.blur && bgData.blur > 0 && (
                <div className="space-y-2">
                  <Slider
                    value={[bgData.blur]}
                    onValueChange={([value]) => onUpdateBackground({ blur: value })}
                    onValueCommit={([value]) => onUpdateBackground({ blur: value })}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{bgData.blur}px</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

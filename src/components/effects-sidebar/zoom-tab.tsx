'use client'

import React, { useState } from 'react'
import { ZoomIn, RotateCcw, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect, ZoomEffectData } from '@/types/project'
import { EffectType, ScreenEffectPreset } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'

interface ZoomTabProps {
  effects: Effect[] | undefined
  selectedEffectLayer?: SelectedEffectLayer
  selectedClip: Clip | null
  onUpdateZoom: (updates: any) => void
  onEffectChange: (type: EffectType.Zoom | EffectType.Annotation, data: any) => void
  onZoomBlockUpdate?: (blockId: string, updates: any) => void
}

export function ZoomTab({
  effects,
  selectedEffectLayer,
  selectedClip,
  onUpdateZoom,
  onEffectChange,
  onZoomBlockUpdate
}: ZoomTabProps) {
  const zoomEffects = effects ? EffectsFactory.getZoomEffects(effects) : []

  // Local state for slider values during dragging
  const [localScale, setLocalScale] = React.useState<number | null>(null)
  const [localIntroMs, setLocalIntroMs] = React.useState<number | null>(null)
  const [localOutroMs, setLocalOutroMs] = React.useState<number | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <div className="space-y-4">

      {/* Selected Zoom Block Editor */}
      {selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id && (() => {
        const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
        if (!selectedBlock) return null
        const zoomData = selectedBlock.data as ZoomEffectData
        if (!zoomData) return null

        return (
          <div
            key={`zoom-block-${selectedEffectLayer.id}`}
            className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Scale Control */}
            <div className="p-4 bg-background/40 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Zoom Scale</span>
                </div>
                <span className="text-xs font-mono text-primary tabular-nums">
                  {(localScale ?? zoomData.scale ?? 2.0).toFixed(1)}x
                </span>
              </div>
              <Slider
                key={`scale-${selectedEffectLayer.id}`}
                value={[localScale ?? zoomData.scale ?? 2.0]}
                onValueChange={([value]) => setLocalScale(value)}
                onValueCommit={([value]) => {
                  if (selectedEffectLayer.id && onZoomBlockUpdate) {
                    onZoomBlockUpdate(selectedEffectLayer.id, { scale: value })
                    setTimeout(() => setLocalScale(null), 300)
                  }
                }}
                min={1}
                max={7}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>1x</span>
                <span>7x</span>
              </div>
            </div>

            {/* Easing Controls */}
            <div className="p-4 bg-background/40 rounded-xl space-y-3">
              <span className="text-xs font-medium">Easing Duration</span>
              <div className="grid grid-cols-2 gap-4">
                {/* Ease In */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">In</span>
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {localIntroMs ?? (zoomData.introMs || 500)}ms
                    </span>
                  </div>
                  <Slider
                    key={`intro-${selectedEffectLayer.id}`}
                    value={[localIntroMs ?? (zoomData.introMs || 500)]}
                    onValueChange={([value]) => setLocalIntroMs(value)}
                    onValueCommit={([value]) => {
                      if (selectedEffectLayer.id && onZoomBlockUpdate) {
                        onZoomBlockUpdate(selectedEffectLayer.id, { introMs: value })
                        setTimeout(() => setLocalIntroMs(null), 300)
                      }
                    }}
                    min={0}
                    max={1000}
                    step={50}
                    className="w-full"
                  />
                </div>
                {/* Ease Out */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Out</span>
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {localOutroMs ?? (zoomData.outroMs || 500)}ms
                    </span>
                  </div>
                  <Slider
                    key={`outro-${selectedEffectLayer.id}`}
                    value={[localOutroMs ?? (zoomData.outroMs || 500)]}
                    onValueChange={([value]) => setLocalOutroMs(value)}
                    onValueCommit={([value]) => {
                      if (selectedEffectLayer.id && onZoomBlockUpdate) {
                        onZoomBlockUpdate(selectedEffectLayer.id, { outroMs: value })
                        setTimeout(() => setLocalOutroMs(null), 300)
                      }
                    }}
                    min={0}
                    max={1000}
                    step={50}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-lg transition-colors"
            >
              <span>Advanced</span>
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", showAdvanced && "rotate-90")} />
            </button>

            {showAdvanced && (
              <div className="p-4 bg-background/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Mouse Idle Threshold</span>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                    {zoomData.mouseIdlePx ?? 3}px
                  </span>
                </div>
                <Slider
                  key={`mouseidle-${selectedEffectLayer.id}`}
                  value={[zoomData.mouseIdlePx ?? 3]}
                  onValueChange={([value]) => {
                    if (selectedEffectLayer.id && onZoomBlockUpdate) {
                      onZoomBlockUpdate(selectedEffectLayer.id, { mouseIdlePx: value })
                    }
                  }}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <p className="text-[9px] text-muted-foreground/60">
                  Minimum cursor movement to trigger pan
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-border/30" />
          </div>
        )
      })()}

      {/* Zoom Effects Toggle */}
      <div className="p-4 bg-background/40 rounded-xl">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2.5">
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Zoom Effects</span>
          </div>
          <Switch
            checked={zoomEffects.length > 0}
            onCheckedChange={(checked) =>
              onUpdateZoom({ enabled: checked })
            }
          />
        </label>
      </div>

      {/* Reset Detection */}
      <button
        onClick={() => onUpdateZoom({ regenerate: Date.now() })}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs bg-background/40 hover:bg-background/60 rounded-xl transition-all group"
      >
        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground group-hover:rotate-[-45deg] transition-transform duration-300" />
        <span>Regenerate Zoom Regions</span>
      </button>
      <p className="text-[10px] text-muted-foreground/60 text-center">
        Re-analyze mouse movements to detect zoom areas
      </p>

      {/* Cinematic Scroll */}
      <div className="p-4 bg-background/40 rounded-xl space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Cinematic Scroll</span>
          </div>
          <Switch
            checked={!!effects?.some(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled)}
            onCheckedChange={(checked) => {
              onEffectChange(EffectType.Annotation, { kind: 'scrollCinematic', enabled: checked, data: { preset: 'medium' } })
            }}
          />
        </label>

        {/* Preset selector when enabled */}
        {effects?.some(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled) && (
          <div className="grid grid-cols-3 gap-1.5 pt-2">
            {([ScreenEffectPreset.Subtle, ScreenEffectPreset.Medium, ScreenEffectPreset.Dramatic] as const).map(preset => {
              const scrollEffect = effects?.find(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic')
              const currentPreset = (scrollEffect?.data as any)?.preset || 'medium'
              const isActive = currentPreset === preset
              return (
                <button
                  key={preset}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-medium rounded-lg transition-all capitalize",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background/50 text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  )}
                  onClick={() => {
                    onEffectChange(EffectType.Annotation, { kind: 'scrollCinematic', enabled: true, data: { preset } })
                  }}
                >
                  {preset}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


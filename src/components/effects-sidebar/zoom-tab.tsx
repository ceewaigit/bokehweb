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
import { InfoTooltip } from './info-tooltip'

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
    <div className="space-y-3">

      {/* Selected Zoom Block Editor */}
      {selectedEffectLayer?.type === EffectLayerType.Zoom && selectedEffectLayer?.id && (() => {
        const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
        if (!selectedBlock) return null
        const zoomData = selectedBlock.data as ZoomEffectData
        if (!zoomData) return null

        return (
          <div
            key={`zoom-block-${selectedEffectLayer.id}`}
            className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Scale Control */}
            <div className="p-3 bg-background/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ZoomIn className="w-3 h-3 text-muted-foreground" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium leading-none">Zoom Scale</span>
                    <InfoTooltip content="How much to zoom into the region (higher = closer)." />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-primary tabular-nums">
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
              <div className="flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
                <span>1x</span>
                <span>7x</span>
              </div>
            </div>

            {/* Easing Controls */}
            <div className="p-4 bg-background/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-none">Easing Duration</span>
                <InfoTooltip content="How quickly the zoom eases in and out (ms)." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Ease In */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">In</span>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
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
                    <span className="text-xs text-muted-foreground">Out</span>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
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
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-background/30 hover:bg-background/50 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                Advanced
                <InfoTooltip content="Fine-tune how zoom regions track cursor movement." />
              </span>
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", showAdvanced && "rotate-90")} />
            </button>

            {showAdvanced && (
              <div className="p-4 bg-background/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mouse Idle Threshold</span>
                    <InfoTooltip content="Minimum movement (px) needed to trigger panning inside a zoom." />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
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
                <p className="text-xs text-muted-foreground/70 leading-snug">
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
      <div className="p-3 bg-background/40 rounded-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-none">Zoom Effects</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                Auto-detect and apply zoom regions.
              </div>
            </div>
          </div>
          <Switch
            aria-label="Enable zoom effects"
            checked={zoomEffects.length > 0}
            onCheckedChange={(checked) => onUpdateZoom({ enabled: checked })}
          />
        </div>
      </div>

      {/* Reset Detection */}
      <button
        onClick={() => onUpdateZoom({ regenerate: Date.now() })}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] bg-background/40 hover:bg-background/60 rounded-lg transition-all group"
      >
        <RotateCcw className="w-3 h-3 text-muted-foreground group-hover:rotate-[-45deg] transition-transform duration-300" />
        <span>Regenerate Zoom Regions</span>
      </button>

      {/* Cinematic Scroll */}
      <div className="p-3 bg-background/40 rounded-lg space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-none">Cinematic Scroll</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                Smoothen scroll motion for a polished feel.
              </div>
            </div>
          </div>
          <Switch
            aria-label="Enable cinematic scroll"
            className="scale-90 origin-right"
            checked={!!effects?.some(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled)}
            onCheckedChange={(checked) => {
              onEffectChange(EffectType.Annotation, { kind: 'scrollCinematic', enabled: checked, data: { preset: 'medium' } })
            }}
          />
        </div>

        {/* Preset selector when enabled */}
        {effects?.some(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic' && e.enabled) && (
          <div className="grid grid-cols-3 gap-1 pt-1.5">
            {([ScreenEffectPreset.Subtle, ScreenEffectPreset.Medium, ScreenEffectPreset.Dramatic] as const).map(preset => {
              const scrollEffect = effects?.find(e => e.type === EffectType.Annotation && (e as any).data?.kind === 'scrollCinematic')
              const currentPreset = (scrollEffect?.data as any)?.preset || 'medium'
              const isActive = currentPreset === preset
              return (
                <button
                  key={preset}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded transition-all capitalize",
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

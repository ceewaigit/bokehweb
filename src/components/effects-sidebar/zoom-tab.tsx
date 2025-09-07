'use client'

import React from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect, ZoomEffectData } from '@/types/project'

interface ZoomTabProps {
  effects: Effect[] | undefined
  selectedEffectLayer?: { type: 'zoom' | 'cursor' | 'background' | 'screen'; id?: string } | null
  selectedClip: Clip | null
  onUpdateZoom: (updates: any) => void
  onEffectChange: (type: 'zoom' | 'annotation', data: any) => void
}

export function ZoomTab({ 
  effects, 
  selectedEffectLayer, 
  selectedClip,
  onUpdateZoom, 
  onEffectChange 
}: ZoomTabProps) {
  const { updateEffect: updateStoreEffect } = useProjectStore()
  const playheadRecording = useProjectStore(s => s.playheadRecording)
  const projectRecordings = useProjectStore(s => s.currentProject?.recordings)
  
  const zoomEffects = effects?.filter(e => e.type === 'zoom' && e.enabled) || []

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Camera className="w-4 h-4" />
        <span>Zoom & Motion</span>
      </h3>

      {/* Show specific zoom block controls if one is selected */}
      {selectedEffectLayer?.type === 'zoom' && selectedEffectLayer?.id && (() => {
        const selectedBlock = zoomEffects.find(e => e.id === selectedEffectLayer.id)
        if (!selectedBlock) return null
        const zoomData = selectedBlock.data as ZoomEffectData
        if (!zoomData) return null

        return (
          <div key={`zoom-block-${selectedEffectLayer.id}`} className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
            <h4 className="text-xs font-semibold text-primary/80">Zoom Block Settings</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Scale</label>
                <Slider
                  key={`scale-${selectedEffectLayer.id}`}
                  value={[zoomData.scale ?? 2.0]}
                  onValueChange={([value]) => {
                    if (selectedEffectLayer.id) {
                      updateStoreEffect(selectedEffectLayer.id, { data: { ...(zoomData || {}), scale: value } })
                    }
                  }}
                  min={1}
                  max={7}
                  step={0.1}
                  className="w-full"
                />
                <span className="text-[9px] text-muted-foreground/70">{(zoomData.scale ?? 2.0).toFixed(1)}x</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Easing</label>
                <div className="grid grid-cols-2 gap-1">
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground/70">In</span>
                    <Slider
                      key={`intro-${selectedEffectLayer.id}`}
                      value={[zoomData.introMs || 500]}
                      onValueChange={([value]) => {
                        if (selectedEffectLayer.id) {
                          updateStoreEffect(selectedEffectLayer.id, { data: { ...(zoomData || {}), introMs: value } })
                        }
                      }}
                      min={0}
                      max={1000}
                      step={50}
                      className="w-full"
                    />
                    <span className="text-[9px] text-muted-foreground/70">{zoomData.introMs || 500}ms</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground/70">Out</span>
                    <Slider
                      key={`outro-${selectedEffectLayer.id}`}
                      value={[zoomData.outroMs || 500]}
                      onValueChange={([value]) => {
                        if (selectedEffectLayer.id) {
                          updateStoreEffect(selectedEffectLayer.id, { data: { ...(zoomData || {}), outroMs: value } })
                        }
                      }}
                      min={0}
                      max={1000}
                      step={50}
                      className="w-full"
                    />
                    <span className="text-[9px] text-muted-foreground/70">{zoomData.outroMs || 500}ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Follow Strategy */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Follow Target</label>
              <div className="flex gap-1">
                {([
                  { k: 'auto_mouse_first', label: 'Auto' },
                  { k: 'mouse', label: 'Mouse' }
                ] as const).map(opt => (
                  <button
                    key={opt.k}
                    onClick={() => {
                      if (!selectedEffectLayer?.id) return
                      
                      updateStoreEffect(selectedEffectLayer.id, {
                        data: { ...(zoomData || {}), followStrategy: opt.k }
                      })
                    }}
                    className={cn(
                      "flex-1 px-2 py-1 text-[10px] rounded transition-all",
                      (zoomData.followStrategy || 'auto_mouse_first') === opt.k
                        ? "bg-primary/20 text-primary"
                        : "bg-background/50 text-muted-foreground hover:bg-background/70"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Settings (collapsed by default) */}
            <details className="group">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                Advanced Settings
              </summary>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/30">
                <div className="space-y-1">
                  <label className="text-[9px] text-muted-foreground">Mouse Idle (px)</label>
                  <Slider
                    key={`mouseidle-${selectedEffectLayer.id}`}
                    value={[zoomData.mouseIdlePx ?? 3]}
                    onValueChange={([value]) => selectedEffectLayer.id && updateStoreEffect(selectedEffectLayer.id, { data: { ...(zoomData || {}), mouseIdlePx: value } })}
                    min={1}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>
            </details>
          </div>
        )
      })()}

      <div className="p-3 bg-background/30 rounded-lg">
        <label className="flex items-center justify-between">
          <span className="text-xs">Zoom Effects</span>
          <Switch
            checked={zoomEffects.length > 0}
            onCheckedChange={(checked) =>
              onUpdateZoom({ enabled: checked })
            }
          />
        </label>
      </div>

      {/* Reset Zoom Detection Button */}
      <button
        onClick={() => {
          onUpdateZoom({
            regenerate: Date.now()
          })
        }}
        className="w-full px-3 py-2 text-xs bg-background/50 hover:bg-background/70 rounded-md transition-all"
      >
        Reset Zoom Detection
      </button>
      <p className="text-[9px] text-muted-foreground/60 italic">
        Re-analyze mouse movements to detect zoom areas
      </p>

      {/* Cinematic Scroll with preset selector */}
      <div className="pt-2 space-y-3">
        <div className="p-3 bg-background/30 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs">Cinematic Scroll</span>
            <Switch
              checked={!!effects?.some(e => e.type === 'annotation' && (e as any).data?.kind === 'scrollCinematic' && e.enabled)}
              onCheckedChange={(checked) => {
                onEffectChange('annotation', { kind: 'scrollCinematic', enabled: checked, preset: 'medium' })
              }}
            />
          </div>
          
          {/* Preset selector when enabled */}
          {effects?.some(e => e.type === 'annotation' && (e as any).data?.kind === 'scrollCinematic' && e.enabled) && (
            <div className="grid grid-cols-3 gap-1">
              {(['subtle', 'medium', 'dramatic'] as const).map(preset => {
                const scrollEffect = effects?.find(e => e.type === 'annotation' && (e as any).data?.kind === 'scrollCinematic');
                const currentPreset = (scrollEffect?.data as any)?.preset || 'medium';
                return (
                  <button
                    key={preset}
                    className={cn(
                      "px-2 py-1 text-xs rounded transition-all",
                      currentPreset === preset 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-background/50 hover:bg-background/70"
                    )}
                    onClick={() => {
                      onEffectChange('annotation', { kind: 'scrollCinematic', enabled: true, preset })
                    }}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
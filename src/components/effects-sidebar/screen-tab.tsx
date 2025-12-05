'use client'

import React from 'react'
import { Camera, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect } from '@/types/project'
import { ScreenEffectPreset } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType, EffectType } from '@/types/effects'

interface ScreenTabProps {
  selectedClip: Clip | null
  selectedEffectLayer?: SelectedEffectLayer
  onEffectChange: (type: EffectType, data: any) => void
}

export function ScreenTab({ selectedClip, selectedEffectLayer, onEffectChange }: ScreenTabProps) {
  return (
    <div className="space-y-4">


      {/* Add Screen Block */}
      <div className="p-3 bg-background/30 rounded-lg">
        <button
          className="w-full px-3 py-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-all"
          onClick={() => {
            if (!selectedClip) return
            const newEffect: Effect = {
              id: `screen-${Date.now()}`,
              type: EffectType.Screen,
              startTime: selectedClip.startTime,
              endTime: selectedClip.startTime + selectedClip.duration,
              enabled: true,
              data: { preset: ScreenEffectPreset.Subtle }
            }
            useProjectStore.getState().addEffect(newEffect)
          }}
        >
          Add 3D Screen Block
        </button>
        <p className="text-[9px] text-muted-foreground/60 mt-2 italic">
          Creates a block you can resize on the timeline.
        </p>
      </div>

      {/* Show presets only when a screen block is selected */}
      {selectedEffectLayer?.type === EffectLayerType.Screen && selectedEffectLayer?.id ? (
        <div className="p-3 bg-background/30 rounded-lg space-y-3">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">3D Preset</label>
          <div className="grid grid-cols-2 gap-1">
            {([
              ScreenEffectPreset.Subtle, ScreenEffectPreset.Medium, ScreenEffectPreset.Dramatic, ScreenEffectPreset.Window,
              ScreenEffectPreset.Cinematic, ScreenEffectPreset.Hero, ScreenEffectPreset.Isometric, ScreenEffectPreset.Flat,
              ScreenEffectPreset.TiltLeft, ScreenEffectPreset.TiltRight
            ] as const).map(preset => (
              <button
                key={preset}
                className={cn(
                  'px-2 py-1.5 text-[10px] rounded transition-all capitalize',
                  'bg-background/50 text-muted-foreground hover:bg-background/70'
                )}
                onClick={() => onEffectChange(EffectType.Screen, { preset })}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Tilt Ease In (ms)</label>
              <input
                type="range"
                min={0}
                max={1000}
                step={50}
                onChange={(e) => onEffectChange(EffectType.Screen, { introMs: Number(e.target.value) })}
                className="w-full bg-accent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Tilt Ease Out (ms)</label>
              <input
                type="range"
                min={0}
                max={1000}
                step={50}
                onChange={(e) => onEffectChange(EffectType.Screen, { outroMs: Number(e.target.value) })}
                className="w-full text-accent"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-background/30 rounded-lg">
          <p className="text-[10px] text-muted-foreground">
            Select a 3D Screen block on the timeline to edit its preset.
          </p>
        </div>
      )}
    </div>
  )
}
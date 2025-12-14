'use client'

import React from 'react'
import { Square } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { InfoTooltip } from './info-tooltip'

interface ShapeTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: any) => void
}

export function ShapeTab({ backgroundEffect, onUpdateBackground }: ShapeTabProps) {
  const bgData = backgroundEffect?.data as BackgroundEffectData

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground leading-snug">
        Controls the frame padding, corner radius, and shadow.
      </p>

      <div className="p-3 bg-background/40 rounded-lg space-y-3">
        {/* Padding slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Padding</label>
              <InfoTooltip content="Adds space around the captured screen inside the frame." />
            </div>
            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{bgData?.padding ?? 40}px</span>
          </div>
          <Slider
            value={[bgData?.padding ?? 40]}
            onValueChange={([value]) => onUpdateBackground({ padding: value })}
            onValueCommit={([value]) => onUpdateBackground({ padding: value })}
            min={0}
            max={200}
            step={2}
            className="w-full"
          />
        </div>

        {/* Corner Radius slider */}
        <div className="border-t border-border/30 pt-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Corner Radius</label>
              <InfoTooltip content="Rounds the corners of the frame." />
            </div>
            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{bgData?.cornerRadius ?? 15}px</span>
          </div>
          <Slider
            value={[bgData?.cornerRadius ?? 15]}
            onValueChange={([value]) => onUpdateBackground({ cornerRadius: value })}
            onValueCommit={([value]) => onUpdateBackground({ cornerRadius: value })}
            min={0}
            max={48}
            step={1}
            className="w-full"
          />
        </div>

        {/* Shadow Intensity slider */}
        <div className="border-t border-border/30 pt-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Shadow</label>
              <InfoTooltip content="Controls how strong the frame shadow appears." />
            </div>
            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{bgData?.shadowIntensity ?? 85}%</span>
          </div>
          <Slider
            value={[bgData?.shadowIntensity ?? 85]}
            onValueChange={([value]) => onUpdateBackground({ shadowIntensity: value })}
            onValueCommit={([value]) => onUpdateBackground({ shadowIntensity: value })}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}

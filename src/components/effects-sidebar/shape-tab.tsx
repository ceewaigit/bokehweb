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
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-snug">
        Controls the frame padding, corner radius, and shadow.
      </p>

      <div className="space-y-3">
        <div className="p-4 bg-background/40 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Padding</label>
            <InfoTooltip content="Adds space around the captured screen inside the frame." />
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
          <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{bgData?.padding ?? 40}px</span>
        </div>

        <div className="p-4 bg-background/40 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Corner Radius</label>
            <InfoTooltip content="Rounds the corners of the frame." />
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
          <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{bgData?.cornerRadius ?? 15}px</span>
        </div>

        <div className="p-4 bg-background/40 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Shadow Intensity</label>
            <InfoTooltip content="Controls how strong the frame shadow appears." />
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
          <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{bgData?.shadowIntensity ?? 85}%</span>
        </div>
      </div>
    </div>
  )
}

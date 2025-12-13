'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'

interface KeystrokeTabProps {
  keystrokeEffect: Effect | undefined
  onUpdateKeystroke: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
}

export function KeystrokeTab({ keystrokeEffect, onUpdateKeystroke, onEffectChange }: KeystrokeTabProps) {
  const keystrokeData = keystrokeEffect?.data as KeystrokeEffectData | undefined

  return (
    <div className="space-y-4">
      {/* Master keystroke visibility toggle */}
      <div className="p-4 bg-background/40 rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-none">Keystrokes</div>
            <div className="mt-1 text-xs text-muted-foreground leading-snug">
              Show keyboard input during playback and export.
            </div>
          </div>
          <Switch
            aria-label="Show keystrokes"
            checked={keystrokeEffect?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (keystrokeEffect) {
                onEffectChange(EffectType.Keystroke, { ...keystrokeData, enabled: checked })
              } else {
                onEffectChange(EffectType.Keystroke, {
                  ...DEFAULT_KEYSTROKE_DATA,
                  enabled: checked
                })
              }
            }}
          />
        </div>
      </div>

      {/* Keystroke settings */}
      {keystrokeEffect?.enabled && (
        <div className="space-y-3">
          <div className="p-4 bg-background/40 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Position</label>
              <InfoTooltip content="Where the keystroke overlay appears on the video." />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {([KeystrokePosition.BottomCenter, KeystrokePosition.BottomRight, KeystrokePosition.TopCenter] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => onUpdateKeystroke({ position: pos })}
                  className={cn(
                    "px-2 py-1.5 text-xs font-medium rounded transition-all",
                    (keystrokeData?.position ?? DEFAULT_KEYSTROKE_DATA.position) === pos
                      ? "bg-primary/20 text-primary"
                      : "bg-background/50 text-muted-foreground hover:bg-background/70"
                  )}
                >
                  {pos.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-background/40 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Font Size</label>
                <InfoTooltip content="Adjusts the text size of displayed keys." />
              </div>
              <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">
                {keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize!}px
              </span>
            </div>
            <Slider
              value={[keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize!]}
              onValueChange={([value]) => onUpdateKeystroke({ fontSize: value })}
              onValueCommit={([value]) => onUpdateKeystroke({ fontSize: value })}
              min={12}
              max={24}
              step={1}
              className="w-full"
            />
          </div>

          <div className="p-4 bg-background/40 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Fade Duration</label>
                <InfoTooltip content="How long keystrokes remain visible before fading out." />
              </div>
              <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">
                {((keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration!) / 100).toFixed(1)}s
              </span>
            </div>
            <Slider
              value={[(keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration!) / 100]}
              onValueChange={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              onValueCommit={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              min={1}
              max={10}
              step={0.5}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}

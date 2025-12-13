'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'

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
      <div className="p-3 bg-background/30 rounded-lg">
        <label className="flex items-center justify-between">
          <span className="text-xs">Show Keystrokes</span>
          <Switch
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
        </label>
      </div>

      {/* Keystroke settings */}
      {keystrokeEffect?.enabled && (
        <div className="space-y-3">
          <div className="p-3 bg-background/30 rounded-lg space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Position</label>
            <div className="grid grid-cols-3 gap-1">
              {([KeystrokePosition.BottomCenter, KeystrokePosition.BottomRight, KeystrokePosition.TopCenter] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => onUpdateKeystroke({ position: pos })}
                  className={cn(
                    "px-2 py-1.5 text-[10px] rounded transition-all",
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

          <div className="p-3 bg-background/30 rounded-lg space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Font Size</label>
            <Slider
              value={[keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize!]}
              onValueChange={([value]) => onUpdateKeystroke({ fontSize: value })}
              onValueCommit={([value]) => onUpdateKeystroke({ fontSize: value })}
              min={12}
              max={24}
              step={1}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize!}px</span>
          </div>

          <div className="p-3 bg-background/30 rounded-lg space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Fade Duration</label>
            <Slider
              value={[(keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration!) / 100]}
              onValueChange={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              onValueCommit={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              min={1}
              max={10}
              step={0.5}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{((keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration!) / 100).toFixed(1)}s</span>
          </div>
        </div>
      )}
    </div>
  )
}

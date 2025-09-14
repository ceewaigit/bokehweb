'use client'

import React from 'react'
import { Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'

interface KeystrokeTabProps {
  keystrokeEffect: Effect | undefined
  onUpdateKeystroke: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
}

export function KeystrokeTab({ keystrokeEffect, onUpdateKeystroke, onEffectChange }: KeystrokeTabProps) {
  const keystrokeData = keystrokeEffect?.data as KeystrokeEffectData

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Keyboard className="w-4 h-4" />
        <span>Keystrokes</span>
      </h3>

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
                  position: KeystrokePosition.BottomCenter,
                  fontSize: 16,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  textColor: '#ffffff',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 6,
                  padding: 12,
                  fadeOutDuration: 300,
                  maxWidth: 300,
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
              {(['bottom-center', 'bottom-right', 'top-center'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => onUpdateKeystroke({ position: pos })}
                  className={cn(
                    "px-2 py-1.5 text-[10px] rounded transition-all",
                    keystrokeData?.position === pos
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
              value={[keystrokeData?.fontSize ?? 16]}
              onValueChange={([value]) => onUpdateKeystroke({ fontSize: value })}
              onValueCommit={([value]) => onUpdateKeystroke({ fontSize: value })}
              min={12}
              max={24}
              step={1}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{keystrokeData?.fontSize ?? 16}px</span>
          </div>

          <div className="p-3 bg-background/30 rounded-lg space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Fade Duration</label>
            <Slider
              value={[(keystrokeData?.fadeOutDuration ?? 300) / 100]}
              onValueChange={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              onValueCommit={([value]) => onUpdateKeystroke({ fadeOutDuration: value * 100 })}
              min={1}
              max={10}
              step={0.5}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{((keystrokeData?.fadeOutDuration ?? 300) / 100).toFixed(1)}s</span>
          </div>
        </div>
      )}
    </div>
  )
}
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { KeystrokeEffectData, Effect } from '@/types/project'
import { EffectType, KeystrokePosition } from '@/types'
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'
import { useProjectStore } from '@/stores/project-store'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { ChevronDown } from 'lucide-react'

interface KeystrokeTabProps {
  keystrokeEffect: Effect | undefined
  onUpdateKeystroke: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
  onBulkToggleKeystrokes?: (enabled: boolean) => void
}

type StylePreset = 'default' | 'glass' | 'minimal' | 'terminal' | 'outline'

const STYLE_PRESETS: { value: StylePreset; label: string }[] = [
  { value: 'glass', label: 'Glass' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'outline', label: 'Outline' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'default', label: 'Solid' },
]

const POSITION_OPTIONS = [
  { value: KeystrokePosition.BottomCenter, label: 'Bottom' },
  { value: KeystrokePosition.TopCenter, label: 'Top' },
  { value: KeystrokePosition.BottomRight, label: 'Right' },
] as const

export function KeystrokeTab({ keystrokeEffect, onUpdateKeystroke, onEffectChange, onBulkToggleKeystrokes }: KeystrokeTabProps) {
  const keystrokeData = keystrokeEffect?.data as KeystrokeEffectData | undefined
  const project = useProjectStore((s) => s.currentProject)
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const keystrokeEffects = React.useMemo(() => {
    return EffectsFactory.getKeystrokeEffects(project?.timeline.effects || [])
  }, [project?.timeline.effects])

  const hasEnabledKeystrokes = React.useMemo(() => {
    return keystrokeEffects.some(e => e.enabled)
  }, [keystrokeEffects])

  const keyboardEventCount = React.useMemo(() => {
    if (!project?.recordings?.length) return 0
    return project.recordings.reduce((sum, r) => sum + (r.metadata?.keyboardEvents?.length ?? 0), 0)
  }, [project?.recordings])

  // Current values with defaults
  const preset = keystrokeData?.stylePreset ?? DEFAULT_KEYSTROKE_DATA.stylePreset ?? 'glass'
  const fontSize = keystrokeData?.fontSize ?? DEFAULT_KEYSTROKE_DATA.fontSize ?? 14
  const displayDuration = keystrokeData?.displayDuration ?? DEFAULT_KEYSTROKE_DATA.displayDuration ?? 2000
  const position = keystrokeData?.position ?? DEFAULT_KEYSTROKE_DATA.position ?? KeystrokePosition.BottomCenter
  const borderRadius = keystrokeData?.borderRadius ?? DEFAULT_KEYSTROKE_DATA.borderRadius ?? 8
  const padding = keystrokeData?.padding ?? DEFAULT_KEYSTROKE_DATA.padding ?? 10
  const scale = keystrokeData?.scale ?? DEFAULT_KEYSTROKE_DATA.scale ?? 1
  const showModifierSymbols = keystrokeData?.showModifierSymbols ?? DEFAULT_KEYSTROKE_DATA.showModifierSymbols ?? true
  const fadeOutDuration = keystrokeData?.fadeOutDuration ?? DEFAULT_KEYSTROKE_DATA.fadeOutDuration ?? 400

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="p-3 bg-background/40 rounded-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium leading-none">Keystrokes</div>
            <div className="mt-1 text-[10px] text-muted-foreground leading-snug">
              Show keyboard input overlay
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
              {keystrokeEffects.length > 0 ? `${keystrokeEffects.length} blocks` : `${keyboardEventCount} events`}
            </div>
          </div>
          <Switch
            checked={hasEnabledKeystrokes}
            onCheckedChange={(checked) => {
              if (onBulkToggleKeystrokes) onBulkToggleKeystrokes(checked)
              else onEffectChange(EffectType.Keystroke, { ...keystrokeData, enabled: checked })
            }}
          />
        </div>
      </div>

      {hasEnabledKeystrokes && (
        <div className="p-3 bg-background/40 rounded-lg space-y-3">
          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Style</label>
            <div className="flex gap-1">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => onUpdateKeystroke({ stylePreset: s.value })}
                  className={cn(
                    "flex-1 py-1.5 text-[10px] font-medium rounded transition-all",
                    preset === s.value
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Position</label>
            <div className="flex gap-1">
              {POSITION_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onUpdateKeystroke({ position: p.value })}
                  className={cn(
                    "flex-1 py-1.5 text-[10px] font-medium rounded transition-all",
                    position === p.value
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Size</label>
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">{fontSize}px</span>
            </div>
            <Slider
              value={[fontSize]}
              onValueChange={([v]) => onUpdateKeystroke({ fontSize: v })}
              min={10}
              max={28}
              step={1}
              className="w-full"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Duration</label>
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">{(displayDuration / 1000).toFixed(1)}s</span>
            </div>
            <Slider
              value={[displayDuration]}
              onValueChange={([v]) => onUpdateKeystroke({ displayDuration: v })}
              min={500}
              max={5000}
              step={100}
              className="w-full"
            />
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between py-1 text-[10px] text-muted-foreground/80 hover:text-muted-foreground transition-colors"
          >
            <span>Advanced</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1 border-t border-border/20">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground">Corner Radius</label>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{borderRadius}px</span>
                </div>
                <Slider
                  value={[borderRadius]}
                  onValueChange={([v]) => onUpdateKeystroke({ borderRadius: v })}
                  min={0}
                  max={24}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Padding */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground">Padding</label>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{padding}px</span>
                </div>
                <Slider
                  value={[padding]}
                  onValueChange={([v]) => onUpdateKeystroke({ padding: v })}
                  min={4}
                  max={20}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Scale */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground">Scale</label>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{(scale * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[scale]}
                  onValueChange={([v]) => onUpdateKeystroke({ scale: v })}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
              </div>

              {/* Fade Duration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground">Fade Out</label>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{fadeOutDuration}ms</span>
                </div>
                <Slider
                  value={[fadeOutDuration]}
                  onValueChange={([v]) => onUpdateKeystroke({ fadeOutDuration: v })}
                  min={100}
                  max={1000}
                  step={50}
                  className="w-full"
                />
              </div>

              {/* Toggle: Modifier Symbols */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Use Symbols</label>
                  <InfoTooltip content="Show ⌘⌥⌃ instead of Cmd+Alt+Ctrl" />
                </div>
                <Switch
                  checked={showModifierSymbols}
                  onCheckedChange={(v) => onUpdateKeystroke({ showModifierSymbols: v })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

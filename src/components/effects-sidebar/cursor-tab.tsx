'use client'

import React from 'react'
import { MousePointer } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { CursorEffectData, Effect } from '@/types/project'
import { EffectType, CursorStyle } from '@/types'

interface CursorTabProps {
  cursorEffect: Effect | undefined
  onUpdateCursor: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
}

export function CursorTab({ cursorEffect, onUpdateCursor, onEffectChange }: CursorTabProps) {
  const cursorData = cursorEffect?.data as CursorEffectData

  return (
    <div className="space-y-4">
      {/* Master cursor visibility toggle */}
      <div className="p-3 bg-background/30 rounded-lg">
        <label className="flex items-center justify-between">
          <span className="text-xs">Show Cursor</span>
          <Switch
            checked={cursorEffect?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (cursorEffect) {
                onEffectChange(EffectType.Cursor, { ...cursorData, enabled: checked })
              } else {
                onEffectChange(EffectType.Cursor, {
                  style: CursorStyle.Default,
                  size: 3.0,
                  color: '#ffffff',
                  clickEffects: true,
                  motionBlur: false,
                  hideOnIdle: false,
                  idleTimeout: 3000,
                  enabled: checked
                })
              }
            }}
          />
        </label>
      </div>

      {/* Only show cursor settings when enabled */}
      {cursorEffect?.enabled && (
        <div className="space-y-3">
          <div className="p-1 bg-background/30 rounded-lg space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Size</label>
            <Slider
              value={[cursorData?.size ?? 3.0]}
              onValueChange={([value]) => onUpdateCursor({ size: value })}
              onValueCommit={([value]) => onUpdateCursor({ size: value })}
              min={0.5}
              max={8}
              step={0.1}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.size ?? 3.0).toFixed(1)}x</span>
          </div>

          <div className="p-1 bg-background/30 rounded-lg">
            <label className="flex items-center justify-between">
              <span className="text-xs">Click Animation</span>
              <Switch
                checked={cursorData?.clickEffects ?? false}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ clickEffects: checked })
                }
              />
            </label>
          </div>

          <div className="p-1 bg-background/30 rounded-lg">
            <label className="flex items-center justify-between">
              <span className="text-xs">Motion Blur</span>
              <Switch
                checked={cursorData?.motionBlur ?? false}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ motionBlur: checked })
                }
              />
            </label>
          </div>

          <div className="p-1 bg-background/30 rounded-lg">
            <label className="flex items-center justify-between">
              <span className="text-xs">Hide When Idle</span>
              <Switch
                checked={cursorData?.hideOnIdle ?? false}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ hideOnIdle: checked })
                }
              />
            </label>
          </div>

          {cursorData?.hideOnIdle && (
            <div className="p-1 bg-background/30 rounded-lg space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Idle Timeout</label>
              <Slider
                value={[(cursorData?.idleTimeout ?? 3000) / 1000]}
                onValueChange={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                onValueCommit={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                min={1}
                max={10}
                step={0.5}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{((cursorData?.idleTimeout ?? 3000) / 1000).toFixed(1)}s</span>
            </div>
          )}

          {/* Advanced Section */}
          <details className="space-y-2 pt-2">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer">Advanced</summary>
            <div className="p-1 bg-background/30 rounded-lg">
              <label className="flex items-center justify-between">
                <span className="text-xs">Gliding</span>
                <Switch
                  checked={cursorData?.gliding ?? true}
                  onCheckedChange={(checked) =>
                    onUpdateCursor({ gliding: checked })
                  }
                />
              </label>
            </div>
            <div className="p-1 bg-background/30 rounded-lg space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Speed</label>
              <Slider
                value={[cursorData?.speed ?? 0.5]}
                onValueChange={([value]) => onUpdateCursor({ speed: value })}
                min={0.1}
                max={1}
                step={0.05}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.speed ?? 0.5).toFixed(2)}</span>
            </div>
            <div className="p-1 bg-background/30 rounded-lg space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Smoothness</label>
              <Slider
                value={[cursorData?.smoothness ?? 0.5]}
                onValueChange={([value]) => onUpdateCursor({ smoothness: value })}
                min={0.1}
                max={1}
                step={0.05}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.smoothness ?? 0.5).toFixed(2)}</span>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}